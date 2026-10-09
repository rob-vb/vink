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
});

// Two tyre changes, the second without a position. Jev isn't sure it found them
// all (0.6), and as a sub-Field's Match is the lower of the array and key
// choices, every value is below the threshold too.
const tyreReport: Recording = {
  reading: {
    _pages: [1, 2],
    tyre_changes: [
      { position: "2L1", serial: "6135366435", _pages: [1] },
      { serial: "BPP10930524", _pages: [2] },
    ],
  },
  matches: {},
  lists: {
    tyre_changes: {
      path: "tyre_changes",
      probability: 0.6,
      keys: {
        position: { path: "position", probability: 0.99 },
        serial: { path: "serial", probability: 0.95 },
      },
    },
  },
  fills: {
    "tyre_changes[0].position": "2L1",
    "tyre_changes[0].serial": "6135366435",
    "tyre_changes[1].serial": "BPP10930524",
  },
};

async function reviewing(recording: Recording = tyreReport, listRequired = false) {
  const t = newBackend();
  const ann = await signUp(t, "ann", "Acme Fleet");
  const { formId } = await ann.user.mutation(api.forms.create, {
    organisationSlug: ann.slug,
    name: "Tyre service",
    fields: [
      {
        type: "list",
        label: "Bandenwissels",
        key: "tyre_changes",
        required: listRequired,
        fields: [
          { type: "text", label: "Positie", key: "position", required: true },
          { type: "text", label: "Serienummer", key: "serial", required: false },
        ],
      },
    ],
  });
  fakePipeline.replay(recording);
  const submissionId = (await uploadAndExtract(t, ann.user, ann.slug, formId, 2))!;
  const organisationSlug = ann.slug;
  const read = () => ann.user.query(api.submissions.get, { organisationSlug, submissionId });
  const list = async () => (await read()).lists[0];
  const on = { organisationSlug, submissionId, listKey: "tyre_changes" };
  return { t, ...ann, submissionId, read, list, on };
}

test("a List Field's entries each list a Field Value per sub-Field, and its completeness and sub-Fields count towards Needs Review", async () => {
  const { read, list } = await reviewing();

  const tyre_changes = await list();
  expect(tyre_changes.needsReview).toBe(true);
  expect(tyre_changes.entries.map((e) => e.fieldValues.map((f) => f.value))).toEqual([
    ["2L1", "6135366435"],
    [null, "BPP10930524"],
  ]);
  // The completeness, and the 4 values.
  expect((await read()).needsReviewCount).toBe(5);
});

test("\"Entries are complete\" clears the completeness Needs Review, records who and when, and can be undone", async () => {
  const { user, on, read, list } = await reviewing();
  vi.setSystemTime(new Date("2026-09-24T10:00:00Z"));

  await user.mutation(api.review.confirmEntries, on);

  expect(await list()).toMatchObject({
    needsReview: false,
    complete: { by: "ann@example.com", at: Date.parse("2026-09-24T10:00:00Z") },
  });
  const submission = await read();
  expect(submission.needsReviewCount).toBe(4);
  expect(submission.userTouched).toBe(true);
  expect(submission.history.map((h) => h.event)).toContain("entries_confirmed");

  await user.mutation(api.review.undoConfirmEntries, on);

  expect(await list()).toMatchObject({ needsReview: true, complete: null });
});

test("removing an entry takes its values out of review, and restoring it brings them back", async () => {
  const { user, on, read, list } = await reviewing();

  await user.mutation(api.review.removeEntry, { ...on, entry: 1 });

  expect((await list()).entries[1]).toMatchObject({ entry: 1, removed: true });
  expect((await read()).needsReviewCount).toBe(3);
  expect((await read()).userTouched).toBe(true);

  await user.mutation(api.review.restoreEntry, { ...on, entry: 1 });

  expect((await list()).entries[1]).toMatchObject({ removed: false });
  expect((await read()).needsReviewCount).toBe(5);
  expect((await read()).history.map((h) => h.event)).toEqual(
    expect.arrayContaining(["entry_removed", "entry_restored"]),
  );
});

test("an added entry starts empty, and its required sub-Fields are Needs Review until filled in", async () => {
  const { user, on, read, list } = await reviewing();

  const { entry } = await user.mutation(api.review.addEntry, on);

  const added = (await list()).entries.find((e) => e.entry === entry)!;
  expect(added).toMatchObject({ added: true, removed: false });
  expect(added.fieldValues).toMatchObject([
    { key: "position", value: null, readText: null, needsReview: true, reviewReasons: ["required_empty"] },
    { key: "serial", value: null, needsReview: false },
  ]);
  expect((await read()).needsReviewCount).toBe(6);
  expect((await read()).history.map((h) => h.event)).toContain("entry_added");

  await user.mutation(api.review.correct, {
    organisationSlug: on.organisationSlug,
    fieldValueId: added.fieldValues[0].id,
    value: "2R1",
  });

  expect((await read()).needsReviewCount).toBe(5);
});

test("an added entry is undone by removing it", async () => {
  const { user, on, read } = await reviewing();
  const { entry } = await user.mutation(api.review.addEntry, on);

  await user.mutation(api.review.removeEntry, { ...on, entry });

  expect((await read()).needsReviewCount).toBe(5);
});

test("a required List Field with no entries left is Needs Review, and can't be confirmed complete", async () => {
  const { user, on, list } = await reviewing(tyreReport, true);
  await user.mutation(api.review.removeEntry, { ...on, entry: 0 });
  await user.mutation(api.review.removeEntry, { ...on, entry: 1 });

  expect(await list()).toMatchObject({ needsReview: true, reviewReasons: ["below_threshold", "required_empty"] });
  await expect(user.mutation(api.review.confirmEntries, on)).rejects.toThrow(
    "Bandenwissels is required: add an entry first",
  );
});

test("Approval waits for the List's completeness and its sub-Fields, then goes through", async () => {
  const { user, on, read, list } = await reviewing();
  await expect(user.mutation(api.review.approve, { organisationSlug: on.organisationSlug, submissionId: on.submissionId })).rejects.toThrow("5 values still need review");

  await user.mutation(api.review.confirmEntries, on);
  const [first, second] = (await list()).entries.map((e) => e.fieldValues);
  for (const fieldValue of [...first, second[1]]) {
    await user.mutation(api.review.check, {
      organisationSlug: on.organisationSlug,
      fieldValueId: fieldValue.id,
    });
  }
  await user.mutation(api.review.correct, {
    organisationSlug: on.organisationSlug,
    fieldValueId: second[0].id,
    value: "2R1",
  });
  await user.mutation(api.review.approve, { organisationSlug: on.organisationSlug, submissionId: on.submissionId });

  expect((await read()).state).toBe("approved");
  await expect(user.mutation(api.review.addEntry, on)).rejects.toThrow("This Submission is approved");
});

test("nobody can change another Organisation's List entries", async () => {
  const { t, on } = await reviewing();
  const eve = await signUp(t, "eve", "Evil Corp");

  await expect(
    eve.user.mutation(api.review.addEntry, { ...on, organisationSlug: eve.slug }),
  ).rejects.toThrow("Submission not found");
});
