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
    vehicle: { license_plate: "OR18DH", _pages: [1] },
    tyre_changes: [
      {
        position: "2L1",
        removed: { serial: "6135366435", tread_depth_mm: "3" },
        _pages: [1],
      },
      {
        position: "2R1",
        removed: { serial: "BPP10930524" },
        _pages: [2],
      },
    ],
  },
  matches: { license_plate: { path: "vehicle.license_plate", probability: 0.97 } },
  lists: {
    tyre_changes: {
      path: "tyre_changes",
      probability: 0.94,
      keys: {
        position: { path: "position", probability: 0.99 },
        removed_serial: { path: "removed.serial", probability: 0.9 },
        tread_depth_mm: { path: "removed.tread_depth_mm", probability: 0.96 },
      },
    },
  },
  fills: {
    license_plate: "OR18DH",
    "tyre_changes[0].position": "2L1",
    "tyre_changes[0].removed_serial": "6135366435",
    "tyre_changes[0].tread_depth_mm": 3,
    "tyre_changes[1].position": "2R1",
    "tyre_changes[1].removed_serial": "BPP10930524",
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
      { type: "text", label: "Kenteken", key: "license_plate", required: false },
      {
        type: "list",
        label: "Bandenwissels",
        key: "tyre_changes",
        required: options.listRequired ?? false,
        fields: [
          { type: "text", label: "Positie", key: "position", required: false },
          { type: "text", label: "Serienummer", key: "removed_serial", required: false },
          {
            type: "number",
            label: "Profieldiepte",
            key: "tread_depth_mm",
            required: options.treadDepthRequired ?? false,
          },
        ],
      },
    ],
  });
  fakePipeline.replay(recording);
  const submissionId = await uploadAndExtract(t, ann.user, ann.slug, formId, 2);
  const submission = await ann.user.query(api.submissions.get, {
    organisationSlug: ann.slug,
    submissionId: submissionId!,
  });
  return { t, ...ann, formId, submission, list: submission.lists[0] };
}

test("a List Field gets one entry per element of the array Match chose, with a Field Value per sub-Field", async () => {
  const { list } = await extracted(tyreReport);

  expect(list).toMatchObject({ key: "tyre_changes", label: "Bandenwissels", sourcePath: "tyre_changes" });
  expect(list.entries).toHaveLength(2);
  expect(list.entries[0].fieldValues).toMatchObject([
    { key: "position", label: "Positie", value: "2L1", readText: "2L1", sourcePath: "tyre_changes[0].position", pages: [1] },
    { key: "removed_serial", value: "6135366435", sourcePath: "tyre_changes[0].removed.serial", pages: [1] },
    { key: "tread_depth_mm", value: 3, readText: "3", sourcePath: "tyre_changes[0].removed.tread_depth_mm" },
  ]);
  expect(list.entries[1].fieldValues).toMatchObject([
    { key: "position", value: "2R1", pages: [2] },
    { key: "removed_serial", value: "BPP10930524" },
    { key: "tread_depth_mm", value: null, readText: null, sourcePath: null, pages: [] },
  ]);
});

test("a sub-Field's Match probability is the lower of the array choice and the key choice", async () => {
  const { list } = await extracted(tyreReport);

  const [position, removed_serial] = list.entries[0].fieldValues;
  expect(position.signals.match).toBe(0.94);
  expect(removed_serial.signals.match).toBe(0.9);
});

