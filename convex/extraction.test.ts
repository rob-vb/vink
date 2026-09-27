import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import {
  fakePdfStore,
  fakePipeline,
  newBackend,
  signUp,
  uploadAndExtract,
  type Recording,
} from "./test.setup";
import type { Extracted } from "./lib/extract";

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

// A two-paper work order: plate and mileage on page 1, the order number on page 2.
const workOrder: Recording = {
  reading: {
    _pages: [1, 2],
    vehicle: { licensePlate: "NWA-30-E", mileage: "9.899 km", _pages: [1] },
    workOrder: { number: "WO-0142", _pages: [2] },
  },
  matches: {
    licensePlate: { path: "vehicle.licensePlate", probability: 0.97 },
    mileageKm: { path: "vehicle.mileage", probability: 0.91 },
    orderNumber: { path: "workOrder.number", probability: 0.88 },
    purchaseOrderNumber: { path: null, probability: 0.93 },
  },
  fills: { licensePlate: "NWA30E", mileageKm: 9899, orderNumber: "WO-0142" },
};

async function acmeWithWorkOrderForm(t: Backend) {
  const ann = await signUp(t, "ann", "Acme Fleet");
  const { formId } = await ann.user.mutation(api.forms.create, {
    organisationSlug: ann.slug,
    name: "Work order",
    fields: [
      { type: "text", label: "Kenteken", key: "licensePlate", required: true },
      { type: "number", label: "Kilometerstand", key: "mileageKm", required: false },
      { type: "text", label: "Werkorder", key: "orderNumber", required: false },
      { type: "text", label: "Bestelbon", key: "purchaseOrderNumber", required: false },
    ],
  });
  return { ...ann, formId };
}

test("an uploaded PDF is extracted into a Field Value per Field, and its Document moves to Needs Review", async () => {
  const t = newBackend();
  const { user, slug, formId } = await acmeWithWorkOrderForm(t);
  fakePipeline.replay(workOrder);

  const documentId = await uploadAndExtract(t, user, slug, formId, 2);

  const document = await user.query(api.documents.get, {
    organisationSlug: slug,
    documentId: documentId!,
  });
  expect(document.state).toBe("needs_review");
  expect(document.fieldValues).toMatchObject([
    {
      key: "licensePlate",
      label: "Kenteken",
      value: "NWA30E",
      readText: "NWA-30-E",
      sourcePath: "vehicle.licensePlate",
      pages: [1],
      confidence: 0.97,
      lowestSignal: "match",
      signals: { match: 0.97, fit: 1, support: null },
      reviewReasons: [],
    },
    {
      key: "mileageKm",
      label: "Kilometerstand",
      value: 9899,
      readText: "9.899 km",
      sourcePath: "vehicle.mileage",
      pages: [1],
      confidence: 0.91,
      lowestSignal: "match",
      signals: { match: 0.91, fit: 1, support: null },
      reviewReasons: [],
    },
    {
      key: "orderNumber",
      label: "Werkorder",
      value: "WO-0142",
      readText: "WO-0142",
      sourcePath: "workOrder.number",
      pages: [2],
      confidence: 0.88,
      lowestSignal: "match",
      signals: { match: 0.88, fit: 1, support: null },
      reviewReasons: [],
    },
    {
      key: "purchaseOrderNumber",
      label: "Bestelbon",
      value: null,
      readText: null,
      sourcePath: null,
      pages: [],
      confidence: 0.93,
      lowestSignal: "match",
      signals: { match: 0.93, fit: null, support: null },
      reviewReasons: [],
    },
  ]);
});

test("an Extraction reads, then matches the stored Reading, fills only the matched Fields and verifies them", async () => {
  const t = newBackend();
  const { user, slug, formId } = await acmeWithWorkOrderForm(t);
  fakePipeline.replay(workOrder);

  await uploadAndExtract(t, user, slug, formId, 2);

  expect(fakePipeline.calls).toEqual([
    { step: "read" },
    {
      step: "match",
      reading: workOrder.reading,
      fields: ["licensePlate", "mileageKm", "orderNumber", "purchaseOrderNumber"],
      lists: [],
    },
    { step: "fill", fields: ["licensePlate", "mileageKm", "orderNumber"] },
    {
      step: "verify",
      fields: ["licensePlate", "mileageKm", "orderNumber"],
      supportAskedFor: [],
    },
  ]);
});

test("an Extraction that is run again matches the stored Reading without reading the PDF again", async () => {
  const t = newBackend();
  const { user, slug, formId } = await acmeWithWorkOrderForm(t);
  fakePipeline.replay(workOrder);
  fakePipeline.failOnce("match");

  await uploadAndExtract(t, user, slug, formId, 2);

  expect(fakePipeline.calls.map((c) => c.step)).toEqual(["read", "match", "match", "fill", "verify"]);
  expect(fakePipeline.calls[2]).toMatchObject({ reading: workOrder.reading });
});

