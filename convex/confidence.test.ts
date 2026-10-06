import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import {
  fakePdfStore,
  fakePipeline,
  newBackend,
  signUp,
  uploadAndExtract,
  type Recording,
} from "./test.setup";

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
  fakePdfStore.objects.clear();
  fakePipeline.reset();
});

afterEach(() => {
  vi.useRealTimers();
});

// A two-paper work order: page 1 is a scan, page 2 a digital PDF with text.
const workOrder: Recording = {
  reading: {
    _pages: [1, 2],
    vehicle: { license_plate: "NWA-30-E", mileage: "9899", _pages: [1] },
    workOrder: { number: "WO-0142", date: "1 maart 2026", _pages: [2] },
  },
  textLayer: [{ page: 2, text: "Werkorder WO-0142\nDatum 1 maart 2026" }],
  matches: {
    license_plate: { path: "vehicle.license_plate", probability: 0.97 },
    mileage_km: { path: "vehicle.mileage", probability: 0.91 },
    order_number: { path: "workOrder.number", probability: 0.95 },
    order_date: { path: "workOrder.date", probability: 0.96 },
    purchase_order_number: { path: null, probability: 0.93 },
  },
  fills: {
    license_plate: "NWA30E",
    mileage_km: 9899,
    order_number: "WO-0142",
    order_date: "2026-03-01",
  },
  verifications: {
    license_plate: { fit: 0.98, support: 0.2 },
    mileage_km: { fit: 0.9, support: 0.99 },
    order_number: { fit: 0.99, support: 0.85 },
    order_date: { fit: 0.97, support: 0.99 },
  },
};

async function acmeWithWorkOrderForm(t: Backend, required: string[] = []) {
  const ann = await signUp(t, "ann", "Acme Fleet");
  const field = (type: "text" | "number" | "date", label: string, key: string) => ({
    type,
    label,
    key,
    required: required.includes(key),
  });
  const { formId } = await ann.user.mutation(api.forms.create, {
    organisationSlug: ann.slug,
    name: "Work order",
    fields: [
      field("text", "Kenteken", "license_plate"),
      field("number", "Kilometerstand", "mileage_km"),
      field("text", "Werkorder", "order_number"),
      field("date", "Datum", "order_date"),
      field("text", "Bestelbon", "purchase_order_number"),
    ],
  });
  return { ...ann, formId };
}

async function extracted(recording: Recording, required: string[] = []) {
  const t = newBackend();
  const acme = await acmeWithWorkOrderForm(t, required);
  fakePipeline.replay(recording);
  const documentId = await uploadAndExtract(t, acme.user, acme.slug, acme.formId, 2);
  const document = await acme.user.query(api.documents.get, {
    organisationSlug: acme.slug,
    documentId: documentId!,
  });
  const fieldValue = (key: string) => document.fieldValues.find((f) => f.key === key)!;
  return { t, ...acme, document, fieldValue };
}

test("Verify runs after Fill as one request for every filled value, and asks support only for values on text-layer pages", async () => {
  await extracted(workOrder);

  expect(fakePipeline.calls.map((c) => c.step)).toEqual(["read", "match", "fill", "verify"]);
  expect(fakePipeline.calls[3]).toEqual({
    step: "verify",
    fields: ["license_plate", "mileage_km", "order_number", "order_date"],
    supportAskedFor: ["order_number", "order_date"],
  });
});

test("a Field Value's confidence is the lowest of its Match, fit and support, and records which signal was lowest", async () => {
  const { fieldValue } = await extracted(workOrder);

  expect(fieldValue("order_number")).toMatchObject({
    confidence: 0.85,
    lowestSignal: "support",
    signals: { match: 0.95, fit: 0.99, support: 0.85 },
  });
  expect(fieldValue("mileage_km")).toMatchObject({
    confidence: 0.9,
    lowestSignal: "fit",
    signals: { match: 0.91, fit: 0.9, support: null },
  });
  // Page 1 is a scan, so Jev's support isn't a signal there.
  expect(fieldValue("license_plate")).toMatchObject({
    confidence: 0.97,
    lowestSignal: "match",
    signals: { match: 0.97, fit: 0.98, support: null },
  });
});

