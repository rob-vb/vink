import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
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
      { type: "text", label: "Kenteken", key: "licensePlate", required: true },
      { type: "number", label: "Kilometerstand", key: "mileageKm", required: false },
      {
        type: "list",
        label: "Banden",
        key: "tyreChanges",
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
    fields: [{ type: "text", label: "Nummer", key: "invoiceNumber", required: true }],
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
  ).rejects.toThrow("licensePlate");
  await expect(
    user.mutation(api.forms.save, { organisationSlug, formId, name: "Work order", fields: fields.slice(1) }),
  ).rejects.toThrow("licensePlate");
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
      licensePlate: "Example Kenteken",
      mileageKm: 123.45,
      tyreChanges: [{ position: "Example Positie" }],
    },
  });
});

test("a test-send can leave optional values empty, to show null and []", async () => {
  const t = newBackend();
  const { user, organisationSlug, formId, create } = await acme(t);
  const { integrationId } = await create();

  await user.action(api.integrations.testSend, { organisationSlug, integrationId, formId, mode: "empty" });

  expect(JSON.parse(fakeHttp.requests[0].body).data).toEqual({
    licensePlate: "Example Kenteken",
    mileageKm: null,
    tyreChanges: [],
  });
});

test("a test-send with a processed Document sends that Document's Payload, corrections included", async () => {
  const t = newBackend();
  const { user, organisationSlug, formId, create } = await acme(t);
  const { integrationId } = await create();
  const recording: Recording = {
    reading: { vehicle: { licensePlate: "NWA-30-E", mileage: "9899", _pages: [1] } },
    matches: {
      licensePlate: { path: "vehicle.licensePlate", probability: 0.97 },
      mileageKm: { path: "vehicle.mileage", probability: 0.95 },
    },
    fills: { licensePlate: "NWA30E", mileageKm: 9899 },
  };
  fakePipeline.replay(recording);
  const documentId = (await uploadAndExtract(t, user, organisationSlug, formId)) as Id<"documents">;
  const document = await user.query(api.documents.get, { organisationSlug, documentId });
  await user.mutation(api.review.correct, {
    organisationSlug,
    fieldValueId: document.fieldValues[1].id,
    value: 9800,
  });

  expect(await user.query(api.integrations.testDocuments, { organisationSlug, formId })).toEqual([
    { id: documentId, filename: "werkorder.pdf", state: "needs_review" },
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
    data: { licensePlate: "NWA30E", mileageKm: 9800, tyreChanges: [] },
  });
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
