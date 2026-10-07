import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
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
  vi.stubEnv("INTEGRATION_SECRETS_KEY", Buffer.alloc(32, 5).toString("base64"));
  fakePdfStore.objects.clear();
  fakePipeline.reset();
  fakeHttp.reset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

// Everything clears review, so the Document can be approved straight away.
const tyreService: Recording = {
  reading: {
    vehicle: { license_plate: "OR18DH", fuel: "Diesel", _pages: [1] },
    order: { date: "13/12/2024", _pages: [1] },
    tyre_changes: [{ position: "2L1", depth: "3", _pages: [2] }],
  },
  matches: {
    license_plate: { path: "vehicle.license_plate", probability: 0.97 },
    service_date: { path: "order.date", probability: 0.95 },
    fuel: { path: "vehicle.fuel", probability: 0.93 },
    mileage_km: { path: null, probability: 0.9 },
  },
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
    service_date: "2024-12-13",
    fuel: "diesel",
    "tyre_changes[0].position": "2L1",
    "tyre_changes[0].tread_depth_mm": 3,
  },
};

async function approvedWith(t: Backend, integrations: number, answers: typeof fakeHttp.script = []) {
  const ann = await signUp(t, "ann", "Acme Fleet");
  const organisationSlug = ann.slug;
  const { formId } = await ann.user.mutation(api.forms.create, {
    organisationSlug,
    name: "Tyre service",
    fields: [
      { type: "text", label: "Kenteken", key: "license_plate", required: true },
      { type: "date", label: "Datum", key: "service_date", required: false },
      {
        type: "choice",
        label: "Brandstof",
        key: "fuel",
        required: false,
        options: [{ value: "diesel", description: "Diesel, gasolie" }, { value: "petrol" }],
      },
      { type: "number", label: "Km", key: "mileage_km", required: false },
      {
        type: "list",
        label: "Banden",
        key: "tyre_changes",
        required: false,
        fields: [
          { type: "text", label: "Positie", key: "position", required: false },
          { type: "number", label: "Profiel", key: "tread_depth_mm", required: false },
        ],
      },
      {
        type: "list",
        label: "Velgen",
        key: "rims",
        required: false,
        fields: [{ type: "text", label: "Maat", key: "size", required: false }],
      },
    ],
  });
  const integrationIds: Id<"integrations">[] = [];
  for (let i = 0; i < integrations; i++) {
    const { integrationId } = await ann.user.mutation(api.integrations.create, {
      organisationSlug,
      name: `System ${i + 1}`,
      url: `https://system${i + 1}.example.com/in`,
      headers: [{ name: "Authorization", value: `Bearer token-${i + 1}`, secret: true }],
    });
    await ann.user.mutation(api.integrations.attach, { organisationSlug, integrationId, formId });
    integrationIds.push(integrationId);
  }
  fakePipeline.replay(tyreService);
  const documentId = (await uploadAndExtract(t, ann.user, organisationSlug, formId, 2))!;
  fakeHttp.answer(...answers);
  vi.setSystemTime(new Date("2026-09-24T12:00:00Z"));
  await ann.user.mutation(api.review.approve, { organisationSlug, documentId });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const read = () => ann.user.query(api.documents.get, { organisationSlug, documentId });
  return { ...ann, organisationSlug, formId, documentId, integrationIds, read };
}

test("Approval with no Integration attached creates no Delivery and sends nothing", async () => {
  const t = newBackend();
  const { read } = await approvedWith(t, 0);

  expect((await read()).deliveries).toEqual([]);
  expect(fakeHttp.requests).toEqual([]);
});

test("Approval creates one Delivery per attached Integration, each with its own stable delivery_id", async () => {
  const t = newBackend();
  const { read } = await approvedWith(t, 2);

  const { deliveries } = await read();
  expect(deliveries.map((d) => [d.integrationName, d.state])).toEqual([
    ["System 1", "delivered"],
    ["System 2", "delivered"],
  ]);
  expect(fakeHttp.requests.map((r) => r.url)).toEqual([
    "https://system1.example.com/in",
    "https://system2.example.com/in",
  ]);
  const ids = fakeHttp.requests.map((r) => JSON.parse(r.body).delivery_id);
  expect(ids).toEqual(deliveries.map((d) => d.deliveryId));
  expect(new Set(ids).size).toBe(2);
});

