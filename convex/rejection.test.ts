import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import {
  addMembership,
  fakePdfStore,
  fakePipeline,
  newBackend,
  pdfWithPages,
  putToUploadUrl,
  signUp,
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

const workOrder: Recording = {
  reading: { vehicle: { license_plate: "NWA-30-E", mileage: "9899", _pages: [1] } },
  matches: {
    license_plate: { path: "vehicle.license_plate", probability: 0.97 },
    mileage_km: { path: "vehicle.mileage", probability: 0.55 },
  },
  fills: { license_plate: "NWA30E", mileage_km: 9899 },
};

async function uploaded(t: Backend) {
  const ann = await signUp(t, "ann", "Acme Fleet");
  const organisationSlug = ann.slug;
  const { formId } = await ann.user.mutation(api.forms.create, {
    organisationSlug,
    name: "Work order",
    fields: [
      { type: "text", label: "Kenteken", key: "license_plate", required: true },
      { type: "number", label: "Kilometerstand", key: "mileage_km", required: false },
    ],
  });
  fakePipeline.replay(workOrder);
  const { key, url } = await ann.user.mutation(api.submissions.generateUploadUrl, {
    organisationSlug,
  });
  putToUploadUrl(url, await pdfWithPages(1));
  await ann.user.action(api.submissions.create, {
    organisationSlug,
    formId,
    key,
    filename: "werkorder.pdf",
  });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const submissionId = await t.run(async (ctx) => (await ctx.db.query("submissions").first())!._id);
  const bob = await addMembership(t, "bob", organisationSlug, "member");
  const on = { organisationSlug, submissionId };
  const read = () => ann.user.query(api.submissions.get, on);
  return { ...ann, bob, key, submissionId, on, read };
}

test("a Member rejects a Submission with a reason; it is listed under Rejected with who, when and why", async () => {
  const t = newBackend();
  const { bob, on, read } = await uploaded(t);
  vi.setSystemTime(new Date("2026-09-24T12:00:00Z"));

  await bob.mutation(api.rejection.reject, { ...on, reason: "Blank scan" });

  const submission = await read();
  expect(submission.state).toBe("rejected");
  expect(submission.rejection).toEqual({
    by: "bob@example.com",
    at: Date.parse("2026-09-24T12:00:00Z"),
    reason: "Blank scan",
  });
  expect(submission.history.at(-1)).toMatchObject({ event: "rejected", detail: "Blank scan" });
  const { submissions, counts } = await bob.query(api.submissions.list, {
    organisationSlug: on.organisationSlug,
    state: "rejected",
  });
  expect(submissions).toEqual([
    expect.objectContaining({
      state: "rejected",
      rejection: { by: "bob@example.com", at: Date.parse("2026-09-24T12:00:00Z"), reason: "Blank scan" },
    }),
  ]);
  expect(counts).toMatchObject({ needs_review: 0, rejected: 1 });
});

test("a reason is optional", async () => {
  const t = newBackend();
  const { user, on, read } = await uploaded(t);

  await user.mutation(api.rejection.reject, on);

  expect((await read()).rejection).toMatchObject({ reason: null });
});

test("a Submission whose Extraction failed can be rejected, and reopens as failed", async () => {
  const t = newBackend();
  fakePipeline.failTimes("read", 4);
  const { user, on, read } = await uploaded(t);

  await user.mutation(api.rejection.reject, on);
  await user.mutation(api.rejection.reopen, on);

  expect((await read()).state).toBe("extraction_failed");
});

test("Reopen brings back the prior state with the corrections, and sets user touched", async () => {
  const t = newBackend();
  const { user, on, read } = await uploaded(t);
  const mileage_km = (await read()).fieldValues.find((f) => f.key === "mileage_km")!;
  await user.mutation(api.review.check, { organisationSlug: on.organisationSlug, fieldValueId: mileage_km.id });
  await user.mutation(api.rejection.reject, on);

  await user.mutation(api.rejection.reopen, on);

  const submission = await read();
  expect(submission.state).toBe("needs_review");
  expect(submission.rejection).toBeNull();
  expect(submission.userTouched).toBe(true);
  expect(submission.fieldValues.find((f) => f.key === "mileage_km")!.review).toMatchObject({ state: "checked" });
  expect(submission.history.map((h) => h.event).slice(-2)).toEqual(["rejected", "reopened"]);
});

test("an approved Submission can't be rejected", async () => {
  const t = newBackend();
  const { user, on, read } = await uploaded(t);
  const mileage_km = (await read()).fieldValues.find((f) => f.key === "mileage_km")!;
  await user.mutation(api.review.check, { organisationSlug: on.organisationSlug, fieldValueId: mileage_km.id });
  await user.mutation(api.review.approve, on);

  await expect(user.mutation(api.rejection.reject, on)).rejects.toThrow("This Submission is approved");
});

test("only a Rejected Submission can be reopened", async () => {
  const t = newBackend();
  const { user, on } = await uploaded(t);

  await expect(user.mutation(api.rejection.reopen, on)).rejects.toThrow("Only a Rejected Submission");
});

test("a Member can't delete a Submission", async () => {
  const t = newBackend();
  const { bob, on } = await uploaded(t);
  await bob.mutation(api.rejection.reject, on);

  await expect(bob.mutation(api.rejection.remove, on)).rejects.toThrow("Forbidden");
});

test("an Admin deletes a Rejected Submission: the PDF and its data go, the metadata and a Deleted line stay", async () => {
  const t = newBackend();
  const { user, key, on, read } = await uploaded(t);
  await user.mutation(api.rejection.reject, { ...on, reason: "Private data" });

  await user.mutation(api.rejection.remove, on);

  expect(fakePdfStore.objects.has(key)).toBe(false);
  const submission = await read();
  expect(submission).toMatchObject({
    state: "deleted",
    filename: "werkorder.pdf",
    fieldValues: [],
    lists: [],
  });
  expect(submission.history.at(-1)).toMatchObject({ event: "deleted", by: "ann@example.com" });
  const leftovers = await t.run(async (ctx) => ({
    readings: await ctx.db.query("readings").collect(),
    fieldValues: await ctx.db.query("fieldValues").collect(),
  }));
  expect(leftovers).toEqual({ readings: [], fieldValues: [] });
  await expect(user.mutation(api.rejection.reopen, on)).rejects.toThrow("Only a Rejected Submission");
  await expect(user.mutation(api.submissions.pdfUrl, on)).rejects.toThrow("The PDF was deleted");
});

test("a deleted Submission stays listed under Rejected", async () => {
  const t = newBackend();
  const { user, on } = await uploaded(t);
  await user.mutation(api.rejection.reject, on);
  await user.mutation(api.rejection.remove, on);

  const { submissions, counts } = await user.query(api.submissions.list, {
    organisationSlug: on.organisationSlug,
    state: "rejected",
  });

  expect(submissions).toEqual([expect.objectContaining({ state: "deleted" })]);
  expect(counts).toMatchObject({ rejected: 0 });
});

test("nobody can reject another Organisation's Submission", async () => {
  const t = newBackend();
  const { submissionId } = await uploaded(t);
  const eve = await signUp(t, "eve", "Evil Corp");

  await expect(
    eve.user.mutation(api.rejection.reject, { organisationSlug: eve.slug, submissionId }),
  ).rejects.toThrow("Submission not found");
});
