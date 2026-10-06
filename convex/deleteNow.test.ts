import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  addMembership,
  fakeHttp,
  fakePdfStore,
  fakePipeline,
  newBackend,
  signUp,
  uploadAndExtract,
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

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-24T12:00:00Z"));
  vi.stubEnv("INTEGRATION_SECRETS_KEY", Buffer.alloc(32, 5).toString("base64"));
  fakePdfStore.objects.clear();
  fakePipeline.reset();
  fakeHttp.reset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

const invoice: Recording = {
  reading: { invoice: { number: "F-2026-118", total: "1.249,50", _pages: [1] } },
  matches: {
    invoice_number: { path: "invoice.number", probability: 0.97 },
    total: { path: "invoice.total", probability: 0.4 },
  },
  fills: { invoice_number: "F-2026-118", total: 1249.5 },
};

/** Kantoor Noord with an invoice Form sending to one Integration, and one extracted invoice. */
async function kantoorNoord(t: Backend) {
  const ann = await signUp(t, "ann", "Kantoor Noord");
  const organisationSlug = ann.slug;
  const { formId } = await ann.user.mutation(api.forms.create, {
    organisationSlug,
    name: "Invoice",
    fields: [
      { type: "text", label: "Invoice number", key: "invoice_number", required: true },
      { type: "number", label: "Total", key: "total", required: false },
    ],
  });
  const { integrationId } = await ann.user.mutation(api.integrations.create, {
    organisationSlug,
    name: "Bookkeeping",
    url: "https://books.example.com/in",
    headers: [],
  });
  await ann.user.mutation(api.integrations.attach, { organisationSlug, integrationId, formId });
  fakePipeline.replay(invoice);
  const documentId = (await uploadAndExtract(t, ann.user, organisationSlug, formId)) as Id<"documents">;
  const key = await t.run(async (ctx) => (await ctx.db.get(documentId))!.key);
  const on = { organisationSlug, documentId };
  const read = () => ann.user.query(api.documents.get, on);
  const approve = async () => {
    const total = (await read()).fieldValues.find((f) => f.key === "total")!;
    await ann.user.mutation(api.review.check, { organisationSlug, fieldValueId: total.id });
    await ann.user.mutation(api.review.approve, on);
  };
  return { ...ann, organisationSlug, key, on, read, approve };
}

async function leftovers(t: Backend, documentId: Id<"documents">) {
  return await t.run(async (ctx) => {
    const of = <T extends { documentId: Id<"documents"> }>(rows: T[]) =>
      rows.filter((r) => r.documentId === documentId).length;
    const deliveries = (await ctx.db.query("deliveries").collect()).filter((d) => d.documentId === documentId);
    return {
      readings: of(await ctx.db.query("readings").collect()),
      fieldValues: of(await ctx.db.query("fieldValues").collect()),
      listValues: of(await ctx.db.query("listValues").collect()),
      envelopes: deliveries.filter((d) => d.envelope !== undefined).length,
      responseBodies: deliveries.flatMap((d) => d.attempts).filter((a) => a.body !== null).length,
    };
  });
}

const nothingLeft = { readings: 0, fieldValues: 0, listValues: 0, envelopes: 0, responseBodies: 0 };

test("an Admin deletes an Approved, delivered Document now: its data and the receiver's response bodies go, the short record stays", async () => {
  const t = newBackend();
  const { user, key, on, read, approve } = await kantoorNoord(t);
  fakeHttp.answer({ status: 200, body: '{"booked":"F-2026-118"}' });
  await approve();
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect((await leftovers(t, on.documentId)).responseBodies).toBe(1);

  await user.mutation(api.rejection.remove, on);

  expect(fakePdfStore.objects.has(key)).toBe(false);
  expect(await leftovers(t, on.documentId)).toEqual(nothingLeft);
  const document = await read();
  expect(document).toMatchObject({
    filename: "werkorder.pdf",
    state: "approved",
    dataDeleted: true,
    dataDeletedBy: "ann@example.com",
    fieldValues: [],
    approval: { mode: "manual", by: "ann@example.com" },
  });
  expect(document.deliveries).toEqual([
    expect.objectContaining({ integrationName: "Bookkeeping", state: "delivered", canResend: false }),
  ]);
  expect(document.deliveries[0].attempts).toEqual([
    expect.objectContaining({ status: 200, body: null }),
  ]);
  expect(document.history.at(-1)).toMatchObject({ event: "deleted", by: "ann@example.com" });
  await expect(user.mutation(api.documents.pdfUrl, on)).rejects.toThrow("The PDF was deleted");
  const { documents } = await user.query(api.documents.list, {
    organisationSlug: on.organisationSlug,
    state: "approved",
  });
  expect(documents).toEqual([expect.objectContaining({ filename: "werkorder.pdf", uploadedBy: "ann@example.com" })]);
});