test("an empty optional Field whose Match chose none counts with its none probability", async () => {
  const { fieldValue } = await extracted(workOrder);

  expect(fieldValue("purchase_order_number")).toMatchObject({
    value: null,
    confidence: 0.93,
    lowestSignal: "match",
    signals: { match: 0.93, fit: null, support: null },
    reviewReasons: [],
  });
});

test("a Field Value below the Form's Review Threshold is Needs Review", async () => {
  const { fieldValue } = await extracted({
    ...workOrder,
    verifications: { ...workOrder.verifications, mileage_km: { fit: 0.42, support: 1 } },
  });

  expect(fieldValue("mileage_km").reviewReasons).toEqual(["below_threshold"]);
  expect(fieldValue("order_number").reviewReasons).toEqual([]);
});

test("a required Field with no value is Needs Review", async () => {
  const { fieldValue } = await extracted(workOrder, ["purchase_order_number"]);

  expect(fieldValue("purchase_order_number").reviewReasons).toEqual(["required_empty"]);
});

test("a value that doesn't fit its Field's type becomes empty, keeps its read text and is Needs Review", async () => {
  const { fieldValue } = await extracted({
    ...workOrder,
    fills: { ...workOrder.fills, order_date: "1 maart 2026" },
  });

  expect(fieldValue("order_date")).toMatchObject({
    value: null,
    readText: "1 maart 2026",
    reviewReasons: ["type_mismatch"],
  });
  // An empty value isn't sent to Verify.
  expect(fakePipeline.calls[3]).toMatchObject({
    fields: ["license_plate", "mileage_km", "order_number"],
  });
});

test("a value the Reading marks as unsure is Needs Review", async () => {
  const { fieldValue } = await extracted({
    ...workOrder,
    reading: {
      ...workOrder.reading,
      vehicle: { license_plate: "NWA-30-E", mileage: "9899", _pages: [1], _unsure: ["mileage"] },
    },
  });

  expect(fieldValue("mileage_km").reviewReasons).toEqual(["unsure"]);
  expect(fieldValue("license_plate").reviewReasons).toEqual([]);
});

test("a value the Reading holds conflicting readings for is Needs Review", async () => {
  const { fieldValue } = await extracted({
    ...workOrder,
    // The Reader's own keys are camelCase, its other reading under `<key>Alt`.
    matches: { ...workOrder.matches, license_plate: { path: "vehicle.licensePlate", probability: 0.98 } },
    reading: {
      ...workOrder.reading,
      vehicle: {
        licensePlate: "NWA-30-E",
        licensePlateAlt: "NWA-38-E",
        mileage: "9899",
        _pages: [1],
      },
      workOrder: {
        number: "WO-0142",
        date: "1 maart 2026",
        conflicts: "The date reads 1 maart on the order and 3 maart on the invoice",
        _pages: [2],
      },
    },
  });

  expect(fieldValue("license_plate").reviewReasons).toEqual(["conflicting"]);
  expect(fieldValue("order_date").reviewReasons).toEqual(["conflicting"]);
  expect(fieldValue("order_number").reviewReasons).toEqual([]);
  expect(fieldValue("mileage_km").reviewReasons).toEqual([]);
});

test("a value can be Needs Review for several reasons at once", async () => {
  const { fieldValue } = await extracted(
    {
      ...workOrder,
      reading: {
        ...workOrder.reading,
        vehicle: { license_plate: "NWA-30-E", mileage: "9899", _pages: [1], _unsure: ["mileage"] },
      },
      fills: { ...workOrder.fills, mileage_km: "negenduizend" },
      matches: { ...workOrder.matches, mileage_km: { path: "vehicle.mileage", probability: 0.5 } },
    },
    ["mileage_km"],
  );

  expect(fieldValue("mileage_km").reviewReasons).toEqual([
    "below_threshold",
    "required_empty",
    "type_mismatch",
    "unsure",
  ]);
});

