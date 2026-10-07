import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  addMembership,
  expectSignedBy,
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

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("INTEGRATION_SECRETS_KEY", Buffer.alloc(32, 3).toString("base64"));
  fakePdfStore.objects.clear();
  fakePipeline.reset();
  fakeHttp.reset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function acme(t: Backend) {
  const ann = await signUp(t, "ann", "Acme Fleet");
  const organisationSlug = ann.slug;
  const { formId } = await ann.user.mutation(api.forms.create, {
    organisationSlug,
    name: "Work order",
    fields: [
      { type: "text", label: "Kenteken", key: "license_plate", required: true },
      { type: "number", label: "Kilometerstand", key: "mileage_km", required: false },
      {
        type: "list",
        label: "Banden",
        key: "tyre_changes",
        required: false,
        fields: [{ type: "text", label: "Positie", key: "position", required: false }],
      },
    ],
  });
  const create = () =>
    ann.user.mutation(api.integrations.create, {
      organisationSlug,
      name: "Fleet system",
      url: "https://fleet.example.com/hooks/vink",
      headers: [
        { name: "Authorization", value: "Bearer sk_live_abcdef123456", secret: true },
        { name: "X-Tenant", value: "acme", secret: false },
      ],
    });
  return { ...ann, organisationSlug, formId, create };
}

test("an Admin creates an Integration; header secrets are stored encrypted and shown masked", async () => {
  const t = newBackend();
  const { user, organisationSlug, create } = await acme(t);

  const { integrationId } = await create();

  const [integration] = await user.query(api.integrations.list, { organisationSlug });
  expect(integration).toMatchObject({
    id: integrationId,
    name: "Fleet system",
    url: "https://fleet.example.com/hooks/vink",
    headers: [
      { name: "Authorization", value: "••••••••3456", secret: true },
      { name: "X-Tenant", value: "acme", secret: false },
    ],
    forms: [],
  });
  const stored = await t.run(async (ctx) => JSON.stringify(await ctx.db.get(integrationId)));
  expect(stored).not.toContain("sk_live_abcdef123456");
  expect(stored).not.toContain("whsec_");
});

test("a new Integration is a Webhook", async () => {
  const t = newBackend();
  const { user, organisationSlug, create } = await acme(t);

  await create();

  const [integration] = await user.query(api.integrations.list, { organisationSlug });
  expect(integration.kind).toBe("webhook");
});

test("an Integration made before kinds existed reads as a Webhook, and the backfill stores that", async () => {
  const t = newBackend();
  const { user, organisationSlug, create } = await acme(t);
  const { integrationId } = await create();
  // Made before kinds existed: no kind stored.
  await t.run((ctx) => ctx.db.patch(integrationId, { kind: undefined }));

  expect((await user.query(api.integrations.list, { organisationSlug }))[0].kind).toBe("webhook");
  expect(await t.mutation(internal.integrations.backfillKind, {})).toEqual({ filled: 1 });
  expect(await t.mutation(internal.integrations.backfillKind, {})).toEqual({ filled: 0 });
  expect((await t.run((ctx) => ctx.db.get(integrationId)))!.kind).toBe("webhook");
});

test("an Admin can see the Integration's own signing secret, to set up the receiver", async () => {
  const t = newBackend();
  const { user, organisationSlug, create } = await acme(t);
  const { integrationId } = await create();

  const { secret } = await user.query(api.integrations.signingSecret, { organisationSlug, integrationId });

  expect(secret).toMatch(/^whsec_[0-9a-f]{48}$/);
});

test("editing an Integration keeps a secret header left unchanged, and replaces one given anew", async () => {
  const t = newBackend();
  const { user, organisationSlug, formId, create } = await acme(t);
  const { integrationId } = await create();
  await user.mutation(api.integrations.attach, { organisationSlug, integrationId, formId });

  await user.mutation(api.integrations.update, {
    organisationSlug,
    integrationId,
    name: "Fleet",
    url: "https://fleet.example.com/v2",
    headers: [
      { name: "Authorization", value: null, secret: true },
      { name: "X-Api-Key", value: "key_new_998877", secret: true },
    ],
  });
  await user.action(api.integrations.testSend, { organisationSlug, integrationId, formId, mode: "examples" });

  expect(fakeHttp.requests[0]).toMatchObject({
    url: "https://fleet.example.com/v2",
    headers: { Authorization: "Bearer sk_live_abcdef123456", "X-Api-Key": "key_new_998877" },
  });
  const [integration] = await user.query(api.integrations.list, { organisationSlug });
  expect(integration.headers.map((h) => h.value)).toEqual(["••••••••3456", "••••••••8877"]);
});

test("an Integration needs a name and an https URL", async () => {
  const t = newBackend();
  const { user, organisationSlug } = await acme(t);

  await expect(
    user.mutation(api.integrations.create, { organisationSlug, name: "X", url: "ftp://x", headers: [] }),
  ).rejects.toThrow("https");
  await expect(
    user.mutation(api.integrations.create, { organisationSlug, name: " ", url: "https://x.example", headers: [] }),
  ).rejects.toThrow("name");
});