test("Match, Fill and Verify each take the List entries along with the top-level Fields", async () => {
  await extracted(tyreReport);

  expect(fakePipeline.calls).toEqual([
    { step: "read" },
    { step: "match", reading: tyreReport.reading, fields: ["license_plate"], lists: ["tyre_changes"] },
    {
      step: "fill",
      fields: [
        "license_plate",
        "tyre_changes[0].position",
        "tyre_changes[0].removed_serial",
        "tyre_changes[0].tread_depth_mm",
        "tyre_changes[1].position",
        "tyre_changes[1].removed_serial",
      ],
    },
    {
      step: "verify",
      fields: [
        "license_plate",
        "tyre_changes[0].position",
        "tyre_changes[0].removed_serial",
        "tyre_changes[0].tread_depth_mm",
        "tyre_changes[1].position",
        "tyre_changes[1].removed_serial",
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
      tyre_changes: [
        {
          position: "2L1",
          removed: { serial: "6135366435", tread_depth_mm: "3" },
          _pages: [1],
          _unsure: ["removed.serial"],
        },
        { position: "2R1", removed: { serial: "BPP10930524" }, _pages: [2] },
      ],
    },
    verifications: { "tyre_changes[1].position": { fit: 0.3, support: 1 } },
  });

  expect(list.entries[0].fieldValues[1].reviewReasons).toEqual(["unsure"]);
  expect(list.entries[1].fieldValues[0]).toMatchObject({ confidence: 0.3, reviewReasons: ["below_threshold"] });
});

test("a List Field's completeness confidence is Jev's probability for the array choice", async () => {
  const { list } = await extracted(tyreReport);

  expect(list.completeness).toBe(0.94);
  expect(list.reviewReasons).toEqual([]);
});

test("a List Field whose completeness is below the Review Threshold is Needs Review", async () => {
  const { list } = await extracted({
    ...tyreReport,
    lists: { tyre_changes: { ...tyreReport.lists!.tyre_changes, probability: 0.6 } },
  });

  expect(list.completeness).toBe(0.6);
  expect(list.reviewReasons).toEqual(["below_threshold"]);
});

test("a required List Field with no entries is Needs Review", async () => {
  const { list } = await extracted(
    { ...tyreReport, lists: { tyre_changes: { path: null, probability: 0.9, keys: {} } } },
    { listRequired: true },
  );

  expect(list).toMatchObject({ sourcePath: null, entries: [], reviewReasons: ["required_empty"] });
});

test("an optional List Field with no entries is not Needs Review", async () => {
  const { list } = await extracted({
    ...tyreReport,
    lists: { tyre_changes: { path: null, probability: 0.9, keys: {} } },
  });

  expect(list).toMatchObject({ entries: [], completeness: 0.9, reviewReasons: [] });
});

test("a required sub-Field that is empty in an entry is Needs Review in that entry only", async () => {
  const { list } = await extracted(tyreReport, { treadDepthRequired: true });

  expect(list.entries[0].fieldValues[2].reviewReasons).toEqual([]);
  expect(list.entries[1].fieldValues[2].reviewReasons).toEqual(["required_empty"]);
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
  const { submission } = await extracted({ ...tyreReport, reading: bulkyReading() });

  const matches = fakePipeline.calls.filter((c) => c.step === "match");
  expect(matches.map((c) => ({ fields: c.fields, lists: c.lists }))).toEqual([
    { fields: ["license_plate"], lists: [] },
    { fields: [], lists: ["tyre_changes"] },
  ]);
  expect(submission.lists[0].entries).toHaveLength(2);
});

test("matching in two requests gives the same Field Values as one request", async () => {
  const split = await extracted({ ...tyreReport, reading: bulkyReading() });
  fakePipeline.reset();
  vi.stubEnv("MATCH_TOKEN_CAP", "10000000");
  const single = await extracted({ ...tyreReport, reading: bulkyReading() });

  expect(fakePipeline.calls.filter((c) => c.step === "match")).toHaveLength(1);
  expect(single.submission.fieldValues).toEqual(split.submission.fieldValues);
  expect(single.submission.lists).toEqual(split.submission.lists);
});

// A long invoice as the Reader writes it: 150 lines, 600 values. Each Field's
// Choice lists 255 of them, so 13 Fields pass Jev's cap in one request.
function longInvoiceReading() {
  const reading = structuredClone(tyreReport.reading);
  reading.lineItems = Array.from({ length: 150 }, (_, i) => ({
    description: `385/55 R 22.5 R168 M+S 160K/158L TL, article ${170000 + i}, montage en balanceren`,
    quantity: `${(i % 4) + 1}`,
    unitPrice: `${(i * 13.37).toFixed(2)} EUR`,
    vatCode: "BTW verlegd",
    _pages: [2],
  }));
  return reading;
}

test("a Form with many Fields is matched in as many requests as Jev's cap needs, with the same Field Values", async () => {
  const fields = Array.from({ length: 12 }, (_, i) => ({
    type: "text" as const,
    label: `Veld ${i}`,
    key: `field${i}`,
    required: false,
  }));
  const run = async () => {
    const t = newBackend();
    const ann = await signUp(t, "ann", "Acme Fleet");
    const { formId } = await ann.user.mutation(api.forms.create, {
      organisationSlug: ann.slug,
      name: "Work order",
      fields: [{ type: "text", label: "Kenteken", key: "license_plate", required: false }, ...fields],
    });
    fakePipeline.replay({ ...tyreReport, reading: longInvoiceReading() });
    const submissionId = await uploadAndExtract(t, ann.user, ann.slug, formId, 2);
    return await ann.user.query(api.submissions.get, { organisationSlug: ann.slug, submissionId: submissionId! });
  };

  const split = await run();
  const requests = fakePipeline.calls.filter((c) => c.step === "match");
  fakePipeline.reset();
  vi.stubEnv("MATCH_TOKEN_CAP", "10000000");
  const single = await run();

  expect(requests.length).toBeGreaterThan(1);
  expect(requests.flatMap((r) => r.fields).sort()).toEqual(
    ["license_plate", ...fields.map((f) => f.key)].sort(),
  );
  expect(split.fieldValues).toEqual(single.fieldValues);
});

test("a sub-Field matched to an object in the entries is filled from all the values in it", async () => {
  const reading = structuredClone(tyreReport.reading);
  const changes = reading.tyre_changes as Array<Record<string, Record<string, unknown>>>;
  // The brand and the model sit apart; the sub-Field wants them together.
  changes[0].removed = { ...changes[0].removed, brand: "WESTLAKE", pattern: "WTR1" };
  changes[1].removed = { ...changes[1].removed, brand: "GITI", pattern: "GTR955", _pages: [3] };
  const recording: Recording = {
    ...tyreReport,
    reading,
    lists: {
      tyre_changes: {
        ...tyreReport.lists!.tyre_changes,
        keys: {
          ...tyreReport.lists!.tyre_changes.keys,
          removed_serial: { path: "removed", probability: 0.9 },
        },
      },
    },
    fills: {
      ...tyreReport.fills,
      "tyre_changes[0].removed_serial": "Westlake WTR1",
      "tyre_changes[1].removed_serial": "Giti GTR955",
    },
  };

  const { list } = await extracted(recording);

  expect(list.entries[0].fieldValues[1]).toMatchObject({
    value: "Westlake WTR1",
    sourcePath: "tyre_changes[0].removed",
    readText: "serial: 6135366435\ntread_depth_mm: 3\nbrand: WESTLAKE\npattern: WTR1",
    pages: [1],
  });
  expect(list.entries[1].fieldValues[1]).toMatchObject({
    value: "Giti GTR955",
    sourcePath: "tyre_changes[1].removed",
    pages: [3],
  });
});

test("a sub-Field's Match probability adds up the keys that give the same value, capped by the array choice", async () => {
  const { list } = await extracted({
    ...tyreReport,
    lists: {
      tyre_changes: {
        ...tyreReport.lists!.tyre_changes,
        keys: {
          ...tyreReport.lists!.tyre_changes.keys,
          tread_depth_mm: {
            path: "removed.tread_depth_mm",
            probability: 0.7,
            alternatives: [{ path: "removed", probability: 0.28 }],
          },
        },
      },
    },
    fills: { ...tyreReport.fills, "tyre_changes[0].tread_depth_mm@tyre_changes[0].removed": 3 },
  });

  const treadDepth = list.entries[0].fieldValues[2];
  expect(treadDepth).toMatchObject({ value: 3, sourcePath: "tyre_changes[0].removed.tread_depth_mm" });
  // 0.7 + 0.28 for the key, but the array choice was 0.94.
  expect(treadDepth.signals.match).toBe(0.94);
});
