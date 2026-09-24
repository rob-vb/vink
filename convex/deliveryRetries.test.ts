import { createHmac } from "node:crypto";
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

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const APPROVED_AT = Date.parse("2026-09-24T12:00:00Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("INTEGRATION_SECRETS_KEY", Buffer.alloc(32, 9).toString("base64"));
  fakePdfStore.objects.clear();
  fakePipeline.reset();
  fakeHttp.reset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

const workOrder: Recording = {
  reading: { vehicle: { licensePlate: "OR18DH", _pages: [1] } },
  matches: { licensePlate: { path: "vehicle.licensePlate", probability: 0.97 } },
  fills: { licensePlate: "OR18DH" },
};

/** Lets time pass, and runs whatever the scheduler has due by then. */
async function after(t: Backend, ms: number) {
  await vi.advanceTimersByTimeAsync(ms);
  await t.finishInProgressScheduledFunctions();
}

async function acme(t: Backend) {
  const ann = await signUp(t, "ann", "Acme Fleet");
  const organisationSlug = ann.slug;
  const { formId } = await ann.user.mutation(api.forms.create, {
    organisationSlug,
    name: "Work order",
    fields: [{ type: "text", label: "Kenteken", key: "licensePlate", required: true }],
  });
  const { integrationId } = await ann.user.mutation(api.integrations.create, {
    organisationSlug,
    name: "Fleet system",
    url: "https://fleet.example.com/in",
    headers: [{ name: "Authorization", value: "Bearer old-token", secret: true }],
  });
  return { ...ann, organisationSlug, formId, integrationId };
}

/** An approved Document of the Form; the first attempt has been made. */
async function approve(t: Backend, acmeOrg: Awaited<ReturnType<typeof acme>>) {
  const { user, organisationSlug, formId } = acmeOrg;
  fakePipeline.replay(workOrder);
  const documentId = (await uploadAndExtract(t, user, organisationSlug, formId)) as Id<"documents">;
  vi.setSystemTime(APPROVED_AT);
  await user.mutation(api.review.approve, { organisationSlug, documentId });
  await after(t, 0);
  const delivery = async () =>
    (await user.query(api.documents.get, { organisationSlug, documentId })).deliveries[0];
  return { documentId, delivery };
}

async function attachedAndApproved(t: Backend) {
  const acmeOrg = await acme(t);
  await acmeOrg.user.mutation(api.integrations.attach, {
    organisationSlug: acmeOrg.organisationSlug,
    integrationId: acmeOrg.integrationId,
    formId: acmeOrg.formId,
  });
  return { ...acmeOrg, ...(await approve(t, acmeOrg)) };
}

test("a 5xx is retried after about a minute, with the same deliveryId and a fresh signature", async () => {
  const t = newBackend();
  fakeHttp.answer({ status: 503, body: "down" }, { status: 200 });
  const { user, organisationSlug, integrationId, delivery } = await attachedAndApproved(t);

  const waiting = await delivery();
  expect(waiting).toMatchObject({ state: "retrying", failureReason: "The receiver answered 503" });
  expect(waiting.nextAttemptAt).toBeGreaterThanOrEqual(APPROVED_AT + MINUTE);
  expect(waiting.nextAttemptAt).toBeLessThanOrEqual(APPROVED_AT + 1.1 * MINUTE);

  await after(t, 1.1 * MINUTE);

  expect((await delivery()).state).toBe("delivered");
  const { secret } = await user.query(api.integrations.signingSecret, { organisationSlug, integrationId });
  expect(fakeHttp.requests).toHaveLength(2);
  for (const request of fakeHttp.requests) {
    expect(JSON.parse(request.body).deliveryId).toBe(waiting.deliveryId);
    expect(request.headers["X-DocuHelper-Signature"]).toBe(
      `sha256=${createHmac("sha256", secret).update(request.body).digest("hex")}`,
    );
  }
});

test("retries follow the backoff schedule for about 8 hours, then the Delivery fails and Admins are notified", async () => {
  const t = newBackend();
  const always503 = Array.from({ length: 6 }, () => ({ status: 503 }));
  fakeHttp.answer(...always503);
  const acmeOrg = await acme(t);
  const bob = await addMembership(t, "bob", acmeOrg.organisationSlug, "member");
  await acmeOrg.user.mutation(api.integrations.attach, {
    organisationSlug: acmeOrg.organisationSlug,
    integrationId: acmeOrg.integrationId,
    formId: acmeOrg.formId,
  });
  const { delivery } = await approve(t, acmeOrg);

  const gaps: number[] = [];
  for (const expected of [MINUTE, 5 * MINUTE, 30 * MINUTE, 2 * HOUR, 6 * HOUR]) {
    const { nextAttemptAt, attempts } = await delivery();
    const gap = nextAttemptAt! - attempts.at(-1)!.at;
    expect(gap).toBeGreaterThanOrEqual(expected);
    expect(gap).toBeLessThanOrEqual(expected * 1.1);
    gaps.push(gap);
    await after(t, gap);
  }

  expect(fakeHttp.requests).toHaveLength(6);
  expect(await delivery()).toMatchObject({
    state: "failed",
    failureReason: "Gave up after 6 attempts: the receiver answered 503",
    nextAttemptAt: null,
  });
  const total = gaps.reduce((a, b) => a + b, 0);
  expect(total).toBeGreaterThan(8 * HOUR);
  const notifications = await acmeOrg.user.query(api.notifications.list, {
    organisationSlug: acmeOrg.organisationSlug,
  });
  expect(notifications).toEqual([
    expect.objectContaining({
      text: "werkorder.pdf couldn't be delivered to Fleet system",
      read: false,
    }),
  ]);
  await expect(
    bob.query(api.notifications.list, { organisationSlug: acmeOrg.organisationSlug }),
  ).rejects.toThrow("Forbidden");
});

test("a Retry-After longer than the next step is honoured", async () => {
  const t = newBackend();
  fakeHttp.answer({ status: 429, retryAfter: "900" });
  const { delivery } = await attachedAndApproved(t);

  const { nextAttemptAt, state } = await delivery();
  expect(state).toBe("retrying");
  expect(nextAttemptAt).toBe(APPROVED_AT + 900_000);
});

test("a Retry-After given as a date is honoured too", async () => {
  const t = newBackend();
  fakeHttp.answer({ status: 503, retryAfter: new Date(APPROVED_AT + 20 * MINUTE).toUTCString() });
  const { delivery } = await attachedAndApproved(t);

  expect((await delivery()).nextAttemptAt).toBe(APPROVED_AT + 20 * MINUTE);
});

test.each([
  ["a timeout", { fail: "timeout" as const }],
  ["a network error", { fail: "network" as const }],
  ["a 408", { status: 408 }],
])("%s is retried", async (_, answer) => {
  const t = newBackend();
  fakeHttp.answer(answer);
  const { delivery } = await attachedAndApproved(t);

  expect((await delivery()).state).toBe("retrying");
});

test("a fix to the URL or headers is used by the next retry", async () => {
  const t = newBackend();
  fakeHttp.answer({ status: 503 });
  const { user, organisationSlug, integrationId } = await attachedAndApproved(t);

  await user.mutation(api.integrations.update, {
    organisationSlug,
    integrationId,
    name: "Fleet system",
    url: "https://fleet.example.com/v2/in",
    headers: [{ name: "Authorization", value: "Bearer new-token", secret: true }],
  });
  await after(t, 1.1 * MINUTE);

  expect(fakeHttp.requests[1]).toMatchObject({
    url: "https://fleet.example.com/v2/in",
    headers: { Authorization: "Bearer new-token" },
  });
});

test("an Admin re-sends a failed Delivery by hand, with the same deliveryId and the current configuration", async () => {
  const t = newBackend();
  fakeHttp.answer({ status: 400, body: "bad" });
  const { user, organisationSlug, integrationId, delivery } = await attachedAndApproved(t);
  const failed = await delivery();
  expect(failed.state).toBe("failed");
  await user.mutation(api.integrations.update, {
    organisationSlug,
    integrationId,
    name: "Fleet system",
    url: "https://fleet.example.com/fixed",
    headers: [{ name: "Authorization", value: null, secret: true }],
  });

  await user.mutation(api.deliveries.resend, { organisationSlug, id: failed.id });
  await after(t, 0);

  expect((await delivery()).state).toBe("delivered");
  expect(fakeHttp.requests[1].url).toBe("https://fleet.example.com/fixed");
  expect(JSON.parse(fakeHttp.requests[1].body).deliveryId).toBe(failed.deliveryId);
  await expect(user.mutation(api.deliveries.resend, { organisationSlug, id: failed.id })).rejects.toThrow(
    "Only a failed Delivery can be sent again",
  );
});

test("a Member can't re-send a Delivery", async () => {
  const t = newBackend();
  fakeHttp.answer({ status: 400 });
  const { organisationSlug, delivery } = await attachedAndApproved(t);
  const bob = await addMembership(t, "bob", organisationSlug, "member");

  await expect(
    bob.mutation(api.deliveries.resend, { organisationSlug, id: (await delivery()).id }),
  ).rejects.toThrow("Forbidden");
});

test.each(["detach", "remove"] as const)(
  "on %s, open Deliveries fail with \"Integration removed\" and can't be re-sent",
  async (how) => {
    const t = newBackend();
    fakeHttp.answer({ status: 503 });
    const { user, organisationSlug, integrationId, formId, delivery } = await attachedAndApproved(t);

    if (how === "detach") {
      await user.mutation(api.integrations.detach, { organisationSlug, integrationId, formId });
    } else {
      await user.mutation(api.integrations.remove, { organisationSlug, integrationId });
    }
    await after(t, 7 * HOUR);

    const removed = await delivery();
    expect(removed).toMatchObject({ state: "failed", failureReason: "Integration removed" });
    expect(fakeHttp.requests).toHaveLength(1);
    await expect(
      user.mutation(api.deliveries.resend, { organisationSlug, id: removed.id }),
    ).rejects.toThrow("Integration removed");
  },
);

test("attaching an Integration later sends nothing for Documents approved before", async () => {
  const t = newBackend();
  const acmeOrg = await acme(t);
  const { delivery } = await approve(t, acmeOrg);

  await acmeOrg.user.mutation(api.integrations.attach, {
    organisationSlug: acmeOrg.organisationSlug,
    integrationId: acmeOrg.integrationId,
    formId: acmeOrg.formId,
  });
  await after(t, HOUR);

  expect(await delivery()).toBeUndefined();
  expect(fakeHttp.requests).toEqual([]);
});

test("an Admin marks notifications read", async () => {
  const t = newBackend();
  fakeHttp.answer({ status: 400 });
  const { user, organisationSlug } = await attachedAndApproved(t);
  expect(await user.query(api.notifications.unreadCount, { organisationSlug })).toBe(1);

  await user.mutation(api.notifications.markAllRead, { organisationSlug });

  expect(await user.query(api.notifications.unreadCount, { organisationSlug })).toBe(0);
  expect((await user.query(api.notifications.list, { organisationSlug }))[0].read).toBe(true);
});
