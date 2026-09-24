import { PDFDocument } from "pdf-lib";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  fakePdfStore,
  fakePipeline,
  newBackend,
  putToUploadUrl,
  signUp,
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

type Backend = ReturnType<typeof newBackend>;
type User = ReturnType<Backend["withIdentity"]>;

beforeEach(() => {
  vi.useFakeTimers();
  fakePdfStore.objects.clear();
  fakePipeline.reset();
});

afterEach(() => {
  vi.useRealTimers();
});

async function pdfWithPages(pages: number) {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pages; i++) pdf.addPage();
  return await pdf.save();
}

/** Uploads a PDF and lets the Extraction it starts run to the end. */
async function uploadAndExtract(
  t: Backend,
  user: User,
  organisationSlug: string,
  formId: Id<"forms">,
  pages = 1,
) {
  const { key, url } = await user.mutation(api.documents.generateUploadUrl, {
    organisationSlug,
  });
  putToUploadUrl(url, await pdfWithPages(pages));
  await user.action(api.documents.create, {
    organisationSlug,
    formId,
    key,
    filename: "werkorder.pdf",
  });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const { documents } = await user.query(api.documents.list, {
    organisationSlug,
    state: "needs_review",
  });
  return documents[0]?.id;
}

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
  expect(document.fieldValues).toEqual([
    {
      key: "licensePlate",
      label: "Kenteken",
      value: "NWA30E",
      readText: "NWA-30-E",
      sourcePath: "vehicle.licensePlate",
      pages: [1],
      matchProbability: 0.97,
    },
    {
      key: "mileageKm",
      label: "Kilometerstand",
      value: 9899,
      readText: "9.899 km",
      sourcePath: "vehicle.mileage",
      pages: [1],
      matchProbability: 0.91,
    },
    {
      key: "orderNumber",
      label: "Werkorder",
      value: "WO-0142",
      readText: "WO-0142",
      sourcePath: "workOrder.number",
      pages: [2],
      matchProbability: 0.88,
    },
    {
      key: "purchaseOrderNumber",
      label: "Bestelbon",
      value: null,
      readText: null,
      sourcePath: null,
      pages: [],
      matchProbability: 0.93,
    },
  ]);
});

test("an Extraction reads, then matches the stored Reading, then fills only the matched Fields", async () => {
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
    },
    { step: "fill", fields: ["licensePlate", "mileageKm", "orderNumber"] },
  ]);
});

test("an Extraction that is run again matches the stored Reading without reading the PDF again", async () => {
  const t = newBackend();
  const { user, slug, formId } = await acmeWithWorkOrderForm(t);
  fakePipeline.replay(workOrder);
  fakePipeline.failOnce("match");

  await uploadAndExtract(t, user, slug, formId, 2);

  expect(fakePipeline.calls.map((c) => c.step)).toEqual(["read", "match", "match", "fill"]);
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
  fields: Array<{ path: string; sources: Array<{ id: string; probability: number }> }>;
};
type RecordedRun = {
  fieldValues: Record<string, { readText: string | null; pages: number[] }>;
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
  const topLevel = map.fields.filter((f) => !f.path.includes("["));
  const recording: Recording = {
    reading: recorded(`${dir}/clean-opus.json`) as Recording["reading"],
    matches: Object.fromEntries(
      topLevel.map((f) => {
        const [best] = f.sources;
        return [f.path, { path: best.id === "none" ? null : best.id, probability: best.probability }];
      }),
    ),
    fills: Object.fromEntries(
      topLevel.map((f) => [f.path, (fills[f.path]?.value ?? null) as FilledValue]),
    ),
  };
  return {
    recording,
    form: fixtureForms[`../fixtures/forms/${expected.form}.json`].default,
    pages: expected.pages,
    topLevel,
    run: recorded(`${dir}/run2-opus-clean.json`) as RecordedRun,
  };
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
    test(`${fixture}: every top-level Field gets the Field Value its recorded Match and Fill give`, async () => {
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

      expect(fakePipeline.calls.map((c) => c.step)).toEqual(["read", "match", "fill"]);
      expect(fakePipeline.calls[1]).toMatchObject({ reading: recording.reading });
      const document = await ann.user.query(api.documents.get, {
        organisationSlug: ann.slug,
        documentId: documentId!,
      });
      expect(document.state).toBe("needs_review");
      expect(document.fieldValues).toEqual(
        topLevel.map(({ path: key, sources: [best] }) => ({
          key,
          label: key,
          value: best.id === "none" ? null : recording.fills[key],
          readText: run.fieldValues[key].readText,
          sourcePath: best.id === "none" ? null : best.id,
          pages: run.fieldValues[key].pages,
          matchProbability: best.probability,
        })),
      );
    });
  }
});
