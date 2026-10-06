import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { openApiDocument } from "./publicApi/openapi";
import {
  expectSignedBy,
  fakeHttp,
  fakePdfStore,
  fakePipeline,
  newBackend,
  signUp,
  uploadAndExtract,
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
  vi.setSystemTime(new Date("2026-10-06T09:00:00Z"));
  vi.stubEnv("INTEGRATION_SECRETS_KEY", Buffer.alloc(32, 6).toString("base64"));
  fakePdfStore.objects.clear();
  fakePipeline.reset();
  fakeHttp.reset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

const workOrderFields = [
  { type: "text" as const, label: "Kenteken", key: "license_plate", required: true },
  {
    type: "list" as const,
    label: "Regels",
    key: "lines",
    required: false,
    fields: [
      { type: "text" as const, label: "Omschrijving", key: "description", required: true },
      { type: "number" as const, label: "Aantal", key: "quantity", required: false },
    ],
  },
];

/** An Organisation with one Form and an API Key; `call` speaks to /v1 with that key. */
async function organisation(t: Backend, userId: string, name: string, keyName = "Zapier") {
  const { user, slug: organisationSlug } = await signUp(t, userId, name);
  const { formId } = await user.mutation(api.forms.create, {
    organisationSlug,
    name: "Work order",
    fields: workOrderFields,
  });
  const { apiKeyId, key } = await user.mutation(api.apiKeys.create, { organisationSlug, name: keyName });
  const call = (path: string, init: { method?: string; body?: unknown; key?: string } = {}) =>
    t.fetch(`/v1${path}`, {
      method: init.method ?? "GET",
      headers: { Authorization: `Bearer ${init.key ?? key}`, "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  const subscribe = async (url = "https://hooks.zapier.com/hooks/standard/1/abc", form = formId as string) => {
    const response = await call("/subscriptions", { method: "POST", body: { form_id: form, url } });
    return { status: response.status, body: await response.json() };
  };
  return { user, organisationSlug, formId, apiKeyId, key, call, subscribe };
}

test("subscribing makes a Webhook attached to the Form, shown in the app as made by the API Key", async () => {
  const t = newBackend();
  const { user, organisationSlug, formId, subscribe } = await organisation(t, "ann", "Acme Fleet");

  const { status, body } = await subscribe();

  expect(status).toBe(201);
  expect(body).toEqual({
    id: expect.any(String),
    form_id: formId,
    url: "https://hooks.zapier.com/hooks/standard/1/abc",
    created_at: "2026-10-06T09:00:00.000Z",
  });
  const [integration] = await user.query(api.integrations.list, { organisationSlug });
  expect(integration).toMatchObject({
    name: "Zapier",
    kind: "webhook",
    url: "https://hooks.zapier.com/hooks/standard/1/abc",
    headers: [],
    forms: [{ id: formId, name: "Work order" }],
    subscription: { apiKeyName: "Zapier" },
  });
});

test("the subscribe answer's Location header is the URL that unsubscribes, as Power Automate needs", async () => {
  vi.stubEnv("SITE_URL", "https://vink.page");
  const t = newBackend();
  const { formId, key, call } = await organisation(t, "ann", "Acme Fleet");
  const response = await call("/subscriptions", {
    method: "POST",
    body: { form_id: formId, url: "https://hooks.example.com/1" },
  });
  const { id } = await response.json();

  const location = response.headers.get("Location");
  expect(location).toBe(`https://vink.page/v1/subscriptions/${id}`);
  const unsubscribe = await t.fetch(new URL(location!).pathname, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${key}` },
  });
  expect(unsubscribe.status).toBe(200);
});

test("unsubscribing removes the Webhook; a second time, or an Admin's own Webhook, is not found", async () => {
  const t = newBackend();
  const { user, organisationSlug, formId, call, subscribe } = await organisation(t, "ann", "Acme Fleet");
  const { integrationId: adminMade } = await user.mutation(api.integrations.create, {
    organisationSlug,
    name: "ERP",
    url: "https://erp.example.com/in",
    headers: [],
  });
  const { body } = await subscribe();

  const response = await call(`/subscriptions/${body.id}`, { method: "DELETE" });

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ id: body.id, deleted: true });
  expect((await user.query(api.integrations.list, { organisationSlug })).map((i) => i.name)).toEqual(["ERP"]);
  expect((await user.query(api.forms.get, { organisationSlug, formId })).keysLocked).toBe(false);

  const again = await call(`/subscriptions/${body.id}`, { method: "DELETE" });
  expect(again.status).toBe(404);
  expect((await again.json()).error.code).toBe("not_found");
  expect((await call(`/subscriptions/${adminMade}`, { method: "DELETE" })).status).toBe(404);
  expect((await call("/subscriptions/nonsense", { method: "DELETE" })).status).toBe(404);
});

test("revoking an API Key ends its Subscriptions and removes their Webhooks, and nothing else", async () => {
  const t = newBackend();
  const { user, organisationSlug, apiKeyId, subscribe } = await organisation(t, "ann", "Acme Fleet");
  const { key: makeKey } = await user.mutation(api.apiKeys.create, { organisationSlug, name: "Make" });
  await user.mutation(api.integrations.create, {
    organisationSlug,
    name: "ERP",
    url: "https://erp.example.com/in",
    headers: [],
  });
  await subscribe("https://hooks.zapier.com/1");
  await subscribe("https://hooks.zapier.com/2");
  const make = await t.fetch("/v1/subscriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${makeKey}` },
    body: JSON.stringify({ form_id: (await subscribe()).body.form_id, url: "https://hook.eu1.make.com/x" }),
  });
  expect(make.status).toBe(201);

  await user.mutation(api.apiKeys.revoke, { organisationSlug, apiKeyId });

  const left = await user.query(api.integrations.list, { organisationSlug });
  expect(left.map((i) => [i.name, i.url])).toEqual([
    ["ERP", "https://erp.example.com/in"],
    ["Make", "https://hook.eu1.make.com/x"],
  ]);
  expect(await t.run(async (ctx) => (await ctx.db.query("subscriptions").collect()).length)).toBe(1);
});

test("a Form's Field keys are locked while a Subscription is active, as for any attached Integration", async () => {
  const t = newBackend();
  const { user, organisationSlug, formId, call, subscribe } = await organisation(t, "ann", "Acme Fleet");
  const { body } = await subscribe();
  const form = await user.query(api.forms.get, { organisationSlug, formId });
  expect(form.keysLocked).toBe(true);

  await expect(
    user.mutation(api.forms.save, {
      organisationSlug,
      formId,
      name: "Work order",
      fields: [{ ...form.fields[0], key: "plate" }, ...form.fields.slice(1)],
    }),
  ).rejects.toThrow("license_plate");

  await call(`/subscriptions/${body.id}`, { method: "DELETE" });
  await user.mutation(api.forms.save, {
    organisationSlug,
    formId,
    name: "Work order",
    fields: [{ ...form.fields[0], key: "plate" }, ...form.fields.slice(1)],
  });
});

test("an Admin can delete a Subscription's Webhook in the app; that ends the Subscription", async () => {
  const t = newBackend();
  const { user, organisationSlug, call, subscribe } = await organisation(t, "ann", "Acme Fleet");
  const { body } = await subscribe();
  const [integration] = await user.query(api.integrations.list, { organisationSlug });

  await user.mutation(api.integrations.remove, { organisationSlug, integrationId: integration.id });

  expect(await user.query(api.integrations.list, { organisationSlug })).toEqual([]);
  expect((await call(`/subscriptions/${body.id}`, { method: "DELETE" })).status).toBe(404);
});

test("tenancy: another Organisation's Form and Subscription can't be reached, and its list doesn't show them", async () => {
  const t = newBackend();
  const acme = await organisation(t, "ann", "Acme Fleet");
  const other = await organisation(t, "eve", "Other Garage");
  const { body } = await acme.subscribe();

  const intoAcme = await other.subscribe("https://hooks.zapier.com/eve", acme.formId);
  expect(intoAcme.status).toBe(404);
  expect(intoAcme.body.error.code).toBe("not_found");
  expect((await other.call(`/subscriptions/${body.id}`, { method: "DELETE" })).status).toBe(404);
  expect((await other.call(`/forms/${acme.formId}/sample`)).status).toBe(404);

  expect(await other.user.query(api.integrations.list, { organisationSlug: other.organisationSlug })).toEqual([]);
  expect(await acme.user.query(api.integrations.list, { organisationSlug: acme.organisationSlug })).toHaveLength(1);
});

test("a subscribe without form_id and url, with a non-https url or an unknown Form is refused in the error shape", async () => {
  const t = newBackend();
  const { call, subscribe, user, organisationSlug, key } = await organisation(t, "ann", "Acme Fleet");

  const missing = await call("/subscriptions", { method: "POST", body: { url: "https://x.example.com" } });
  expect(missing.status).toBe(400);
  expect((await missing.json()).error.code).toBe("invalid_request");
  const notJson = await t.fetch("/v1/subscriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: "form_id=1",
  });
  expect(notJson.status).toBe(400);

  const http = await subscribe("http://hooks.zapier.com/1");
  expect(http).toMatchObject({ status: 422, body: { error: { code: "invalid_url" } } });
  expect((await subscribe("not a url")).status).toBe(422);
  expect((await subscribe("https://hooks.zapier.com/1", "nonsense")).status).toBe(404);
  expect(await user.query(api.integrations.list, { organisationSlug })).toEqual([]);
});

