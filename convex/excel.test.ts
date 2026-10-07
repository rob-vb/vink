import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { ACCESS_EXPIRED } from "./lib/excelAdapter";
import { decryptSecret } from "./lib/secrets";
import {
  addMembership,
  fakeMicrosoft,
  fakePdfStore,
  fakePipeline,
  newBackend,
  signUp,
  uploadAndExtract,
  type Recording,
} from "./test.setup";

vi.mock("./lib/microsoft", async (original) => ({
  ...(await original<typeof import("./lib/microsoft")>()),
  microsoft: (await import("./test.setup")).fakeMicrosoft,
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
  vi.stubEnv("MICROSOFT_OAUTH_CLIENT_ID", "app-123");
  vi.stubEnv("MICROSOFT_OAUTH_CLIENT_SECRET", "client-secret");
  vi.stubEnv("SITE_URL", "https://vink.page");
  fakePdfStore.objects.clear();
  fakePipeline.reset();
  fakeMicrosoft.reset();
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

/** Ann, Admin of Acme Fleet, connects her Microsoft 365 account and gets a workbook. */
async function connected(t: Backend) {
  const ann = await signUp(t, "ann", "Acme Fleet");
  const organisationSlug = ann.slug;
  const { url } = await ann.user.action(api.excel.connectUrl, { organisationSlug, name: "Tyre log" });
  const state = new URL(url).searchParams.get("state")!;
  expect(await ann.user.action(api.excel.connect, { organisationSlug, state, code: "code-ann" })).toEqual({
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

async function deliveryRow(t: Backend, documentId: Id<"documents">) {
  return await t.run(
    async (ctx) => await ctx.db.query("deliveries").withIndex("by_documentId", (q) => q.eq("documentId", documentId)).unique(),
  );
}

async function storedToken(t: Backend, integrationId: Id<"integrations">) {
  const stored = await t.run(async (ctx) => await ctx.db.get(integrationId));
  if (stored?.kind !== "excel") throw new Error("not an Excel Integration");
  return await decryptSecret(stored.refreshToken);
}

test("an Admin is sent to Microsoft's work-account sign-in, asking for offline access to their files", async () => {
  const t = newBackend();
  const ann = await signUp(t, "ann", "Acme Fleet");
  const { url } = await ann.user.action(api.excel.connectUrl, { organisationSlug: ann.slug, name: "Tyre log" });
  const consent = new URL(url);
  expect(consent.origin + consent.pathname).toBe(
    "https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize",
  );
  expect(Object.fromEntries(consent.searchParams)).toMatchObject({
    client_id: "app-123",
    redirect_uri: "https://vink.page/api/integrations/microsoft/callback",
    response_type: "code",
    response_mode: "query",
    scope: "offline_access https://graph.microsoft.com/Files.ReadWrite",
  });
  // Never forced consent: in a tenant where only the IT admin consents, that would block everyone.
  expect(consent.searchParams.get("prompt")).not.toBe("consent");
  expect(consent.searchParams.get("state")).toMatch(new RegExp(`^${ann.slug}\\.`));
});

test("connecting makes a workbook with a table of the header row, lists its link and stores the token encrypted", async () => {
  const t = newBackend();
  const ann = await connected(t);
  expect(fakeMicrosoft.onlyWorkbook()).toEqual({
    title: "Tyre log",
    header: ["document", "approved_at", "approved_by", "delivery_id"],
    rows: [],
  });
  expect(fakeMicrosoft.redirectUris).toEqual(["https://vink.page/api/integrations/microsoft/callback"]);
  const [listed] = await ann.user.query(api.integrations.list, { organisationSlug: ann.organisationSlug });
  expect(listed).toMatchObject({
    name: "Tyre log",
    kind: "excel",
    url: "https://acme-my.sharepoint.com/personal/ann/Documents/Tyre%20log.xlsx",
    headers: [],
    needsReconnect: false,
  });
  const stored = await t.run(async (ctx) => await ctx.db.get(ann.integrationId));
  if (stored?.kind !== "excel") throw new Error("not an Excel Integration");
  expect(stored.refreshToken).not.toContain("refresh-ann");
  // The code traded for refresh-ann-1; making the workbook refreshed it to refresh-ann-2.
  expect(await storedToken(t, ann.integrationId)).toBe("refresh-ann-2");
});

test("a state from another Admin, another Organisation, or too long ago connects nothing", async () => {
  const t = newBackend();
  const ann = await signUp(t, "ann", "Acme Fleet");
  const bob = await signUp(t, "bob", "Bob Transport");
  await addMembership(t, "cas", ann.slug, "admin");
  const { url } = await ann.user.action(api.excel.connectUrl, { organisationSlug: ann.slug, name: "Log" });
  const state = new URL(url).searchParams.get("state")!;
  const expired = "This Microsoft sign-in has expired. Try again.";

  const cas = t.withIdentity({ subject: "cas", email: "cas@example.com" });
  await expect(cas.action(api.excel.connect, { organisationSlug: ann.slug, state, code: "code-x" })).rejects.toThrow(expired);
  await expect(bob.user.action(api.excel.connect, { organisationSlug: bob.slug, state, code: "code-x" })).rejects.toThrow(expired);
  vi.advanceTimersByTime(16 * 60 * 1000);
  await expect(ann.user.action(api.excel.connect, { organisationSlug: ann.slug, state, code: "code-x" })).rejects.toThrow(expired);
  expect(fakeMicrosoft.workbooks.size).toBe(0);
});

test("a Member can't connect a Microsoft account or see the admin-consent link", async () => {
  const t = newBackend();
  const ann = await signUp(t, "ann", "Acme Fleet");
  const mia = await addMembership(t, "mia", ann.slug, "member");
  await expect(mia.action(api.excel.connectUrl, { organisationSlug: ann.slug, name: "Log" })).rejects.toThrow("Forbidden");
  await expect(mia.query(api.excel.adminConsentUrl, { organisationSlug: ann.slug })).rejects.toThrow("Forbidden");
});

test("a company that lets only its IT admin consent gets the admin-consent link, and nothing is connected", async () => {
  const t = newBackend();
  const ann = await signUp(t, "ann", "Acme Fleet");
  const { url } = await ann.user.action(api.excel.connectUrl, { organisationSlug: ann.slug, name: "Log" });
  const state = new URL(url).searchParams.get("state")!;
  fakeMicrosoft.consentBlocked = true;
  expect(await ann.user.action(api.excel.connect, { organisationSlug: ann.slug, state, code: "code-ann" })).toEqual({
    result: "admin_consent",
  });
  expect(await ann.user.query(api.excel.adminConsentUrl, { organisationSlug: ann.slug })).toEqual({
    url: "https://login.microsoftonline.com/organizations/adminconsent?client_id=app-123",
  });
  expect(await ann.user.query(api.integrations.list, { organisationSlug: ann.slug })).toEqual([]);
});

test("sign-in without the files scope connects nothing", async () => {
  const t = newBackend();
  const ann = await signUp(t, "ann", "Acme Fleet");
  const { url } = await ann.user.action(api.excel.connectUrl, { organisationSlug: ann.slug, name: "Log" });
  fakeMicrosoft.scopes = ["https://graph.microsoft.com/User.Read"];
  const state = new URL(url).searchParams.get("state")!;
  expect(await ann.user.action(api.excel.connect, { organisationSlug: ann.slug, state, code: "code-ann" })).toEqual({
    result: "no_access",
  });
  expect(fakeMicrosoft.workbooks.size).toBe(0);
});

test("an Approval adds a row per tyre change to the table, the second List as an empty cell", async () => {
  const t = newBackend();
  const ann = await connected(t);
  const documentId = await approve(t, ann);

  const delivery = await deliveryOf(t, ann, documentId);
  expect(delivery).toMatchObject({ state: "delivered", attempts: [{ status: 200, body: "2 rows added to the workbook" }] });
  const workbook = fakeMicrosoft.onlyWorkbook();
  expect(workbook.header).toEqual([
    "document",
    "license_plate",
    "tyre_changes.position",
    "tyre_changes.tread_depth_mm",
    "rims",
    "approved_at",
    "approved_by",
    "delivery_id",
  ]);
  const at = expect.stringMatching(/^2026-10-06T\d\d:\d\d:\d\d\.\d{3}Z$/);
  expect(workbook.rows).toEqual([
    [expect.stringMatching(/\.pdf$/), "OR18DH", "2L1", 3, null, at, "ann@example.com", delivery.deliveryId],
    [expect.stringMatching(/\.pdf$/), "OR18DH", "2R1", 4, null, at, "ann@example.com", delivery.deliveryId],
  ]);
});

test("every send stores the refresh token Microsoft handed out with it", async () => {
  const t = newBackend();
  const ann = await connected(t);
  await approve(t, ann);
  expect(await storedToken(t, ann.integrationId)).toBe("refresh-ann-3");
  await ann.user.action(api.integrations.testSend, {
    organisationSlug: ann.organisationSlug,
    integrationId: ann.integrationId,
    formId: ann.formId,
    mode: "examples",
  });
  expect(await storedToken(t, ann.integrationId)).toBe(fakeMicrosoft.newest("ann"));
  expect(fakeMicrosoft.newest("ann")).toBe("refresh-ann-4");
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

  const workbook = fakeMicrosoft.onlyWorkbook();
  expect(workbook.header.slice(4)).toEqual(["rims", "workshop", "approved_at", "approved_by", "delivery_id"]);
  expect(workbook.rows.map((r) => r.length)).toEqual([9, 9, 9, 9]);
  // The rows already there get an empty cell in the new column; delivery_id stays last.
  expect(workbook.rows.map((r) => r[5])).toEqual([null, null, null, null]);
  const [a, b] = [(await deliveryOf(t, ann, first)).deliveryId, (await deliveryOf(t, ann, second)).deliveryId];
  expect(workbook.rows.map((r) => r[8])).toEqual([a, a, b, b]);
});

test("a workbook in the old column order keeps it: values go by name, a new Field before approved_at", async () => {
  const t = newBackend();
  const ann = await connected(t);
  // The table as Vink made it before: Vink's columns first, then the Fields.
  const [stored] = fakeMicrosoft.workbooks.values();
  stored.rows = [
    ["document", "approved_at", "approved_by", "delivery_id", "license_plate", "tyre_changes.position", "tyre_changes.tread_depth_mm"],
    ["old.pdf", "2026-10-01T08:00:00.000Z", "ann@example.com", "dlv_old", "OLD1", "1L", 5],
  ];
  // The first write lands, but its answer never arrives: the retry must find delivery_id by name.
  const append = fakeMicrosoft.append;
  fakeMicrosoft.append = async (...args) => {
    fakeMicrosoft.append = append;
    await append(...args);
    const { MicrosoftFailure } = await import("./lib/microsoft");
    throw new MicrosoftFailure(null, "Microsoft didn't answer within 15 s");
  };
  const documentId = await approve(t, ann);
  const { deliveryId, attempts } = await deliveryOf(t, ann, documentId);
  expect(attempts.at(-1)?.body).toBe("Already in the workbook: no rows added");

  const workbook = fakeMicrosoft.onlyWorkbook();
  expect(workbook.header).toEqual([
    "document",
    "rims",
    "approved_at",
    "approved_by",
    "delivery_id",
    "license_plate",
    "tyre_changes.position",
    "tyre_changes.tread_depth_mm",
  ]);
  const at = expect.stringMatching(/^2026-10-06T/);
  expect(workbook.rows).toEqual([
    ["old.pdf", null, "2026-10-01T08:00:00.000Z", "ann@example.com", "dlv_old", "OLD1", "1L", 5],
    [expect.stringMatching(/\.pdf$/), null, at, "ann@example.com", deliveryId, "OR18DH", "2L1", 3],
    [expect.stringMatching(/\.pdf$/), null, at, "ann@example.com", deliveryId, "OR18DH", "2R1", 4],
  ]);
});

test("two Deliveries at once write one after the other: a new Field's column is added once", async () => {
  const t = newBackend();
  const ann = await connected(t);
  await approve(t, ann);
  await ann.user.mutation(api.forms.save, {
    organisationSlug: ann.organisationSlug,
    formId: ann.formId,
    name: "Tyre service",
    fields: [...fields, { type: "text", label: "Werkplaats", key: "workshop", required: false }],
  });
  fakePipeline.replay(tyreService);
  const first = (await uploadAndExtract(t, ann.user, ann.organisationSlug, ann.formId, 2))!;
  const second = (await uploadAndExtract(t, ann.user, ann.organisationSlug, ann.formId, 2))!;
  await ann.user.mutation(api.review.approve, { organisationSlug: ann.organisationSlug, documentId: first });
  // The second Delivery's attempt starts while the first is between reading the header and writing.
  fakeMicrosoft.afterRead = async () => {
    await ann.user.mutation(api.review.approve, { organisationSlug: ann.organisationSlug, documentId: second });
    const { _id } = (await deliveryRow(t, second))!;
    await t.action(internal.deliveries.attempt, { id: _id });
  };
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  expect((await deliveryOf(t, ann, first)).state).toBe("delivered");
  expect((await deliveryOf(t, ann, second)).state).toBe("delivered");
  const workbook = fakeMicrosoft.onlyWorkbook();
  expect(workbook.header.filter((c) => c === "workshop")).toHaveLength(1);
  expect(workbook.rows.map((r) => r.length)).toEqual([9, 9, 9, 9, 9, 9]);
  expect(workbook.header.slice(-4)).toEqual(["workshop", "approved_at", "approved_by", "delivery_id"]);
});

test("Microsoft's rate limits and 5xx are retried", async () => {
  const t = newBackend();
  const ann = await connected(t);
  fakeMicrosoft.answer({ status: 429, retryAfter: "30" }, { status: 504 });
  const documentId = await approve(t, ann);

  const delivery = await deliveryOf(t, ann, documentId);
  expect(delivery.state).toBe("delivered");
  expect(delivery.attempts.map((a) => a.status)).toEqual([429, 504, 200]);
  expect(fakeMicrosoft.onlyWorkbook().rows).toHaveLength(2);
});

test("a write Microsoft refuses fails the Delivery with a clear reason", async () => {
  const t = newBackend();
  const ann = await connected(t);
  fakeMicrosoft.answer({ status: 403 });
  const documentId = await approve(t, ann);

  const delivery = await deliveryOf(t, ann, documentId);
  expect(delivery).toMatchObject({ state: "failed", failureReason: "Microsoft refused the write (403)" });
  expect(delivery.attempts).toHaveLength(1);
});

test("a deleted workbook fails the Delivery at once", async () => {
  const t = newBackend();
  const ann = await connected(t);
  fakeMicrosoft.answer({ status: 404 });
  const documentId = await approve(t, ann);
  expect(await deliveryOf(t, ann, documentId)).toMatchObject({
    state: "failed",
    failureReason: "The workbook is gone: it, or its Vink table, was deleted",
  });
});

test("access the Microsoft account lost fails the Delivery at once as access expired, and asks for a Reconnect", async () => {
  const t = newBackend();
  const ann = await connected(t);
  fakeMicrosoft.revoked.add("ann");
  const documentId = await approve(t, ann);

  const delivery = await deliveryOf(t, ann, documentId);
  expect(delivery).toMatchObject({ state: "failed", failureReason: ACCESS_EXPIRED });
  expect(delivery.attempts).toHaveLength(1);
  const notifications = await ann.user.query(api.notifications.list, { organisationSlug: ann.organisationSlug });
  expect(notifications[0].text).toMatch(/couldn't be delivered to Tyre log$/);
  expect((await ann.user.query(api.integrations.list, { organisationSlug: ann.organisationSlug }))[0].needsReconnect).toBe(true);
});

test("rows that reached the workbook before an answer got lost aren't added again", async () => {
  const t = newBackend();
  const ann = await connected(t);
  const append = fakeMicrosoft.append;
  fakeMicrosoft.append = async (...args) => {
    fakeMicrosoft.append = append;
    await append(...args);
    const { MicrosoftFailure } = await import("./lib/microsoft");
    throw new MicrosoftFailure(null, "Microsoft didn't answer within 15 s");
  };
  const documentId = await approve(t, ann);

  const delivery = await deliveryOf(t, ann, documentId);
  expect(delivery.state).toBe("delivered");
  expect(delivery.attempts.map((a) => a.body ?? a.error)).toEqual([
    "Microsoft didn't answer within 15 s",
    "Already in the workbook: no rows added",
  ]);
  expect(fakeMicrosoft.onlyWorkbook().rows).toHaveLength(2);
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
  expect(answer).toEqual({ ok: true, status: 200, body: "1 row added to the workbook", error: null });
  const [row] = fakeMicrosoft.onlyWorkbook().rows;
  expect(row[0]).toBe("[test] example.pdf");
  expect(row.slice(-3, -1)).toEqual(["2026-10-06T09:00:00.000Z", null]);
  expect(row.at(-1)).toMatch(/^test_/);
});

test("an Excel Integration can be renamed, but has no endpoint or signing secret", async () => {
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

/** Ann clicks Reconnect, signs in on Microsoft's page as `code`'s account, and comes back. */
async function reconnect(ann: Awaited<ReturnType<typeof connected>>, code: string) {
  const { organisationSlug, integrationId } = ann;
  const { url } = await ann.user.action(api.integrations.reconnectUrl, { organisationSlug, integrationId });
  const consent = new URL(url);
  expect(consent.origin).toBe("https://login.microsoftonline.com");
  expect(consent.searchParams.get("redirect_uri")).toBe("https://vink.page/api/integrations/microsoft/callback");
  const state = consent.searchParams.get("state")!;
  return await ann.user.action(api.excel.connect, { organisationSlug, state, code });
}

test("after Reconnect, a re-send writes to the same workbook and skips rows already there", async () => {
  const t = newBackend();
  const ann = await connected(t);
  // The rows land, the answer gets lost, and then the account loses Vink's access.
  const append = fakeMicrosoft.append;
  fakeMicrosoft.append = async (...args) => {
    fakeMicrosoft.append = append;
    await append(...args);
    fakeMicrosoft.revoked.add("ann");
    const { MicrosoftFailure } = await import("./lib/microsoft");
    throw new MicrosoftFailure(null, "Microsoft didn't answer within 15 s");
  };
  const first = await approve(t, ann);
  const second = await approve(t, ann);
  expect((await deliveryOf(t, ann, first)).failureReason).toBe(ACCESS_EXPIRED);
  expect((await deliveryOf(t, ann, second)).failureReason).toBe(ACCESS_EXPIRED);

  expect(await reconnect(ann, "code-ann")).toEqual({ result: "reconnected" });
  const [listed] = await ann.user.query(api.integrations.list, { organisationSlug: ann.organisationSlug });
  expect(listed).toMatchObject({ needsReconnect: false, url: expect.stringMatching(/Tyre%20log\.xlsx$/) });

  for (const documentId of [first, second]) {
    const failed = await deliveryOf(t, ann, documentId);
    await ann.user.mutation(api.deliveries.resend, { organisationSlug: ann.organisationSlug, id: failed.id });
  }
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect((await deliveryOf(t, ann, first)).attempts.at(-1)?.body).toBe("Already in the workbook: no rows added");
  expect((await deliveryOf(t, ann, second)).attempts.at(-1)?.body).toBe("2 rows added to the workbook");
  expect(fakeMicrosoft.onlyWorkbook().rows).toHaveLength(4);
});

test("Reconnect with a Microsoft account that can't reach the workbook is refused and changes nothing", async () => {
  const t = newBackend();
  const ann = await connected(t);
  fakeMicrosoft.revoked.add("ann");
  await approve(t, ann);

  expect(await reconnect(ann, "code-bob")).toEqual({ result: "no_sheet_access" });
  const [listed] = await ann.user.query(api.integrations.list, { organisationSlug: ann.organisationSlug });
  expect(listed.needsReconnect).toBe(true);
  expect(await storedToken(t, ann.integrationId)).toBe("refresh-ann-2");
  expect(fakeMicrosoft.workbooks.size).toBe(1);
});

test("Reconnect in a company that now wants its IT admin to consent says so", async () => {
  const t = newBackend();
  const ann = await connected(t);
  fakeMicrosoft.consentBlocked = true;
  expect(await reconnect(ann, "code-ann")).toEqual({ result: "admin_consent" });
});

test("removing an Excel Integration deletes its token; there is nothing to revoke at Microsoft", async () => {
  const t = newBackend();
  const ann = await connected(t);
  await ann.user.mutation(api.integrations.remove, { organisationSlug: ann.organisationSlug, integrationId: ann.integrationId });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await ann.user.query(api.integrations.list, { organisationSlug: ann.organisationSlug })).toEqual([]);
  expect(await t.run(async (ctx) => await ctx.db.get(ann.integrationId))).toBeNull();
});
