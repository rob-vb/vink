import { createHmac } from "node:crypto";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
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
    vehicle: { licensePlate: "OR18DH", fuel: "Diesel", _pages: [1] },
    order: { date: "13/12/2024", _pages: [1] },
    tyreChanges: [{ position: "2L1", depth: "3", _pages: [2] }],
  },
  matches: {
    licensePlate: { path: "vehicle.licensePlate", probability: 0.97 },
    serviceDate: { path: "order.date", probability: 0.95 },
    fuel: { path: "vehicle.fuel", probability: 0.93 },
    mileageKm: { path: null, probability: 0.9 },
  },
  lists: {
    tyreChanges: {
      path: "tyreChanges",
      probability: 0.96,
      keys: {
        position: { path: "position", probability: 0.99 },
        treadDepthMm: { path: "depth", probability: 0.95 },
      },
    },
    rims: { path: null, probability: 0.92, keys: {} },
  },
  fills: {
    licensePlate: "OR18DH",
    serviceDate: "2024-12-13",
    fuel: "diesel",
    "tyreChanges[0].position": "2L1",
    "tyreChanges[0].treadDepthMm": 3,
  },
};

async function approvedWith(t: Backend, integrations: number, answers: typeof fakeHttp.script = []) {
  const ann = await signUp(t, "ann", "Acme Fleet");
  const organisationSlug = ann.slug;
  const { formId } = await ann.user.mutation(api.forms.create, {
    organisationSlug,
    name: "Tyre service",
    fields: [
      { type: "text", label: "Kenteken", key: "licensePlate", required: true },
      { type: "date", label: "Datum", key: "serviceDate", required: false },
      {
        type: "choice",
        label: "Brandstof",
        key: "fuel",
        required: false,
        options: [{ value: "diesel", description: "Diesel, gasolie" }, { value: "petrol" }],
      },
      { type: "number", label: "Km", key: "mileageKm", required: false },
      {
        type: "list",
        label: "Banden",
        key: "tyreChanges",
        required: false,
        fields: [
          { type: "text", label: "Positie", key: "position", required: false },
          { type: "number", label: "Profiel", key: "treadDepthMm", required: false },
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

test("Approval creates one Delivery per attached Integration, each with its own stable deliveryId", async () => {
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
  const ids = fakeHttp.requests.map((r) => JSON.parse(r.body).deliveryId);
  expect(ids).toEqual(deliveries.map((d) => d.deliveryId));
  expect(new Set(ids).size).toBe(2);
});

test("the envelope carries the Payload with every key: null, [], ISO dates, choice values, and nothing else", async () => {
  const t = newBackend();
  const { documentId, formId } = await approvedWith(t, 1);

  const envelope = JSON.parse(fakeHttp.requests[0].body);
  expect(envelope).toEqual({
    event: "document.approved",
    deliveryId: expect.stringMatching(/^dlv_/),
    test: false,
    document: { id: documentId, filename: "werkorder.pdf", uploadedAt: expect.any(String) },
    form: { id: formId, version: 1 },
    approval: { mode: "manual", by: "ann", at: "2026-09-24T12:00:00.000Z" },
    data: {
      licensePlate: "OR18DH",
      serviceDate: "2024-12-13",
      fuel: "diesel",
      mileageKm: null,
      tyreChanges: [{ position: "2L1", treadDepthMm: 3 }],
      rims: [],
    },
  });
});

test("each request is signed over its raw body with the Integration's secret, next to its static headers", async () => {
  const t = newBackend();
  const { user, organisationSlug, integrationIds } = await approvedWith(t, 1);
  const { secret } = await user.query(api.integrations.signingSecret, {
    organisationSlug,
    integrationId: integrationIds[0],
  });

  const [request] = fakeHttp.requests;
  expect(request.headers).toMatchObject({
    Authorization: "Bearer token-1",
    "Content-Type": "application/json",
    "X-DocuHelper-Signature": `sha256=${createHmac("sha256", secret).update(request.body).digest("hex")}`,
  });
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
  const { read } = await approvedWith(t, 1, [{ status: 422, body: "licensePlate missing" }]);

  expect((await read()).deliveries[0]).toMatchObject({
    state: "failed",
    failureReason: "The receiver refused it (422)",
    attempts: [{ status: 422, body: "licensePlate missing" }],
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