test("the sample is the test-send's example envelope for the Form's current Version, Lists as arrays", async () => {
  const t = newBackend();
  const { user, organisationSlug, formId, call } = await organisation(t, "ann", "Acme Fleet");
  await user.mutation(api.forms.save, {
    organisationSlug,
    formId,
    name: "Work order",
    fields: [...workOrderFields, { type: "boolean", label: "Klaar", key: "done", required: false }],
  });

  const response = await call(`/forms/${formId}/sample`);

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    event: "document.approved",
    delivery_id: expect.stringMatching(/^test_/),
    test: true,
    document: { id: "test", filename: "example.pdf", uploaded_at: "2026-10-06T09:00:00.000Z" },
    form: { id: formId, version: 2 },
    approval: { mode: "manual", by: null, at: "2026-10-06T09:00:00.000Z" },
    data: {
      license_plate: "Example Kenteken",
      lines: [{ description: "Example Omschrijving", quantity: 123.45 }],
      done: true,
    },
  });
  expect((await call("/forms/nonsense/sample")).status).toBe(404);
});

test("an Approval reaches the subscribed url as a signed Delivery, like any Webhook", async () => {
  const t = newBackend();
  const { user, organisationSlug, formId, subscribe } = await organisation(t, "ann", "Acme Fleet");
  await subscribe("https://hooks.zapier.com/hooks/standard/1/abc");
  fakePipeline.replay({
    reading: { plate: { value: "OR18DH", _pages: [1] } },
    matches: { license_plate: { path: "plate.value", probability: 0.97 } },
    lists: { lines: { path: null, probability: 0.95, keys: {} } },
    fills: { license_plate: "OR18DH" },
  });
  const documentId = (await uploadAndExtract(t, user, organisationSlug, formId))!;

  await user.mutation(api.review.approve, { organisationSlug, documentId });
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  const [integration] = await user.query(api.integrations.list, { organisationSlug });
  const { secret } = await user.query(api.integrations.signingSecret, {
    organisationSlug,
    integrationId: integration.id,
  });
  expect(fakeHttp.requests).toHaveLength(1);
  const [request] = fakeHttp.requests;
  expect(request.url).toBe("https://hooks.zapier.com/hooks/standard/1/abc");
  expectSignedBy(secret, request);
  expect(JSON.parse(request.body)).toMatchObject({
    event: "document.approved",
    test: false,
    document: { id: documentId },
    data: { license_plate: "OR18DH", lines: [] },
  });
  const { deliveries } = await user.query(api.documents.get, { organisationSlug, documentId });
  expect(deliveries.map((d) => [d.integrationName, d.state])).toEqual([["Zapier", "delivered"]]);
});

