import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  addMembership,
  fakeHttp,
  fakePdfStore,
  fakePipeline,
  newBackend,
  pdfWithPages,
  putToUploadUrl,
  signUp,
  type Recording,
} from "./test.setup";

vi.mock("./lib/http", async (original) => ({
  ...(await original<typeof import("./lib/http")>()),
  http: (await import("./test.setup")).fakeHttp,
}));
vi.mock("./lib/pdfStore", async () => ({
  pdfStore: (await import("./test.setup")).fakePdfStore,
}));
vi.mock("./lib/reader", async () => ({
  reader: (await import("./test.setup")).fakeReader,
}));
vi.mock("./lib/proposer", async () => ({
  proposer: (await import("./test.setup")).fakeProposer,
}));
vi.mock("./lib/matcher", async () => ({
  matcher: (await import("./test.setup")).fakeMatcher,
}));
vi.mock("./lib/filler", async () => ({
  filler: (await import("./test.setup")).fakeFiller,
}));
vi.mock("./lib/verifier", async () => ({
  verifier: (await import("./test.setup")).fakeVerifier,
}));

type Backend = ReturnType<typeof newBackend>;

const DAY = 24 * 60 * 60 * 1000;
const START = Date.parse("2026-09-01T09:00:00Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
  vi.stubEnv("INTEGRATION_SECRETS_KEY", Buffer.alloc(32, 4).toString("base64"));
  fakePdfStore.objects.clear();
  fakePipeline.reset();
  fakeHttp.reset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

const clean: Recording = {
  reading: { vehicle: { license_plate: "OR18DH", _pages: [1] } },
  matches: { license_plate: { path: "vehicle.license_plate", probability: 0.97 } },
  fills: { license_plate: "OR18DH" },
  proposal: [{ field: { type: "text", label: "Kenteken", key: "license_plate", required: false }, ticked: true }],
};

async function acme(t: Backend) {
  const ann = await signUp(t, "ann", "Acme Fleet");
  const organisationSlug = ann.slug;
  const { formId } = await ann.user.mutation(api.forms.create, {
    organisationSlug,
    name: "Work order",
    fields: [{ type: "text", label: "Kenteken", key: "license_plate", required: true }],
  });
  fakePipeline.replay(clean);
  const upload = async () => {
    const { key, url } = await ann.user.mutation(api.documents.generateUploadUrl, { organisationSlug });
    putToUploadUrl(url, await pdfWithPages(1));
    await ann.user.action(api.documents.create, { organisationSlug, formId, key, filename: "werkorder.pdf" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const documentId = await t.run(
      async (ctx) => (await ctx.db.query("documents").order("desc").first())!._id,
    );
    const on = { organisationSlug, documentId };
    return { key, on, read: () => ann.user.query(api.documents.get, on) };
  };
  return { ...ann, organisationSlug, formId, upload };
}

/** A day passes on the fake clock, and the daily cleanup runs. */
async function daysLater(t: Backend, days: number) {
  vi.setSystemTime(Date.now() + days * DAY);
  await t.mutation(internal.retention.run, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

async function stored(t: Backend, documentId: Id<"documents">) {
  return await t.run(async (ctx) => ({
    readings: (await ctx.db.query("readings").collect()).filter((r) => r.documentId === documentId).length,
    fieldValues: (await ctx.db.query("fieldValues").collect()).filter((f) => f.documentId === documentId).length,
  }));
}

test("a Document approved without an Integration keeps its data for 30 days after Approval, then only its metadata stays", async () => {
  const t = newBackend();
  const { user, upload } = await acme(t);
  const { key, on, read } = await upload();
  await user.mutation(api.review.approve, on);

  await daysLater(t, 29);
  expect(fakePdfStore.objects.has(key)).toBe(true);
  expect(await stored(t, on.documentId)).toEqual({ readings: 1, fieldValues: 1 });

  await daysLater(t, 2);
  expect(fakePdfStore.objects.has(key)).toBe(false);
  expect(await stored(t, on.documentId)).toEqual({ readings: 0, fieldValues: 0 });
  const document = await read();
  expect(document).toMatchObject({
    filename: "werkorder.pdf",
    state: "approved",
    dataDeleted: true,
    fieldValues: [],
    approval: { mode: "manual" },
  });
  expect(document.history.map((h) => h.event)).toEqual([
    "uploaded",
    "extracted",
    "approved",
    "data_deleted",
  ]);
  await expect(user.mutation(api.documents.pdfUrl, on)).rejects.toThrow("The PDF was deleted");
});

test("with an Integration, the days count from the last successful Delivery, using the Organisation's setting; the Delivery log stays", async () => {
  const t = newBackend();
  const { user, organisationSlug, formId, upload } = await acme(t);
  await user.mutation(api.organisations.updateRetention, { organisationSlug, retentionDays: 7 });
  const { integrationId } = await user.mutation(api.integrations.create, {
    organisationSlug,
    name: "Fleet",
    url: "https://fleet.example.com/in",
    headers: [],
  });
  await user.mutation(api.integrations.attach, { organisationSlug, integrationId, formId });
  const { key, on, read } = await upload();
  fakeHttp.answer({ status: 503 });
  await user.mutation(api.review.approve, on);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const deliveredAt = (await read()).deliveries[0].attempts.at(-1)!.at;

  vi.setSystemTime(deliveredAt + 6 * DAY);
  await t.mutation(internal.retention.run, {});
  expect(fakePdfStore.objects.has(key)).toBe(true);

  vi.setSystemTime(deliveredAt + 8 * DAY);
  await t.mutation(internal.retention.run, {});
  expect(fakePdfStore.objects.has(key)).toBe(false);
  const [delivery] = (await read()).deliveries;
  expect(delivery).toMatchObject({ state: "delivered", canResend: false });
  expect(delivery.attempts).toHaveLength(2);
});

test("a Document that never gets Approval goes after 90 days, leaving a deleted record", async () => {
  const t = newBackend();
  const { user, organisationSlug, upload } = await acme(t);
  fakePipeline.replay({ ...clean, matches: { license_plate: { path: "vehicle.license_plate", probability: 0.4 } } });
  const { key, read } = await upload();

  await daysLater(t, 89);
  expect((await read()).state).toBe("needs_review");

  await daysLater(t, 2);
  expect(fakePdfStore.objects.has(key)).toBe(false);
  expect(await read()).toMatchObject({ state: "deleted", dataDeleted: true });
  const { counts } = await user.query(api.documents.list, { organisationSlug, state: "needs_review" });
  expect(counts.needs_review).toBe(0);
});

test("a Rejected Document's data goes 30 days after Reject, and it can no longer be reopened", async () => {
  const t = newBackend();
  const { user, upload } = await acme(t);
  const { key, on, read } = await upload();
  await daysLater(t, 50);
  await user.mutation(api.rejection.reject, { ...on, reason: "Duplicate" });

  await daysLater(t, 29);
  expect(fakePdfStore.objects.has(key)).toBe(true);

  await daysLater(t, 2);
  expect(fakePdfStore.objects.has(key)).toBe(false);
  expect(await read()).toMatchObject({
    state: "rejected",
    dataDeleted: true,
    rejection: { reason: "Duplicate" },
  });
  await expect(user.mutation(api.rejection.reopen, on)).rejects.toThrow(
    "This Document's PDF is gone, so it can't be reopened",
  );
});

test("an unsaved Form Proposal goes after 7 days, with its PDF and Reading", async () => {
  const t = newBackend();
  const { user, organisationSlug } = await acme(t);
  const { key, url } = await user.mutation(api.documents.generateUploadUrl, { organisationSlug });
  putToUploadUrl(url, await pdfWithPages(1));
  const { proposalId } = await user.action(api.formProposals.create, {
    organisationSlug,
    key,
    filename: "voorbeeld.pdf",
  });
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  await daysLater(t, 6);
  expect((await user.query(api.formProposals.get, { organisationSlug, proposalId })).state).toBe("ready");

  await daysLater(t, 2);
  expect(fakePdfStore.objects.has(key)).toBe(false);
  await expect(user.query(api.formProposals.get, { organisationSlug, proposalId })).rejects.toThrow(
    "Form Proposal not found",
  );
});

test("an Admin sets the days after Delivery; a Member can't", async () => {
  const t = newBackend();
  const { user, organisationSlug } = await acme(t);
  const bob = await addMembership(t, "bob", organisationSlug, "member");
  expect(await user.query(api.organisations.settings, { organisationSlug })).toEqual({
    name: "Acme Fleet",
    retentionDays: 30,
  });

  await user.mutation(api.organisations.updateRetention, { organisationSlug, retentionDays: 14 });

  expect((await user.query(api.organisations.settings, { organisationSlug })).retentionDays).toBe(14);
  await expect(
    bob.mutation(api.organisations.updateRetention, { organisationSlug, retentionDays: 365 }),
  ).rejects.toThrow("Forbidden");
  await expect(
    user.mutation(api.organisations.updateRetention, { organisationSlug, retentionDays: 0 }),
  ).rejects.toThrow("from 1 to 365 days");
  await expect(
    user.mutation(api.organisations.updateRetention, { organisationSlug, retentionDays: 366 }),
  ).rejects.toThrow("from 1 to 365 days");
  await user.mutation(api.organisations.updateRetention, { organisationSlug, retentionDays: 365 });
  expect((await user.query(api.organisations.settings, { organisationSlug })).retentionDays).toBe(365);
});

test("when every Delivery ends failed, the days count from the last attempt, so the data isn't kept forever", async () => {
  const t = newBackend();
  const { user, organisationSlug, formId, upload } = await acme(t);
  await user.mutation(api.organisations.updateRetention, { organisationSlug, retentionDays: 7 });
  for (const name of ["Fleet", "Ledger"]) {
    const { integrationId } = await user.mutation(api.integrations.create, {
      organisationSlug,
      name,
      url: `https://${name.toLowerCase()}.example.com/in`,
      headers: [],
    });
    await user.mutation(api.integrations.attach, { organisationSlug, integrationId, formId });
  }
  const { key, on, read } = await upload();
  // Fleet refuses at once; Ledger is down, and is retried until it gives up.
  fakeHttp.answer({ status: 400 }, ...Array.from({ length: 6 }, () => ({ status: 503 })));
  await user.mutation(api.review.approve, on);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const deliveries = (await read()).deliveries;
  expect(deliveries.map((d) => d.state)).toEqual(["failed", "failed"]);
  const lastAttempt = Math.max(...deliveries.flatMap((d) => d.attempts.map((a) => a.at)));

  vi.setSystemTime(lastAttempt + 6 * DAY);
  await t.mutation(internal.retention.run, {});
  expect(fakePdfStore.objects.has(key)).toBe(true);

  vi.setSystemTime(lastAttempt + 8 * DAY);
  await t.mutation(internal.retention.run, {});
  expect(fakePdfStore.objects.has(key)).toBe(false);
  expect(await read()).toMatchObject({ state: "approved", dataDeleted: true });
});

test("while one Delivery is still retrying, a failed one doesn't start the clock", async () => {
  const t = newBackend();
  const { user, organisationSlug, formId, upload } = await acme(t);
  await user.mutation(api.organisations.updateRetention, { organisationSlug, retentionDays: 1 });
  for (const name of ["Fleet", "Ledger"]) {
    const { integrationId } = await user.mutation(api.integrations.create, {
      organisationSlug,
      name,
      url: `https://${name.toLowerCase()}.example.com/in`,
      headers: [],
    });
    await user.mutation(api.integrations.attach, { organisationSlug, integrationId, formId });
  }
  const { key, on, read } = await upload();
  fakeHttp.answer({ status: 400 }, { status: 503 });
  await user.mutation(api.review.approve, on);
  // Only the first attempts: Ledger now waits about a minute to retry.
  await vi.advanceTimersByTimeAsync(0);
  await t.finishInProgressScheduledFunctions();

  expect((await read()).deliveries.map((d) => d.state)).toEqual(["failed", "retrying"]);

  vi.setSystemTime(Date.now() + 2 * DAY);
  await t.mutation(internal.retention.run, {});
  expect(fakePdfStore.objects.has(key)).toBe(true);
});

test("a retention above 365 days, set before the maximum, counts as 365 and is clamped by the migration", async () => {
  const t = newBackend();
  const { user, organisationSlug, upload } = await acme(t);
  await t.run(async (ctx) => {
    const organisation = (await ctx.db.query("organisations").first())!;
    await ctx.db.patch(organisation._id, { retentionDays: 3650 });
  });
  expect((await user.query(api.organisations.settings, { organisationSlug })).retentionDays).toBe(365);
  const { key, on } = await upload();
  await user.mutation(api.review.approve, on);

  await daysLater(t, 364);
  expect(fakePdfStore.objects.has(key)).toBe(true);
  await daysLater(t, 2);
  expect(fakePdfStore.objects.has(key)).toBe(false);

  await t.mutation(internal.organisations.clampRetention, {});
  const stored = await t.run(async (ctx) => (await ctx.db.query("organisations").first())!.retentionDays);
  expect(stored).toBe(365);
});

test("an upload that never became a Document is deleted after 24 hours; used uploads stay", async () => {
  const t = newBackend();
  const { user, organisationSlug, upload } = await acme(t);
  const orphan = await user.mutation(api.documents.generateUploadUrl, { organisationSlug });
  putToUploadUrl(orphan.url, await pdfWithPages(1));
  const document = await upload();
  const sample = await user.mutation(api.documents.generateUploadUrl, { organisationSlug });
  putToUploadUrl(sample.url, await pdfWithPages(1));
  await user.action(api.formProposals.create, { organisationSlug, key: sample.key, filename: "voorbeeld.pdf" });
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  vi.setSystemTime(Date.now() + 23 * 60 * 60 * 1000);
  await t.mutation(internal.retention.run, {});
  expect(fakePdfStore.objects.has(orphan.key)).toBe(true);
  const fresh = await user.mutation(api.documents.generateUploadUrl, { organisationSlug });
  putToUploadUrl(fresh.url, await pdfWithPages(1));

  vi.setSystemTime(Date.now() + 2 * 60 * 60 * 1000);
  await t.mutation(internal.retention.run, {});
  expect(fakePdfStore.objects.has(orphan.key)).toBe(false);
  expect(fakePdfStore.objects.has(fresh.key)).toBe(true);
  expect(fakePdfStore.objects.has(document.key)).toBe(true);
  expect(fakePdfStore.objects.has(sample.key)).toBe(true);
});
