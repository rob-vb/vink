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
import type { FilledValue } from "./lib/pipeline";

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
  expect(counts).toEqual({ extracting: 0, needs_review: 1, approved: 0, extraction_failed: 0 });
});

// The 5 fixture Documents' recorded pipeline runs (ticket 11, variant C). They
// hold personal data, so they're git-ignored, and these tests are skipped
// where they're missing.
type FixtureForm = {
  name: string;
  fields: Array<{
    name: string;
    type: "string" | "number" | "date" | "list";
    fields?: Array<{ name: string; type: "string" | "number" | "date" }>;
  }>;
};
type RecordedMatch = {
  fields: Array<{
    path: string;
    sources: Array<{
      id: string;
      probability: number;
      // A sub-Field of a List entry: the array, and the key inside its elements.
      table?: string;
      column?: string | null;
      columnProbability?: number;
    }>;
  }>;
};
type RecordedValue = { readText: string | null; pages: number[] };
type RecordedList = { completenessConfidence: number; entries: Array<Record<string, unknown>> };
type RecordedRun = { fieldValues: Record<string, RecordedValue & RecordedList> };
type RecordedTextLayer = { pages: Array<{ page: number; hasTextLayer: boolean; text: string }> };
type RecordedVerify = {
  results: Array<{ path: string; fit: number; support: number | null }>;
};
const recordings = import.meta.glob("../fixtures/documents/*/*.json", {
  eager: true,
}) as Record<string, { default: unknown }>;
const recorded = (name: string) => recordings[name]?.default;
const fixtureForms = import.meta.glob("../fixtures/forms/*.json", {
  eager: true,
}) as Record<string, { default: FixtureForm }>;
const fixtures = Object.keys(
  import.meta.glob("../fixtures/documents/*/clean-opus.json"),
).map((path) => path.split("/")[3]);

function recordingOf(fixture: string) {
  const dir = `../fixtures/documents/${fixture}`;
  const expected = recorded(`${dir}/expected.json`) as { form: string; pages: number };
  const map = recorded(`${dir}/map-opus-clean.json`) as RecordedMatch;
  const fills = recorded(`${dir}/fill-opus-clean.json`) as Record<string, { value: unknown }>;
  const textLayer = recorded(`${dir}/textlayer-inspector.json`) as RecordedTextLayer;
  const verify = recorded(`${dir}/jev-opus-clean-fill.json`) as RecordedVerify;
  const topLevel = map.fields.filter((f) => !f.path.includes("["));
  const run = recorded(`${dir}/run2-opus-clean.json`) as RecordedRun;
  const form = fixtureForms[`../fixtures/forms/${expected.form}.json`].default;
  const lists: NonNullable<Recording["lists"]> = {};
  for (const list of form.fields.filter((f) => f.type === "list")) {
    const entries = map.fields.filter((f) => f.path.startsWith(`${list.name}[`));
    const [first] = entries;
    const keys = Object.fromEntries(
      list.fields!.map((s) => {
        const source = entries.find((f) => f.path.endsWith(`].${s.name}`))?.sources[0];
        return [s.name, { path: source?.column ?? null, probability: source?.columnProbability ?? 1 }];
      }),
    );
    lists[list.name] = {
      path: first?.sources[0].table ?? null,
      probability: run.fieldValues[list.name].completenessConfidence,
      keys,
    };
  }
  const recording: Recording = {
    reading: recorded(`${dir}/clean-opus.json`) as Recording["reading"],
    textLayer: textLayer.pages
      .filter((p) => p.hasTextLayer && p.text.trim() !== "")
      .map((p) => ({ page: p.page, text: p.text })),
    verifications: Object.fromEntries(
      verify.results.map((r) => [r.path, { fit: r.fit, support: r.support ?? 0 }]),
    ),
    lists,
    matches: Object.fromEntries(
      topLevel.map((f) => {
        const [best] = f.sources;
        return [f.path, { path: best.id === "none" ? null : best.id, probability: best.probability }];
      }),
    ),
    fills: Object.fromEntries(
      Object.entries(fills).map(([id, fill]) => [id, (fill.value ?? null) as FilledValue]),
    ),
  };
  return { recording, form, pages: expected.pages, topLevel, run };
}

/** The fixture Form as an app Form: its field names become keys and labels. */
function fieldsOf(form: FixtureForm) {
  const type = (t: "string" | "number" | "date") => (t === "string" ? ("text" as const) : t);
  return form.fields.map((f) =>
    f.type === "list"
      ? {
          type: "list" as const,
          label: f.name,
          key: f.name,
          required: false,
          fields: f.fields!.map((s) => ({ type: type(s.type), label: s.name, key: s.name, required: false })),
        }
      : { type: type(f.type), label: f.name, key: f.name, required: false },
  );
}

describe.runIf(fixtures.length > 0)("replaying the recorded fixture runs", () => {
  for (const fixture of fixtures) {
    test(`${fixture}: every Field and List entry gets the Field Value and Confidence its recorded Match, Fill and Verify give`, async () => {
      const t = newBackend();
      const { recording, form, pages, topLevel, run } = recordingOf(fixture);
      const ann = await signUp(t, "ann", "Acme Fleet");
      const { formId } = await ann.user.mutation(api.forms.create, {
        organisationSlug: ann.slug,
        name: form.name,
        fields: fieldsOf(form),
      });
      fakePipeline.replay(recording);

      const documentId = await uploadAndExtract(t, ann.user, ann.slug, formId, pages);

      expect(fakePipeline.calls.map((c) => c.step)).toEqual(["read", "match", "fill", "verify"]);
      expect(fakePipeline.calls[1]).toMatchObject({ reading: recording.reading });
      const textPages = new Set(recording.textLayer!.map((p) => p.page));
      const document = await ann.user.query(api.documents.get, {
        organisationSlug: ann.slug,
        documentId: documentId!,
      });
      expect(document.state).toBe("needs_review");
      expect(document.jevVerified).toBe(true);
      expect(document.fieldValues).toMatchObject(
        topLevel.map(({ path: key, sources: [best] }) => {
          const value = best.id === "none" ? null : recording.fills[key];
          const { pages } = run.fieldValues[key];
          const verified = value !== null ? recording.verifications![key] : undefined;
          const signals = {
            match: best.probability,
            fit: verified?.fit ?? null,
            support: verified && pages.some((p) => textPages.has(p)) ? verified.support : null,
          };
          const confidence = Math.min(
            ...[signals.match, signals.fit, signals.support].filter((s) => s !== null),
          );
          return {
            key,
            label: key,
            value,
            readText: run.fieldValues[key].readText,
            sourcePath: best.id === "none" ? null : best.id,
            pages,
            confidence,
            lowestSignal: expect.any(String),
            signals,
            reviewReasons: expect.any(Array),
          };
        }),
      );
      for (const list of form.fields.filter((f) => f.type === "list")) {
        const { completenessConfidence, entries } = run.fieldValues[list.name];
        const stored = document.lists.find((l) => l.key === list.name)!;
        expect(stored.completeness).toBe(completenessConfidence);
        expect(stored.entries).toHaveLength(entries.length);
        entries.forEach((entry, i) => {
          expect(stored.entries[i].fieldValues).toMatchObject(
            list.fields!.map((s) => {
              const { readText, pages } = entry[s.name] as RecordedValue;
              return {
                key: s.name,
                value: readText === null ? null : recording.fills[`${list.name}[${i}].${s.name}`],
                readText,
                pages,
              };
            }),
          );
        });
      }
    });
  }
});
