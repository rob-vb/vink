import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { ACCESS_EXPIRED } from "./lib/googleSheetsAdapter";
import { decryptSecret } from "./lib/secrets";
import {
  addMembership,
  fakeGoogle,
  fakePdfStore,
  fakePipeline,
  newBackend,
  signUp,
  uploadAndExtract,
  type Recording,
} from "./test.setup";

vi.mock("./lib/google", async (original) => ({
  ...(await original<typeof import("./lib/google")>()),
  google: (await import("./test.setup")).fakeGoogle,
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

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-06T09:00:00Z"));
  vi.stubEnv("INTEGRATION_SECRETS_KEY", Buffer.alloc(32, 5).toString("base64"));
  vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "client-123.apps.googleusercontent.com");
  vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "client-secret");
  vi.stubEnv("SITE_URL", "https://vink.page");
  fakePdfStore.objects.clear();
  fakePipeline.reset();
  fakeGoogle.reset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

const fields = [
  { type: "text" as const, label: "Kenteken", key: "license_plate", required: true },
  {
    type: "list" as const,
    label: "Banden",
    key: "tyre_changes",
    required: false,
    fields: [
      { type: "text" as const, label: "Positie", key: "position", required: false },
      { type: "number" as const, label: "Profiel", key: "tread_depth_mm", required: false },
    ],
  },
  {
    type: "list" as const,
    label: "Velgen",
    key: "rims",
    required: false,
    fields: [{ type: "text" as const, label: "Maat", key: "size", required: false }],
  },
];

// Two tyre changes, no rims; everything clears review.
const tyreService: Recording = {
  reading: {
    vehicle: { license_plate: "OR18DH", _pages: [1] },
    tyre_changes: [
      { position: "2L1", depth: "3", _pages: [2] },
      { position: "2R1", depth: "4", _pages: [2] },
    ],
  },
  matches: { license_plate: { path: "vehicle.license_plate", probability: 0.97 } },
  lists: {
    tyre_changes: {
      path: "tyre_changes",
      probability: 0.96,
      keys: {
        position: { path: "position", probability: 0.99 },
        tread_depth_mm: { path: "depth", probability: 0.95 },
      },
    },
    rims: { path: null, probability: 0.92, keys: {} },
  },
  fills: {
    license_plate: "OR18DH",
    "tyre_changes[0].position": "2L1",
    "tyre_changes[0].tread_depth_mm": 3,
    "tyre_changes[1].position": "2R1",
    "tyre_changes[1].tread_depth_mm": 4,
  },
};

/** Ann, Admin of Acme Fleet, connects a Google account and gets a sheet. */
async function connected(t: Backend) {
  const ann = await signUp(t, "ann", "Acme Fleet");
  const organisationSlug = ann.slug;
  const { url } = await ann.user.action(api.googleSheets.connectUrl, { organisationSlug, name: "Tyre log" });
  const state = new URL(url).searchParams.get("state")!;
  expect(await ann.user.action(api.googleSheets.connect, { organisationSlug, state, code: "code-ann" })).toEqual({
    result: "connected",
  });
  const [integration] = await ann.user.query(api.integrations.list, { organisationSlug });
  const { formId } = await ann.user.mutation(api.forms.create, { organisationSlug, name: "Tyre service", fields });
  await ann.user.mutation(api.integrations.attach, { organisationSlug, integrationId: integration.id, formId });
  return { ...ann, organisationSlug, formId, integrationId: integration.id };
}

async function approve(t: Backend, ctx: Awaited<ReturnType<typeof connected>>) {
  fakePipeline.replay(tyreService);
  const documentId = (await uploadAndExtract(t, ctx.user, ctx.organisationSlug, ctx.formId, 2))!;
  await ctx.user.mutation(api.review.approve, { organisationSlug: ctx.organisationSlug, documentId });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  return documentId;
}

async function deliveryOf(t: Backend, ctx: Awaited<ReturnType<typeof connected>>, documentId: Id<"documents">) {
  const { deliveries } = await ctx.user.query(api.documents.get, {
    organisationSlug: ctx.organisationSlug,
    documentId,
  });
  expect(deliveries).toHaveLength(1);
  return deliveries[0];
}

test("an Admin is sent to Google's consent page for the files Vink makes, with offline access", async () => {
  const t = newBackend();
  const ann = await signUp(t, "ann", "Acme Fleet");
  const { url } = await ann.user.action(api.googleSheets.connectUrl, {
    organisationSlug: ann.slug,
    name: "Tyre log",
  });
  const consent = new URL(url);
  expect(consent.origin + consent.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
  expect(Object.fromEntries(consent.searchParams)).toMatchObject({
    client_id: "client-123.apps.googleusercontent.com",
    redirect_uri: "https://vink.page/api/integrations/google/callback",
    scope: "https://www.googleapis.com/auth/drive.file",
    access_type: "offline",
    response_type: "code",
  });
  expect(consent.searchParams.get("state")).toMatch(new RegExp(`^${ann.slug}\\.`));
});

test("connecting makes a sheet with the header row, lists its link and stores the token encrypted", async () => {
  const t = newBackend();
  const ann = await connected(t);
  expect(fakeGoogle.onlySheet()).toEqual({
    title: "Tyre log",
    header: ["document", "approved_at", "approved_by", "delivery_id"],
    rows: [],
  });
  expect(fakeGoogle.redirectUris).toEqual(["https://vink.page/api/integrations/google/callback"]);
  const [listed] = await ann.user.query(api.integrations.list, { organisationSlug: ann.organisationSlug });
  expect(listed).toMatchObject({
    name: "Tyre log",
    kind: "google_sheets",
    url: "https://docs.google.com/spreadsheets/d/sheet1/edit",
    forms: [{ name: "Tyre service" }],
  });
  const stored = await t.run(async (ctx) => await ctx.db.get(ann.integrationId));
  if (stored?.kind !== "google_sheets") throw new Error("not a Google Sheets Integration");
  expect(stored.refreshToken).not.toContain("refresh-ann");
  expect(await decryptSecret(stored.refreshToken)).toBe("refresh-ann");
});

test("a state from another Admin, another Organisation, or too long ago connects nothing", async () => {
  const t = newBackend();
  const ann = await signUp(t, "ann", "Acme Fleet");
  const bob = await signUp(t, "bob", "Bob Transport");
  await addMembership(t, "cas", ann.slug, "admin");
  const { url } = await ann.user.action(api.googleSheets.connectUrl, { organisationSlug: ann.slug, name: "Log" });
  const state = new URL(url).searchParams.get("state")!;
  const expired = "This Google sign-in has expired. Try again.";

  const cas = t.withIdentity({ subject: "cas", email: "cas@example.com" });
  await expect(cas.action(api.googleSheets.connect, { organisationSlug: ann.slug, state, code: "code-x" })).rejects.toThrow(expired);
  await expect(bob.user.action(api.googleSheets.connect, { organisationSlug: bob.slug, state, code: "code-x" })).rejects.toThrow(expired);
  await expect(
    ann.user.action(api.googleSheets.connect, { organisationSlug: ann.slug, state: state.replace(/.$/, "A"), code: "code-x" }),
  ).rejects.toThrow(expired);
  vi.advanceTimersByTime(16 * 60 * 1000);
  await expect(ann.user.action(api.googleSheets.connect, { organisationSlug: ann.slug, state, code: "code-x" })).rejects.toThrow(expired);

  expect(fakeGoogle.sheets.size).toBe(0);
});

test("a Member can't connect a Google account", async () => {
  const t = newBackend();
  const ann = await signUp(t, "ann", "Acme Fleet");
  const mia = await addMembership(t, "mia", ann.slug, "member");
  await expect(mia.action(api.googleSheets.connectUrl, { organisationSlug: ann.slug, name: "Log" })).rejects.toThrow(
    "Forbidden",
  );
});

test("consent without access to Vink's files connects nothing", async () => {
  const t = newBackend();
  const ann = await signUp(t, "ann", "Acme Fleet");
  const { url } = await ann.user.action(api.googleSheets.connectUrl, { organisationSlug: ann.slug, name: "Log" });
  fakeGoogle.scopes = [];
  const state = new URL(url).searchParams.get("state")!;
  expect(await ann.user.action(api.googleSheets.connect, { organisationSlug: ann.slug, state, code: "code-ann" })).toEqual({
    result: "no_access",
  });
  expect(await ann.user.query(api.integrations.list, { organisationSlug: ann.slug })).toEqual([]);
});

test("an Approval adds a row per tyre change, the second List as an empty cell", async () => {
  const t = newBackend();
  const ann = await connected(t);
  const documentId = await approve(t, ann);

  const delivery = await deliveryOf(t, ann, documentId);
  expect(delivery).toMatchObject({ state: "delivered", attempts: [{ status: 200, body: "2 rows added to the sheet" }] });
  const sheet = fakeGoogle.onlySheet();
  expect(sheet.header).toEqual([
    "document",
    "license_plate",
    "tyre_changes.position",
    "tyre_changes.tread_depth_mm",
    "rims",
    "approved_at",
    "approved_by",
    "delivery_id",
  ]);
  const document = { approved_at: expect.stringMatching(/^2026-10-06T\d\d:\d\d:\d\d\.\d{3}Z$/), approved_by: "ann@example.com" };
  expect(sheet.rows).toEqual([
    [expect.stringMatching(/\.pdf$/), "OR18DH", "2L1", 3, null, document.approved_at, document.approved_by, delivery.deliveryId],
    [expect.stringMatching(/\.pdf$/), "OR18DH", "2R1", 4, null, document.approved_at, document.approved_by, delivery.deliveryId],
  ]);
});

test("a Field added in a new Form Version gets a column just before approved_at", async () => {
  const t = newBackend();
  const ann = await connected(t);
  const first = await approve(t, ann);
  await ann.user.mutation(api.forms.save, {
    organisationSlug: ann.organisationSlug,
    formId: ann.formId,
    name: "Tyre service",
    fields: [...fields, { type: "text", label: "Werkplaats", key: "workshop", required: false }],
  });
  const second = await approve(t, ann);

  const sheet = fakeGoogle.onlySheet();
  expect(sheet.header.slice(4)).toEqual(["rims", "workshop", "approved_at", "approved_by", "delivery_id"]);
  expect(sheet.rows.map((r) => r.length)).toEqual([9, 9, 9, 9]);
  // The rows already there get an empty cell in the new column; delivery_id stays last.
  expect(sheet.rows.map((r) => r[5])).toEqual([null, null, null, null]);
  expect(sheet.rows.map((r) => r[8])).toEqual([
    (await deliveryOf(t, ann, first)).deliveryId,
    (await deliveryOf(t, ann, first)).deliveryId,
    (await deliveryOf(t, ann, second)).deliveryId,
    (await deliveryOf(t, ann, second)).deliveryId,
  ]);
});

test("a sheet in the old column order keeps it: values go by name, a new Field before approved_at", async () => {
  const t = newBackend();
  const ann = await connected(t);
  // The sheet as Vink made it before: Vink's columns first, then the Fields.
  const [stored] = fakeGoogle.sheets.values();
  stored.rows = [
    ["document", "approved_at", "approved_by", "delivery_id", "license_plate", "tyre_changes.position", "tyre_changes.tread_depth_mm"],
    ["old.pdf", "2026-10-01T08:00:00.000Z", "ann@example.com", "dlv_old", "OLD1", "1L", 5],
  ];
  // The first write lands, but its answer never arrives: the retry must find delivery_id by name.
  const append = fakeGoogle.append;
  fakeGoogle.append = async (...args) => {
    fakeGoogle.append = append;
    await append(...args);
    const { GoogleFailure } = await import("./lib/google");
    throw new GoogleFailure(null, "Google didn't answer within 15 s");
  };
  const documentId = await approve(t, ann);
  const { deliveryId, attempts } = await deliveryOf(t, ann, documentId);
  expect(attempts.at(-1)?.body).toBe("Already in the sheet: no rows added");

  const sheet = fakeGoogle.onlySheet();
  expect(sheet.header).toEqual([
    "document",
    "rims",
    "approved_at",
    "approved_by",
    "delivery_id",
    "license_plate",
    "tyre_changes.position",
    "tyre_changes.tread_depth_mm",
  ]);
  const approvedAt = expect.stringMatching(/^2026-10-06T/);
  expect(sheet.rows).toEqual([
    ["old.pdf", null, "2026-10-01T08:00:00.000Z", "ann@example.com", "dlv_old", "OLD1", "1L", 5],
    [expect.stringMatching(/\.pdf$/), null, approvedAt, "ann@example.com", deliveryId, "OR18DH", "2L1", 3],
    [expect.stringMatching(/\.pdf$/), null, approvedAt, "ann@example.com", deliveryId, "OR18DH", "2R1", 4],
  ]);
});

test("Google's rate limits and 5xx are retried", async () => {
  const t = newBackend();
  const ann = await connected(t);
  fakeGoogle.answer({ status: 429, retryAfter: "30" }, { status: 503 });
  const documentId = await approve(t, ann);

  const delivery = await deliveryOf(t, ann, documentId);
  expect(delivery.state).toBe("delivered");
  expect(delivery.attempts.map((a) => a.status)).toEqual([429, 503, 200]);
  expect(fakeGoogle.onlySheet().rows).toHaveLength(2);
});

test("a write Google refuses fails the Delivery with a clear reason", async () => {
  const t = newBackend();
  const ann = await connected(t);
  fakeGoogle.answer({ status: 403 });
  const documentId = await approve(t, ann);

  const delivery = await deliveryOf(t, ann, documentId);
  expect(delivery).toMatchObject({ state: "failed", failureReason: "Google refused the write (403)" });
  expect(delivery.attempts).toHaveLength(1);
});

test("a deleted sheet fails the Delivery at once", async () => {
  const t = newBackend();
  const ann = await connected(t);
  fakeGoogle.answer({ status: 404 });
  const documentId = await approve(t, ann);
  expect(await deliveryOf(t, ann, documentId)).toMatchObject({
    state: "failed",
    failureReason: "The sheet is gone: it, or its Vink tab, was deleted",
  });
});

test("access the Google account took back fails the Delivery at once as access expired", async () => {
  const t = newBackend();
  const ann = await connected(t);
  fakeGoogle.revoked.add("refresh-ann");
  const documentId = await approve(t, ann);

  const delivery = await deliveryOf(t, ann, documentId);
  expect(delivery).toMatchObject({ state: "failed", failureReason: ACCESS_EXPIRED });
  expect(delivery.attempts).toHaveLength(1);
  const notifications = await ann.user.query(api.notifications.list, { organisationSlug: ann.organisationSlug });
  expect(notifications[0].text).toMatch(/couldn't be delivered to Tyre log$/);
});

test("rows that reached the sheet before an answer got lost aren't added again", async () => {
  const t = newBackend();
  const ann = await connected(t);
  // The first write lands, but its answer never arrives.
  const append = fakeGoogle.append;
  fakeGoogle.append = async (...args) => {
    fakeGoogle.append = append;
    await append(...args);
    const { GoogleFailure } = await import("./lib/google");
    throw new GoogleFailure(null, "Google didn't answer within 15 s");
  };
  const documentId = await approve(t, ann);

  const delivery = await deliveryOf(t, ann, documentId);
  expect(delivery.state).toBe("delivered");
  expect(delivery.attempts.map((a) => a.body ?? a.error)).toEqual([
    "Google didn't answer within 15 s",
    "Already in the sheet: no rows added",
  ]);
  expect(fakeGoogle.onlySheet().rows).toHaveLength(2);
});

test("a re-send after a failure adds the rows once", async () => {
  const t = newBackend();
  const ann = await connected(t);
  fakeGoogle.answer({ status: 400 });
  const documentId = await approve(t, ann);
  const failed = await deliveryOf(t, ann, documentId);
  expect(failed.state).toBe("failed");

  await ann.user.mutation(api.deliveries.resend, { organisationSlug: ann.organisationSlug, id: failed.id });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect((await deliveryOf(t, ann, documentId)).state).toBe("delivered");
  expect(fakeGoogle.onlySheet().rows).toHaveLength(2);
});

test("a test-send adds dummy rows marked as test", async () => {
  const t = newBackend();
  const ann = await connected(t);
  const answer = await ann.user.action(api.integrations.testSend, {
    organisationSlug: ann.organisationSlug,
    integrationId: ann.integrationId,
    formId: ann.formId,
    mode: "examples",
  });
  expect(answer).toEqual({ ok: true, status: 200, body: "1 row added to the sheet", error: null });
  const [row] = fakeGoogle.onlySheet().rows;
  expect(row.slice(0, 5)).toEqual(["[test] example.pdf", "Example Kenteken", "Example Positie", 123.45, '[{"size":"Example Maat"}]']);
  expect(row.slice(5, 7)).toEqual(["2026-10-06T09:00:00.000Z", null]);
  expect(row[7]).toMatch(/^test_/);
});

test("a test-send while a Delivery writes to the sheet asks to try again, and writes nothing", async () => {
  const t = newBackend();
  const ann = await connected(t);
  const testSend = () =>
    ann.user.action(api.integrations.testSend, {
      organisationSlug: ann.organisationSlug,
      integrationId: ann.integrationId,
      formId: ann.formId,
      mode: "examples",
    });
  fakeGoogle.afterRead = async () => {
    await expect(testSend()).rejects.toThrow("Vink is writing to this Integration right now. Try again in a moment.");
  };
  await approve(t, ann);
  expect(fakeGoogle.onlySheet().rows).toHaveLength(2);
  // Once that send is done, it is the test-send's turn.
  expect(await testSend()).toMatchObject({ ok: true });
});

test("a Google Sheets Integration can be renamed, but has no endpoint or signing secret", async () => {
  const t = newBackend();
  const ann = await connected(t);
  const { organisationSlug, integrationId } = ann;
  await ann.user.mutation(api.integrations.rename, { organisationSlug, integrationId, name: "Banden" });
  expect((await ann.user.query(api.integrations.list, { organisationSlug }))[0].name).toBe("Banden");
  await expect(
    ann.user.mutation(api.integrations.update, { organisationSlug, integrationId, name: "x", url: "https://x.example", headers: [] }),
  ).rejects.toThrow("This Integration isn't a Webhook");
  await expect(ann.user.query(api.integrations.signingSecret, { organisationSlug, integrationId })).rejects.toThrow(
    "This Integration isn't a Webhook",
  );
});

test("access expired marks the Integration as needing reconnecting; other failures don't", async () => {
  const t = newBackend();
  const ann = await connected(t);
  const listed = async () => (await ann.user.query(api.integrations.list, { organisationSlug: ann.organisationSlug }))[0];
  fakeGoogle.answer({ status: 403 });
  await approve(t, ann);
  expect((await listed()).needsReconnect).toBe(false);

  fakeGoogle.revoked.add("refresh-ann");
  await approve(t, ann);
  expect((await listed()).needsReconnect).toBe(true);
});

/** Ann clicks Reconnect, signs in on Google's page as `code`'s account, and comes back. */
async function reconnect(ann: Awaited<ReturnType<typeof connected>>, code: string) {
  const { organisationSlug, integrationId } = ann;
  const { url } = await ann.user.action(api.integrations.reconnectUrl, { organisationSlug, integrationId });
  const consent = new URL(url);
  expect(consent.searchParams.get("redirect_uri")).toBe("https://vink.page/api/integrations/google/callback");
  const state = consent.searchParams.get("state")!;
  return await ann.user.action(api.googleSheets.connect, { organisationSlug, state, code });
}

test("after Reconnect, a re-send writes to the same sheet and skips rows already there", async () => {
  const t = newBackend();
  const ann = await connected(t);
  // The rows land, the answer gets lost, and then the account takes Vink's access back.
  const append = fakeGoogle.append;
  fakeGoogle.append = async (...args) => {
    fakeGoogle.append = append;
    await append(...args);
    fakeGoogle.revoked.add("refresh-ann");
    const { GoogleFailure } = await import("./lib/google");
    throw new GoogleFailure(null, "Google didn't answer within 15 s");
  };
  const first = await approve(t, ann);
  const second = await approve(t, ann);
  expect((await deliveryOf(t, ann, first)).failureReason).toBe(ACCESS_EXPIRED);
  expect((await deliveryOf(t, ann, second)).failureReason).toBe(ACCESS_EXPIRED);

  expect(await reconnect(ann, "code-ann")).toEqual({ result: "reconnected" });
  const [listed] = await ann.user.query(api.integrations.list, { organisationSlug: ann.organisationSlug });
  expect(listed).toMatchObject({ needsReconnect: false, url: "https://docs.google.com/spreadsheets/d/sheet1/edit" });

  for (const documentId of [first, second]) {
    const failed = await deliveryOf(t, ann, documentId);
    await ann.user.mutation(api.deliveries.resend, { organisationSlug: ann.organisationSlug, id: failed.id });
  }
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect((await deliveryOf(t, ann, first)).attempts.at(-1)?.body).toBe("Already in the sheet: no rows added");
  expect((await deliveryOf(t, ann, second)).attempts.at(-1)?.body).toBe("2 rows added to the sheet");
  expect(fakeGoogle.onlySheet().rows).toHaveLength(4);
});

test("Reconnect with a Google account that can't reach the sheet is refused and changes nothing", async () => {
  const t = newBackend();
  const ann = await connected(t);
  fakeGoogle.revoked.add("refresh-ann");
  await approve(t, ann);

  expect(await reconnect(ann, "code-bob")).toEqual({ result: "no_sheet_access" });
  const [listed] = await ann.user.query(api.integrations.list, { organisationSlug: ann.organisationSlug });
  expect(listed.needsReconnect).toBe(true);
  const stored = await t.run(async (ctx) => await ctx.db.get(ann.integrationId));
  if (stored?.kind !== "google_sheets") throw new Error("not a Google Sheets Integration");
  expect(await decryptSecret(stored.refreshToken)).toBe("refresh-ann");
  expect(fakeGoogle.sheets.size).toBe(1);
});

test("Reconnect without the Drive box ticked, or of another Organisation's Integration, does nothing", async () => {
  const t = newBackend();
  const ann = await connected(t);
  fakeGoogle.scopes = [];
  expect(await reconnect(ann, "code-ann")).toEqual({ result: "no_access" });

  const bob = await signUp(t, "bob", "Bob Transport");
  await expect(
    bob.user.action(api.integrations.reconnectUrl, { organisationSlug: bob.slug, integrationId: ann.integrationId }),
  ).rejects.toThrow("Integration not found");
});

test("a Webhook has no account to reconnect", async () => {
  const t = newBackend();
  const ann = await signUp(t, "ann", "Acme Fleet");
  const { integrationId } = await ann.user.mutation(api.integrations.create, {
    organisationSlug: ann.slug,
    name: "Hook",
    url: "https://example.com/hook",
    headers: [],
  });
  await expect(ann.user.action(api.integrations.reconnectUrl, { organisationSlug: ann.slug, integrationId })).rejects.toThrow(
    "This Integration has no account to reconnect",
  );
  expect((await ann.user.query(api.integrations.list, { organisationSlug: ann.slug }))[0].needsReconnect).toBe(false);
});

test("removing a Google Sheets Integration deletes its token and leaves the account's grant at Google alone", async () => {
  const t = newBackend();
  const ann = await connected(t);
  // The same Google account connects a sheet for another Organisation.
  const bob = await signUp(t, "bob", "Bob's Garage");
  const { url } = await bob.user.action(api.googleSheets.connectUrl, { organisationSlug: bob.slug, name: "Bob's log" });
  const state = new URL(url).searchParams.get("state")!;
  await bob.user.action(api.googleSheets.connect, { organisationSlug: bob.slug, state, code: "code-ann" });
  const { formId } = await bob.user.mutation(api.forms.create, { organisationSlug: bob.slug, name: "Tyre service", fields });
  const [bobsSheet] = await bob.user.query(api.integrations.list, { organisationSlug: bob.slug });

  await ann.user.mutation(api.integrations.remove, { organisationSlug: ann.organisationSlug, integrationId: ann.integrationId });
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  expect(await t.run(async (ctx) => await ctx.db.get(ann.integrationId))).toBeNull();
  const answer = await bob.user.action(api.integrations.testSend, {
    organisationSlug: bob.slug,
    integrationId: bobsSheet.id,
    formId,
    mode: "examples",
  });
  expect(answer.ok).toBe(true);
});
