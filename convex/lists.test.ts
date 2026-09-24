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

beforeEach(() => {
  vi.useFakeTimers();
  fakePdfStore.objects.clear();
  fakePipeline.reset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

// A tyre report with two tyre changes; the second has no tread depth.
const tyreReport: Recording = {
  reading: {
    _pages: [1, 2],
    vehicle: { licensePlate: "OR18DH", _pages: [1] },
    tyreChanges: [
      {
        position: "2L1",
        removed: { serial: "6135366435", treadDepthMm: "3" },
        _pages: [1],
      },
      {
        position: "2R1",
        removed: { serial: "BPP10930524" },
        _pages: [2],
      },
    ],
  },
  matches: { licensePlate: { path: "vehicle.licensePlate", probability: 0.97 } },
  lists: {
    tyreChanges: {
      path: "tyreChanges",
      probability: 0.94,
      keys: {
        position: { path: "position", probability: 0.99 },
        removedSerial: { path: "removed.serial", probability: 0.9 },
        treadDepthMm: { path: "removed.treadDepthMm", probability: 0.96 },
      },
    },
  },
  fills: {
    licensePlate: "OR18DH",
    "tyreChanges[0].position": "2L1",
    "tyreChanges[0].removedSerial": "6135366435",
    "tyreChanges[0].treadDepthMm": 3,
    "tyreChanges[1].position": "2R1",
    "tyreChanges[1].removedSerial": "BPP10930524",
  },
};

type ListOptions = { listRequired?: boolean; treadDepthRequired?: boolean };

async function extracted(recording: Recording, options: ListOptions = {}) {
  const t = newBackend();
  const ann = await signUp(t, "ann", "Acme Fleet");
  const { formId } = await ann.user.mutation(api.forms.create, {
    organisationSlug: ann.slug,
    name: "Tyre service",
    fields: [
      { type: "text", label: "Kenteken", key: "licensePlate", required: false },
      {
        type: "list",
        label: "Bandenwissels",
        key: "tyreChanges",
        required: options.listRequired ?? false,
        fields: [
          { type: "text", label: "Positie", key: "position", required: false },
          { type: "text", label: "Serienummer", key: "removedSerial", required: false },
          {
            type: "number",
            label: "Profieldiepte",
            key: "treadDepthMm",
            required: options.treadDepthRequired ?? false,
          },
        ],
      },
    ],
  });
  fakePipeline.replay(recording);
  const documentId = await uploadAndExtract(t, ann.user, ann.slug, formId, 2);
  const document = await ann.user.query(api.documents.get, {
    organisationSlug: ann.slug,
    documentId: documentId!,
  });
  return { t, ...ann, formId, document, list: document.lists[0] };
}

test("a List Field gets one entry per element of the array Match chose, with a Field Value per sub-Field", async () => {
  const { list } = await extracted(tyreReport);

  expect(list).toMatchObject({ key: "tyreChanges", label: "Bandenwissels", sourcePath: "tyreChanges" });
  expect(list.entries).toHaveLength(2);
  expect(list.entries[0]).toMatchObject([
    { key: "position", label: "Positie", value: "2L1", readText: "2L1", sourcePath: "tyreChanges[0].position", pages: [1] },
    { key: "removedSerial", value: "6135366435", sourcePath: "tyreChanges[0].removed.serial", pages: [1] },
    { key: "treadDepthMm", value: 3, readText: "3", sourcePath: "tyreChanges[0].removed.treadDepthMm" },
  ]);
  expect(list.entries[1]).toMatchObject([
    { key: "position", value: "2R1", pages: [2] },
    { key: "removedSerial", value: "BPP10930524" },
    { key: "treadDepthMm", value: null, readText: null, sourcePath: null, pages: [] },
  ]);
});

test("a sub-Field's Match probability is the lower of the array choice and the key choice", async () => {
  const { list } = await extracted(tyreReport);

  const [position, removedSerial] = list.entries[0];
  expect(position.signals.match).toBe(0.94);
  expect(removedSerial.signals.match).toBe(0.9);
});

test("Match, Fill and Verify each take the List entries along with the top-level Fields", async () => {
  await extracted(tyreReport);

  expect(fakePipeline.calls).toEqual([
    { step: "read" },
    { step: "match", reading: tyreReport.reading, fields: ["licensePlate"], lists: ["tyreChanges"] },
    {
      step: "fill",
      fields: [
        "licensePlate",
        "tyreChanges[0].position",
        "tyreChanges[0].removedSerial",
        "tyreChanges[0].treadDepthMm",
        "tyreChanges[1].position",
        "tyreChanges[1].removedSerial",
      ],
    },
    {
      step: "verify",
      fields: [
        "licensePlate",
        "tyreChanges[0].position",
        "tyreChanges[0].removedSerial",
        "tyreChanges[0].treadDepthMm",
        "tyreChanges[1].position",
        "tyreChanges[1].removedSerial",
      ],
      supportAskedFor: [],
    },
  ]);
});

test("a sub-Field Value is Needs Review by the same rules as a top-level one", async () => {
  const { list } = await extracted({
    ...tyreReport,
    reading: {
      ...tyreReport.reading,
      tyreChanges: [
        {
          position: "2L1",
          removed: { serial: "6135366435", treadDepthMm: "3" },
          _pages: [1],
          _unsure: ["removed.serial"],
        },
        { position: "2R1", removed: { serial: "BPP10930524" }, _pages: [2] },
      ],
    },
    verifications: { "tyreChanges[1].position": { fit: 0.3, support: 1 } },
  });

  expect(list.entries[0][1].reviewReasons).toEqual(["unsure"]);
  expect(list.entries[1][0]).toMatchObject({ confidence: 0.3, reviewReasons: ["below_threshold"] });
});

test("a List Field's completeness confidence is Jev's probability for the array choice", async () => {
  const { list } = await extracted(tyreReport);

  expect(list.completeness).toBe(0.94);
  expect(list.reviewReasons).toEqual([]);
});

test("a List Field whose completeness is below the Review Threshold is Needs Review", async () => {
  const { list } = await extracted({
    ...tyreReport,
    lists: { tyreChanges: { ...tyreReport.lists!.tyreChanges, probability: 0.6 } },
  });

  expect(list.completeness).toBe(0.6);
  expect(list.reviewReasons).toEqual(["below_threshold"]);
});

test("a required List Field with no entries is Needs Review", async () => {
  const { list } = await extracted(
    { ...tyreReport, lists: { tyreChanges: { path: null, probability: 0.9, keys: {} } } },
    { listRequired: true },
  );

  expect(list).toMatchObject({ sourcePath: null, entries: [], reviewReasons: ["required_empty"] });
});

test("an optional List Field with no entries is not Needs Review", async () => {
  const { list } = await extracted({
    ...tyreReport,
    lists: { tyreChanges: { path: null, probability: 0.9, keys: {} } },
  });

  expect(list).toMatchObject({ entries: [], completeness: 0.9, reviewReasons: [] });
});

test("a required sub-Field that is empty in an entry is Needs Review in that entry only", async () => {
  const { list } = await extracted(tyreReport, { treadDepthRequired: true });

  expect(list.entries[0][2].reviewReasons).toEqual([]);
  expect(list.entries[1][2].reviewReasons).toEqual(["required_empty"]);
});

// Enough values that one Match request would pass Jev's 64k-token cap.
function bulkyReading() {
  const reading = structuredClone(tyreReport.reading);
  reading.inventory = Array.from({ length: 3000 }, (_, i) => ({
    article: `Article ${i} with a long printed description`,
    code: `A-${i}`,
  }));
  return reading;
}

test("a Reading over the request cap is matched in two requests, top-level Fields and List Fields apart", async () => {
  const { document } = await extracted({ ...tyreReport, reading: bulkyReading() });

  const matches = fakePipeline.calls.filter((c) => c.step === "match");
  expect(matches.map((c) => ({ fields: c.fields, lists: c.lists }))).toEqual([
    { fields: ["licensePlate"], lists: [] },
    { fields: [], lists: ["tyreChanges"] },
  ]);
  expect(document.lists[0].entries).toHaveLength(2);
});

test("matching in two requests gives the same Field Values as one request", async () => {
  const split = await extracted({ ...tyreReport, reading: bulkyReading() });
  fakePipeline.reset();
  vi.stubEnv("MATCH_TOKEN_CAP", "10000000");
  const single = await extracted({ ...tyreReport, reading: bulkyReading() });

  expect(fakePipeline.calls.filter((c) => c.step === "match")).toHaveLength(1);
  expect(single.document.fieldValues).toEqual(split.document.fieldValues);
  expect(single.document.lists).toEqual(split.document.lists);
});