test("an Integration attaches to several Forms and is listed with them; it can be detached", async () => {
  const t = newBackend();
  const { user, organisationSlug, formId, create } = await acme(t);
  const { formId: invoiceForm } = await user.mutation(api.forms.create, {
    organisationSlug,
    name: "Invoice",
    fields: [{ type: "text", label: "Nummer", key: "invoice_number", required: true }],
  });
  const { integrationId } = await create();

  await user.mutation(api.integrations.attach, { organisationSlug, integrationId, formId });
  await user.mutation(api.integrations.attach, { organisationSlug, integrationId, formId: invoiceForm });
  await user.mutation(api.integrations.detach, { organisationSlug, integrationId, formId });

  const [integration] = await user.query(api.integrations.list, { organisationSlug });
  expect(integration.forms).toEqual([{ id: invoiceForm, name: "Invoice" }]);
});

test("a Member can't see or manage Integrations", async () => {
  const t = newBackend();
  const { organisationSlug, formId, create } = await acme(t);
  const { integrationId } = await create();
  const bob = await addMembership(t, "bob", organisationSlug, "member");

  await expect(bob.query(api.integrations.list, { organisationSlug })).rejects.toThrow("Forbidden");
  await expect(
    bob.mutation(api.integrations.attach, { organisationSlug, integrationId, formId }),
  ).rejects.toThrow("Forbidden");
  await expect(
    bob.action(api.integrations.testSend, { organisationSlug, integrationId, formId, mode: "examples" }),
  ).rejects.toThrow("Forbidden");
});

test("nobody attaches their Integration to another Organisation's Form", async () => {
  const t = newBackend();
  const { formId } = await acme(t);
  const eve = await signUp(t, "eve", "Evil Corp");
  const { integrationId } = await eve.user.mutation(api.integrations.create, {
    organisationSlug: eve.slug,
    name: "Leak",
    url: "https://evil.example",
    headers: [],
  });

  await expect(
    eve.user.mutation(api.integrations.attach, { organisationSlug: eve.slug, integrationId, formId }),
  ).rejects.toThrow("Form not found");
});

test("once an Integration is attached, the Form's keys are locked: renaming or removing one is refused", async () => {
  const t = newBackend();
  const { user, organisationSlug, formId, create } = await acme(t);
  const { integrationId } = await create();
  await user.mutation(api.integrations.attach, { organisationSlug, integrationId, formId });
  const form = await user.query(api.forms.get, { organisationSlug, formId });
  expect(form.keysLocked).toBe(true);
  const fields = form.fields;

  await expect(
    user.mutation(api.forms.save, {
      organisationSlug,
      formId,
      name: "Work order",
      fields: [{ ...fields[0], key: "plate" }, ...fields.slice(1)],
    }),
  ).rejects.toThrow("license_plate");
  await expect(
    user.mutation(api.forms.save, { organisationSlug, formId, name: "Work order", fields: fields.slice(1) }),
  ).rejects.toThrow("license_plate");
  // Labels can change and new Fields can be added.
  await user.mutation(api.forms.save, {
    organisationSlug,
    formId,
    name: "Work order",
    fields: [
      { ...fields[0], label: "Nummerplaat" },
      ...fields.slice(1),
      { type: "text", label: "Opmerking", key: "note", required: false },
    ],
  });

  await user.mutation(api.integrations.detach, { organisationSlug, integrationId, formId });
  expect((await user.query(api.forms.get, { organisationSlug, formId })).keysLocked).toBe(false);
});

test("a test-send posts the test envelope with example data, signed like a real Delivery, and shows the answer", async () => {
  const t = newBackend();
  const { user, organisationSlug, formId, create } = await acme(t);
  const { integrationId } = await create();
  const { secret } = await user.query(api.integrations.signingSecret, { organisationSlug, integrationId });
  fakeHttp.answer({ status: 202, body: '{"received":true}' });

  const result = await user.action(api.integrations.testSend, {
    organisationSlug,
    integrationId,
    formId,
    mode: "examples",
  });

  expect(result).toEqual({ ok: true, status: 202, body: '{"received":true}', error: null });
  const [request] = fakeHttp.requests;
  expect(request.url).toBe("https://fleet.example.com/hooks/vink");
  expect(request.headers).toMatchObject({
    "Content-Type": "application/json",
    Authorization: "Bearer sk_live_abcdef123456",
    "X-Tenant": "acme",
  });
  expectSignedBy(secret, request);
  expect(JSON.parse(request.body)).toMatchObject({
    event: "document.approved",
    test: true,
    form: { id: formId, version: 1 },
    data: {
      license_plate: "Example Kenteken",
      mileage_km: 123.45,
      tyre_changes: [{ position: "Example Positie" }],
    },
  });
});