test("the envelope carries the Payload with every key: null, [], ISO dates, choice values, and nothing else", async () => {
  const t = newBackend();
  const { documentId, formId } = await approvedWith(t, 1);

  const envelope = JSON.parse(fakeHttp.requests[0].body);
  expect(envelope).toEqual({
    event: "document.approved",
    delivery_id: expect.stringMatching(/^dlv_/),
    test: false,
    document: { id: documentId, filename: "werkorder.pdf", uploaded_at: expect.any(String) },
    form: { id: formId, version: 1 },
    approval: { mode: "manual", by: "ann", at: "2026-09-24T12:00:00.000Z" },
    data: {
      license_plate: "OR18DH",
      service_date: "2024-12-13",
      fuel: "diesel",
      mileage_km: null,
      tyre_changes: [{ position: "2L1", tread_depth_mm: 3 }],
      rims: [],
    },
  });
});

test("each request is signed over its raw body with the Integration's secret, next to its static headers", async () => {
  const t = newBackend();
  const { user, organisationSlug, integrationIds, read } = await approvedWith(t, 1);
  const { secret } = await user.query(api.integrations.signingSecret, {
    organisationSlug,
    integrationId: integrationIds[0],
  });

  const [request] = fakeHttp.requests;
  expect(request.headers).toMatchObject({
    Authorization: "Bearer token-1",
    "Content-Type": "application/json",
  });
  const signedAt = expectSignedBy(secret, request);
  const sentAt = (await read()).deliveries[0].attempts[0].at;
  expect(signedAt).toBe(Math.floor(sentAt / 1000));
});

test("a captured request replayed later still carries its original time, so a receiver can refuse it", async () => {
  const t = newBackend();
  const { user, organisationSlug, integrationIds, read } = await approvedWith(t, 1, [{ status: 400 }]);
  const { secret } = await user.query(api.integrations.signingSecret, {
    organisationSlug,
    integrationId: integrationIds[0],
  });
  const [delivery] = (await read()).deliveries;
  vi.setSystemTime(Date.now() + 10 * 60 * 1000);

  await user.mutation(api.deliveries.resend, { organisationSlug, id: delivery.id });
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  const [first, second] = fakeHttp.requests;
  expect(second.body).toBe(first.body);
  expect(expectSignedBy(secret, second) - expectSignedBy(secret, first)).toBeGreaterThanOrEqual(600);
  expect(second.headers["X-Vink-Signature"]).not.toBe(first.headers["X-Vink-Signature"]);
});

test("a 2xx answer delivers the Delivery and logs the attempt", async () => {
  const t = newBackend();
  const { read } = await approvedWith(t, 1, [{ status: 201, body: '{"id":"WO-77"}' }]);

  expect((await read()).deliveries[0]).toMatchObject({
    state: "delivered",
    failureReason: null,
    attempts: [{ at: Date.parse("2026-09-24T12:00:00Z"), status: 201, body: '{"id":"WO-77"}', error: null }],
  });
});

test("a 4xx other than 408 and 429 fails the Delivery at once", async () => {
  const t = newBackend();
  const { read } = await approvedWith(t, 1, [{ status: 422, body: "license_plate missing" }]);

  expect((await read()).deliveries[0]).toMatchObject({
    state: "failed",
    failureReason: "The receiver refused it (422)",
    attempts: [{ status: 422, body: "license_plate missing" }],
  });
  expect(fakeHttp.requests).toHaveLength(1);
});

test("an Integration lists its Deliveries with the Document they carried", async () => {
  const t = newBackend();
  const { user, organisationSlug, integrationIds, documentId } = await approvedWith(t, 1);

  const deliveries = await user.query(api.deliveries.forIntegration, {
    organisationSlug,
    integrationId: integrationIds[0],
  });

  expect(deliveries).toEqual([
    expect.objectContaining({
      document: { id: documentId, filename: "werkorder.pdf" },
      state: "delivered",
      attempts: [expect.objectContaining({ status: 200 })],
    }),
  ]);
});

test("an Integration made before kinds existed is still sent to as a Webhook", async () => {
  const t = newBackend();
  const { user, organisationSlug, integrationIds, read } = await approvedWith(t, 1, [{ status: 400 }]);
  // Made before kinds existed: no kind stored.
  await t.run((ctx) => ctx.db.patch(integrationIds[0], { kind: undefined }));
  const { secret } = await user.query(api.integrations.signingSecret, {
    organisationSlug,
    integrationId: integrationIds[0],
  });

  await user.mutation(api.deliveries.resend, { organisationSlug, id: (await read()).deliveries[0].id });
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  expect((await read()).deliveries[0].state).toBe("delivered");
  expect(fakeHttp.requests[1].url).toBe("https://system1.example.com/in");
  expectSignedBy(secret, fakeHttp.requests[1]);
});