test("deleting a Document whose Delivery is waiting to retry cancels it: the data is never sent afterwards", async () => {
  const t = newBackend();
  const { user, on, read, approve } = await kantoorNoord(t);
  fakeHttp.answer({ status: 503, body: "down" });
  await approve();
  // Only the first attempt: the retry waits about a minute.
  await vi.advanceTimersByTimeAsync(0);
  await t.finishInProgressScheduledFunctions();
  expect((await read()).deliveries[0].state).toBe("retrying");

  await user.mutation(api.rejection.remove, on);
  vi.advanceTimersByTime(24 * HOUR);
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  expect(fakeHttp.requests).toHaveLength(1);
  const [delivery] = (await read()).deliveries;
  expect(delivery).toMatchObject({
    state: "failed",
    failureReason: "Cancelled: the Document was deleted",
    nextAttemptAt: null,
    canResend: false,
  });
  expect(await leftovers(t, on.documentId)).toEqual(nothingLeft);
  await expect(user.mutation(api.deliveries.resend, { ...on, id: delivery.id })).rejects.toThrow();
});

test("a pending Delivery not yet attempted is cancelled too", async () => {
  const t = newBackend();
  const { user, on, read, approve } = await kantoorNoord(t);
  await approve();

  await user.mutation(api.rejection.remove, on);
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  expect(fakeHttp.requests).toEqual([]);
  expect((await read()).deliveries[0]).toMatchObject({ state: "failed", attempts: [] });
});

test("a Document in Needs Review can be deleted now; it leaves a Deleted record", async () => {
  const t = newBackend();
  const { user, key, on, read } = await kantoorNoord(t);

  await user.mutation(api.rejection.remove, on);

  expect(fakePdfStore.objects.has(key)).toBe(false);
  expect(await read()).toMatchObject({ state: "deleted", dataDeleted: true, fieldValues: [] });
  expect(await leftovers(t, on.documentId)).toEqual(nothingLeft);
  const { counts } = await user.query(api.documents.list, {
    organisationSlug: on.organisationSlug,
    state: "needs_review",
  });
  expect(counts.needs_review).toBe(0);
});

test("a Document already deleted can't be deleted again", async () => {
  const t = newBackend();
  const { user, on, approve } = await kantoorNoord(t);
  await approve();
  await user.mutation(api.rejection.remove, on);

  await expect(user.mutation(api.rejection.remove, on)).rejects.toThrow("already deleted");
});

test("a Member can't delete a Document", async () => {
  const t = newBackend();
  const { key, on, read, organisationSlug } = await kantoorNoord(t);
  const bob = await addMembership(t, "bob", organisationSlug, "member");

  await expect(bob.mutation(api.rejection.remove, on)).rejects.toThrow("Forbidden");
  expect(fakePdfStore.objects.has(key)).toBe(true);
  expect((await read()).dataDeleted).toBe(false);
});

test("an Admin of another Organisation can't delete it", async () => {
  const t = newBackend();
  const { key, on, read } = await kantoorNoord(t);
  const eve = await signUp(t, "eve", "Het Anker");

  await expect(
    eve.user.mutation(api.rejection.remove, { organisationSlug: eve.slug, documentId: on.documentId }),
  ).rejects.toThrow("Document not found");
  expect(fakePdfStore.objects.has(key)).toBe(true);
  expect((await read()).dataDeleted).toBe(false);
});