test("the Document list's counts move the Document from Extracting to Needs Review", async () => {
  const t = newBackend();
  const { user, slug, formId } = await acmeWithWorkOrderForm(t);
  fakePipeline.replay(workOrder);

  await uploadAndExtract(t, user, slug, formId);

  const { counts } = await user.query(api.documents.list, {
    organisationSlug: slug,
    state: "needs_review",
  });
  expect(counts).toEqual({ extracting: 0, needs_review: 1, approved: 0, extraction_failed: 0, rejected: 0 });
});

// The fixture Documents' real pipeline runs, recorded by the eval harness
// (`npm run eval`, scripts/eval): what the models answered (recording.json)
// and what the pipeline made of it (extracted.json). They hold personal data,
// so they're git-ignored, and these tests are skipped where they're missing.
type FixtureForm = {
  name: string;
  fields: Array<{
    name: string;
    type: "string" | "number" | "date" | "list";
    description?: string;
    fields?: Array<{ name: string; type: "string" | "number" | "date"; description?: string }>;
  }>;
};
const recordings = import.meta.glob("../fixtures/documents/*/*.json", {
  eager: true,
}) as Record<string, { default: unknown }>;
const recorded = (name: string) => recordings[name]?.default;
const fixtureForms = import.meta.glob("../fixtures/forms/*.json", {
  eager: true,
}) as Record<string, { default: FixtureForm }>;
const fixtures = Object.keys(
  import.meta.glob(["../fixtures/documents/*/recording.json", "../fixtures/documents/*/extracted.json"]),
)
  .map((path) => path.split("/")[3])
  .filter((fixture, i, all) => all.indexOf(fixture) !== i);

function recordingOf(fixture: string) {
  const dir = `../fixtures/documents/${fixture}`;
  const expected = recorded(`${dir}/expected.json`) as { form: string; pages: number };
  return {
    recording: recorded(`${dir}/recording.json`) as Recording,
    extracted: recorded(`${dir}/extracted.json`) as Extracted,
    form: fixtureForms[`../fixtures/forms/${expected.form}.json`].default,
    pages: expected.pages,
  };
}

/** The fixture Form as an app Form, as the eval harness builds it. */
function fieldsOf(form: FixtureForm) {
  const type = (t: "string" | "number" | "date") => (t === "string" ? ("text" as const) : t);
  const flat = (f: { name: string; type: "string" | "number" | "date"; description?: string }) => ({
    type: type(f.type),
    label: f.name,
    key: f.name,
    required: false,
    ...(f.description ? { description: f.description } : {}),
  });
  return form.fields.map((f) =>
    f.type === "list"
      ? { ...flat({ ...f, type: "string" }), type: "list" as const, fields: f.fields!.map(flat) }
      : flat(f as Parameters<typeof flat>[0]),
  );
}

/** A Field Value as stored, in the shape the pipeline produced it. */
const asExtracted = ({ key, value, readText, sourcePath, pages, signals }: Extracted["fieldValues"][number]) => ({
  key,
  value,
  readText,
  sourcePath,
  pages,
  signals,
});

describe.runIf(fixtures.length > 0)("replaying the recorded fixture runs", () => {
  for (const fixture of fixtures) {
    test(`${fixture}: the app stores the Field Values and Lists the recorded run produced`, async () => {
      const t = newBackend();
      const { recording, extracted, form, pages } = recordingOf(fixture);
      const ann = await signUp(t, "ann", "Acme Fleet");
      const { formId } = await ann.user.mutation(api.forms.create, {
        organisationSlug: ann.slug,
        name: form.name,
        fields: fieldsOf(form),
      });
      fakePipeline.replay(recording);

      const documentId = await uploadAndExtract(t, ann.user, ann.slug, formId, pages);

      expect(fakePipeline.calls.map((c) => c.step)).toEqual(
        expect.arrayContaining(["read", "match", "fill", "verify"]),
      );
      const document = await ann.user.query(api.documents.get, {
        organisationSlug: ann.slug,
        documentId: documentId!,
      });
      expect(document.jevVerified).toBe(extracted.jevVerified);
      expect(document.fieldValues).toMatchObject(
        extracted.fieldValues.filter((v) => !v.list).map(asExtracted),
      );
      for (const list of extracted.lists) {
        const stored = document.lists.find((l) => l.key === list.key)!;
        expect(stored.completeness).toBe(list.completeness);
        expect(stored.entries).toHaveLength(list.entries);
        stored.entries.forEach((entry, i) => {
          expect(entry.fieldValues).toMatchObject(
            extracted.fieldValues
              .filter((v) => v.list?.key === list.key && v.list.entry === i)
              .map(asExtracted),
          );
        });
      }
    });
  }
});