test("an Organisation can have 50 Subscriptions; one more is refused", async () => {
  const t = newBackend();
  const { subscribe } = await organisation(t, "ann", "Acme Fleet");
  for (let i = 0; i < 50; i++) expect((await subscribe(`https://hooks.zapier.com/${i}`)).status).toBe(201);

  expect(await subscribe("https://hooks.zapier.com/50")).toMatchObject({
    status: 409,
    body: { error: { code: "too_many_subscriptions" } },
  });
});

test("the answers carry exactly the keys the OpenAPI document gives them", async () => {
  const t = newBackend();
  const { formId, call, subscribe } = await organisation(t, "ann", "Acme Fleet");
  const { Subscription, DeletedSubscription, Envelope } = openApiDocument.components.schemas;
  const keys = (schema: typeof Subscription) => Object.keys(schema.properties ?? {}).sort();

  const { body } = await subscribe();
  expect(Object.keys(body).sort()).toEqual(keys(Subscription));
  const sample = await (await call(`/forms/${formId}/sample`)).json();
  expect(Object.keys(sample).sort()).toEqual(keys(Envelope));
  const deleted = await (await call(`/subscriptions/${body.id}`, { method: "DELETE" })).json();
  expect(Object.keys(deleted).sort()).toEqual(keys(DeletedSubscription));
});
