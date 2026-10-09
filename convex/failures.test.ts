import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
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

/** Uploads a PDF and lets the Extraction run, however it ends. */
async function uploaded(t: Backend) {
  const ann = await signUp(t, "ann", "Acme Fleet");
  const { formId } = await ann.user.mutation(api.forms.create, {
    organisationSlug: ann.slug,
    name: "Work order",
    fields: [
      { type: "text", label: "Kenteken", key: "license_plate", required: true },
      { type: "number", label: "Kilometerstand", key: "mileage_km", required: false },
    ],
  });
  fakePipeline.replay(workOrder);
  const organisationSlug = ann.slug;
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
  await settle(t);
  const submissionId = await t.run(
    async (ctx) => (await ctx.db.query("submissions").first())!._id,
  );
  const read = () => ann.user.query(api.submissions.get, { organisationSlug, submissionId });
  return { ...ann, submissionId, read };
}

const settle = (t: Backend) => t.finishAllScheduledFunctions(vi.runAllTimers);
const steps = () => fakePipeline.calls.map((c) => c.step);

test.each(["read", "match", "fill"] as const)(
  "a %s failure is tried 4 times in all, then the Submission is Extraction Failed",
  async (step) => {
    const t = newBackend();
    fakePipeline.failTimes(step, 4);

    const { read, user, slug } = await uploaded(t);

    expect(steps().filter((s) => s === step)).toHaveLength(4);
    const submission = await read();
    expect(submission.state).toBe("extraction_failed");
    expect(submission.history.map((h) => h.event)).toEqual(["uploaded", "extraction_failed"]);
    // The screen gets a code, never the server's error text.
    expect(submission.failure).toBe("failed");
    expect(JSON.stringify(submission)).not.toContain(`${step} is down`);
    const { counts, submissions } = await user.query(api.submissions.list, {
      organisationSlug: slug,
      state: "extraction_failed",
    });
    expect(counts).toMatchObject({ extracting: 0, extraction_failed: 1 });
    expect(submissions).toHaveLength(1);
  },
);

test("an outage that heals within the retries still extracts the Submission", async () => {
  const t = newBackend();
  fakePipeline.failTimes("fill", 3);

  const { read } = await uploaded(t);

  expect((await read()).state).toBe("needs_review");
});

test("a retry after the Reading was stored resumes at Match, without reading the PDF again", async () => {
  const t = newBackend();
  fakePipeline.failTimes("match", 4);
  const { user, slug, submissionId, read } = await uploaded(t);
  fakePipeline.calls = [];

  await user.mutation(api.extraction.retry, { organisationSlug: slug, submissionId });
  expect((await read()).state).toBe("extracting");
  await settle(t);

  expect(steps()).toEqual(["match", "fill", "verify"]);
  const submission = await read();
  expect(submission.state).toBe("needs_review");
  expect(submission.history.map((h) => h.event)).toEqual([
    "uploaded",
    "extraction_failed",
    "extraction_retried",
    "extracted",
  ]);
});

test("a retry with no Reading stored runs a full Extraction", async () => {
  const t = newBackend();
  fakePipeline.failTimes("read", 4);
  const { user, slug, submissionId, read } = await uploaded(t);
  fakePipeline.calls = [];

  await user.mutation(api.extraction.retry, { organisationSlug: slug, submissionId });
  await settle(t);

  expect(steps()).toEqual(["read", "match", "fill", "verify"]);
  expect((await read()).state).toBe("needs_review");
});

test("a Member can retry, but only an Extraction that failed", async () => {
  const t = newBackend();
  fakePipeline.failTimes("read", 4);
  const { slug, submissionId } = await uploaded(t);
  const bob = await addMembership(t, "bob", slug, "member");

  await bob.mutation(api.extraction.retry, { organisationSlug: slug, submissionId });
  await settle(t);

  await expect(
    bob.mutation(api.extraction.retry, { organisationSlug: slug, submissionId }),
  ).rejects.toThrow("Only a failed Extraction can be retried");
});

test("nobody can retry another Organisation's Extraction", async () => {
  const t = newBackend();
  fakePipeline.failTimes("read", 4);
  const { submissionId } = await uploaded(t);
  const eve = await signUp(t, "eve", "Evil Corp");

  await expect(
    eve.user.mutation(api.extraction.retry, { organisationSlug: eve.slug, submissionId }),
  ).rejects.toThrow("Submission not found");
});

test("a run that comes late never overwrites a user's corrections", async () => {
  const t = newBackend();
  const { user, slug, submissionId, read } = await uploaded(t);
  const mileage_km = (await read()).fieldValues.find((f) => f.key === "mileage_km")!;
  await user.mutation(api.review.correct, {
    organisationSlug: slug,
    fieldValueId: mileage_km.id,
    value: 9800,
  });

  await t.action(internal.extractionRun.run, { submissionId: submissionId as Id<"submissions"> });

  const submission = await read();
  expect(submission.fieldValues).toHaveLength(2);
  expect(submission.fieldValues.find((f) => f.key === "mileage_km")).toMatchObject({
    value: 9800,
    review: { state: "corrected" },
  });
});