test("a Document is Jev-verified when Verify succeeds", async () => {
  const { document } = await extracted(workOrder);

  expect(document.jevVerified).toBe(true);
});

test("when Verify fails the Extraction still succeeds, unverified, with Match as the only signal", async () => {
  fakePipeline.failOnce("verify");
  const { document, fieldValue } = await extracted(workOrder);

  expect(document.state).toBe("needs_review");
  expect(document.jevVerified).toBe(false);
  expect(fieldValue("order_number")).toMatchObject({
    confidence: 0.95,
    lowestSignal: "match",
    signals: { match: 0.95, fit: null, support: null },
  });
  expect(fakePipeline.calls.filter((c) => c.step === "verify")).toHaveLength(1);
});

test("changing the Review Threshold leaves finished Documents alone, and the next Extraction uses it", async () => {
  const { t, user, slug, formId, document: first } = await extracted({
    ...workOrder,
    verifications: { ...workOrder.verifications, mileage_km: { fit: 0.85, support: 1 } },
  });
  expect(first.reviewThreshold).toBe(0.8);

  await user.mutation(api.forms.updateSettings, {
    organisationSlug: slug,
    formId,
    reviewThreshold: 0.9,
    autoSend: false,
  });
  const second = await uploadAndExtract(t, user, slug, formId, 2);

  const firstNow = await user.query(api.documents.get, {
    organisationSlug: slug,
    documentId: first.id,
  });
  expect(firstNow.reviewThreshold).toBe(0.8);
  expect(firstNow.fieldValues.find((f) => f.key === "mileage_km")!.reviewReasons).toEqual([]);
  const secondNow = await user.query(api.documents.get, {
    organisationSlug: slug,
    documentId: second!,
  });
  expect(secondNow.reviewThreshold).toBe(0.9);
  expect(secondNow.fieldValues.find((f) => f.key === "mileage_km")!.reviewReasons).toEqual([
    "below_threshold",
  ]);
});

// The mileage on both papers: Jev splits its probability over the two.
const mileageTwice: Recording = {
  ...workOrder,
  reading: {
    ...workOrder.reading,
    workOrder: { number: "WO-0142", date: "1 maart 2026", km: "9.899", _pages: [2] },
  },
  matches: {
    ...workOrder.matches,
    mileage_km: {
      path: "vehicle.mileage",
      probability: 0.55,
      alternatives: [
        { path: "workOrder.km", probability: 0.4 },
        { path: null, probability: 0.05 },
      ],
    },
  },
  fills: { ...workOrder.fills, "mileage_km@workOrder.km": 9899 },
};

test("a Field Value's Match probability adds up every source Jev weighed that gives the same value", async () => {
  const { fieldValue } = await extracted(mileageTwice);

  expect(fieldValue("mileage_km")).toMatchObject({
    value: 9899,
    sourcePath: "vehicle.mileage",
    signals: { match: expect.closeTo(0.95, 10) },
  });
});

test("a source Jev weighed that gives another value doesn't add to the pick's Match probability", async () => {
  const { fieldValue } = await extracted({
    ...mileageTwice,
    fills: { ...mileageTwice.fills, "mileage_km@workOrder.km": 9989 },
  });

  expect(fieldValue("mileage_km")).toMatchObject({ value: 9899, signals: { match: 0.55 } });
});

test("the value most of Jev's probability supports wins over its single likeliest source", async () => {
  const { fieldValue } = await extracted({
    ...mileageTwice,
    matches: {
      ...mileageTwice.matches,
      mileage_km: {
        path: "vehicle.mileage",
        probability: 0.4,
        alternatives: [
          { path: "workOrder.km", probability: 0.35 },
          { path: "workOrder", probability: 0.25 },
        ],
      },
    },
    fills: { ...mileageTwice.fills, mileage_km: 9899, "mileage_km@workOrder.km": 9989, "mileage_km@workOrder": 9989 },
  });

  expect(fieldValue("mileage_km")).toMatchObject({
    value: 9989,
    sourcePath: "workOrder.km",
    readText: "9.899",
    signals: { match: expect.closeTo(0.6, 10) },
  });
});