test("a test-send can leave optional values empty, to show null and []", async () => {
  const t = newBackend();
  const { user, organisationSlug, formId, create } = await acme(t);
  const { integrationId } = await create();

  await user.action(api.integrations.testSend, { organisationSlug, integrationId, formId, mode: "empty" });

  expect(JSON.parse(fakeHttp.requests[0].body).data).toEqual({
    license_plate: "Example Kenteken",
    mileage_km: null,
    tyre_changes: [],
  });
});

test("a test-send with an Approved Document sends that Document's Payload, corrections included", async () => {
  const t = newBackend();
  const { user, organisationSlug, formId, create } = await acme(t);
  const { integrationId } = await create();
  const recording: Recording = {
    reading: { vehicle: { license_plate: "NWA-30-E", mileage: "9899", _pages: [1] } },
    matches: {
      license_plate: { path: "vehicle.license_plate", probability: 0.97 },
      mileage_km: { path: "vehicle.mileage", probability: 0.95 },
    },
    fills: { license_plate: "NWA30E", mileage_km: 9899 },
  };
  fakePipeline.replay(recording);
  const documentId = (await uploadAndExtract(t, user, organisationSlug, formId)) as Id<"documents">;
  const document = await user.query(api.documents.get, { organisationSlug, documentId });
  await user.mutation(api.review.correct, {
    organisationSlug,
    fieldValueId: document.fieldValues[1].id,
    value: 9800,
  });
  await user.mutation(api.review.approve, { organisationSlug, documentId });

  expect(await user.query(api.integrations.testDocuments, { organisationSlug, formId })).toEqual([
    { id: documentId, filename: "werkorder.pdf", state: "approved" },
  ]);
  await user.action(api.integrations.testSend, {
    organisationSlug,
    integrationId,
    formId,
    mode: "examples",
    documentId,
  });

  expect(JSON.parse(fakeHttp.requests[0].body)).toMatchObject({
    test: true,
    document: { id: documentId, filename: "werkorder.pdf" },
    data: { license_plate: "NWA30E", mileage_km: 9800, tyre_changes: [] },
  });
});

test("a Document still in Needs Review is never test-sent: unchecked data doesn't leave", async () => {
  const t = newBackend();
  const { user, organisationSlug, formId, create } = await acme(t);
  const { integrationId } = await create();
  fakePipeline.replay({
    reading: { vehicle: { license_plate: "NWA-30-E", _pages: [1] } },
    matches: { license_plate: { path: "vehicle.license_plate", probability: 0.4 } },
    fills: { license_plate: "NWA30E" },
  });
  const documentId = (await uploadAndExtract(t, user, organisationSlug, formId)) as Id<"documents">;

  expect(await user.query(api.integrations.testDocuments, { organisationSlug, formId })).toEqual([]);
  await expect(
    user.action(api.integrations.testSend, {
      organisationSlug,
      integrationId,
      formId,
      mode: "examples",
      documentId,
    }),
  ).rejects.toThrow("Only an Approved Document can be test-sent");
  expect(fakeHttp.requests).toEqual([]);
});

test("a test-send reports an error answer and an unreachable receiver inline", async () => {
  const t = newBackend();
  const { user, organisationSlug, formId, create } = await acme(t);
  const { integrationId } = await create();
  fakeHttp.answer({ status: 401, body: "bad token" }, { fail: "network" });
  const send = () =>
    user.action(api.integrations.testSend, { organisationSlug, integrationId, formId, mode: "examples" });

  expect(await send()).toEqual({ ok: false, status: 401, body: "bad token", error: null });
  expect(await send()).toEqual({
    ok: false,
    status: null,
    body: null,
    error: "The receiver couldn't be reached",
  });
});

test("deleting an Integration detaches it from its Forms", async () => {
  const t = newBackend();
  const { user, organisationSlug, formId, create } = await acme(t);
  const { integrationId } = await create();
  await user.mutation(api.integrations.attach, { organisationSlug, integrationId, formId });

  await user.mutation(api.integrations.remove, { organisationSlug, integrationId });

  expect(await user.query(api.integrations.list, { organisationSlug })).toEqual([]);
  expect((await user.query(api.forms.get, { organisationSlug, formId })).keysLocked).toBe(false);
});

test("the dialog offers a spreadsheet kind only when its OAuth client is set up", async () => {
  const t = newBackend();
  const ann = await acme(t);
  const kinds = () => ann.user.query(api.integrations.availableKinds, { organisationSlug: ann.organisationSlug });

  expect(await kinds()).toEqual(["webhook"]);

  vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "client-123.apps.googleusercontent.com");
  vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "client-secret");
  vi.stubEnv("MICROSOFT_OAUTH_CLIENT_ID", "app-123");
  expect(await kinds()).toEqual(["webhook", "google_sheets"]);

  vi.stubEnv("MICROSOFT_OAUTH_CLIENT_SECRET", "client-secret");
  expect(await kinds()).toEqual(["webhook", "google_sheets", "excel"]);
});
