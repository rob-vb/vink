import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  addMembership,
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

// Mileage is below the threshold and the order number is required but missing.
const workOrder: Recording = {
  reading: {
    _pages: [1],
    vehicle: { license_plate: "NWA-30-E", mileage: "9899", _pages: [1] },
  },
  matches: {
    license_plate: { path: "vehicle.license_plate", probability: 0.97 },
    mileage_km: { path: "vehicle.mileage", probability: 0.55 },
    order_number: { path: null, probability: 0.9 },
  },
  fills: { license_plate: "NWA30E", mileage_km: 9899 },
};

async function acmeWithWorkOrderForm(t: Backend) {
  const ann = await signUp(t, "ann", "Acme Fleet");
  const { formId } = await ann.user.mutation(api.forms.create, {
    organisationSlug: ann.slug,
    name: "Work order",
    fields: [
      { type: "text", label: "Kenteken", key: "license_plate", required: true },
      { type: "number", label: "Kilometerstand", key: "mileage_km", required: false },
      { type: "text", label: "Werkorder", key: "order_number", required: true },
    ],
  });
  return { ...ann, formId };
}

async function reviewing(recording: Recording = workOrder) {
  const t = newBackend();
  const acme = await acmeWithWorkOrderForm(t);
  fakePipeline.replay(recording);
  const submissionId = (await uploadAndExtract(t, acme.user, acme.slug, acme.formId))!;
  const read = () =>
    acme.user.query(api.submissions.get, { organisationSlug: acme.slug, submissionId });
  const idOf = async (key: string) => (await read()).fieldValues.find((f) => f.key === key)!.id;
  return { t, ...acme, submissionId, read, idOf };
}

test("a Submission with values to check lists how many are Needs Review", async () => {
  const { read } = await reviewing();

  const submission = await read();
  expect(submission.needsReviewCount).toBe(2);
  expect(submission.fieldValues.map((f) => [f.key, f.needsReview])).toEqual([
    ["license_plate", false],
    ["mileage_km", true],
    ["order_number", true],
  ]);
});

test("correcting a value marks it Corrected by whom and when, and clears Needs Review", async () => {
  const { user, slug, read, idOf } = await reviewing();
  vi.setSystemTime(new Date("2026-09-24T10:00:00Z"));

  await user.mutation(api.review.correct, {
    organisationSlug: slug,
    fieldValueId: await idOf("order_number"),
    value: "WO-0142",
  });

  const submission = await read();
  const order_number = submission.fieldValues.find((f) => f.key === "order_number")!;
  expect(order_number).toMatchObject({
    value: "WO-0142",
    needsReview: false,
    reviewReasons: ["required_empty"],
    review: { state: "corrected", by: "ann@example.com", at: Date.parse("2026-09-24T10:00:00Z") },
  });
  expect(submission.needsReviewCount).toBe(1);
  expect(submission.userTouched).toBe(true);
  expect(submission.history.map((h) => h.event)).toContain("corrected");
});

test("a correction must fit the Field's type, and a required Field can't be corrected to empty", async () => {
  const { user, slug, idOf } = await reviewing();

  await expect(
    user.mutation(api.review.correct, {
      organisationSlug: slug,
      fieldValueId: await idOf("mileage_km"),
      value: "a lot",
    }),
  ).rejects.toThrow("Kilometerstand needs a number");
  await expect(
    user.mutation(api.review.correct, {
      organisationSlug: slug,
      fieldValueId: await idOf("order_number"),
      value: null,
    }),
  ).rejects.toThrow("Werkorder is required");
});

test("confirming a value marks it Checked and clears Needs Review, without touching the Submission", async () => {
  const { user, slug, read, idOf } = await reviewing();

  await user.mutation(api.review.check, {
    organisationSlug: slug,
    fieldValueId: await idOf("mileage_km"),
  });

  const submission = await read();
  expect(submission.fieldValues.find((f) => f.key === "mileage_km")).toMatchObject({
    value: 9899,
    needsReview: false,
    review: { state: "checked", by: "ann@example.com" },
  });
  expect(submission.userTouched).toBe(false);
});

test("undoing a correction brings back the extracted value and Needs Review", async () => {
  const { user, slug, read, idOf } = await reviewing();
  const mileage_km = await idOf("mileage_km");
  await user.mutation(api.review.correct, { organisationSlug: slug, fieldValueId: mileage_km, value: 9800 });
  await user.mutation(api.review.correct, { organisationSlug: slug, fieldValueId: mileage_km, value: 9900 });

  await user.mutation(api.review.undo, { organisationSlug: slug, fieldValueId: mileage_km });

  const submission = await read();
  expect(submission.fieldValues.find((f) => f.key === "mileage_km")).toMatchObject({
    value: 9899,
    needsReview: true,
    review: null,
  });
});

test("undoing a check brings back Needs Review", async () => {
  const { user, slug, read, idOf } = await reviewing();
  const mileage_km = await idOf("mileage_km");
  await user.mutation(api.review.check, { organisationSlug: slug, fieldValueId: mileage_km });

  await user.mutation(api.review.undo, { organisationSlug: slug, fieldValueId: mileage_km });

  expect((await read()).needsReviewCount).toBe(2);
});

test("Approval is refused while anything is Needs Review", async () => {
  const { user, slug, submissionId, read, idOf } = await reviewing();
  await user.mutation(api.review.check, {
    organisationSlug: slug,
    fieldValueId: await idOf("mileage_km"),
  });

  await expect(
    user.mutation(api.review.approve, { organisationSlug: slug, submissionId }),
  ).rejects.toThrow("1 value still needs review");
  expect((await read()).state).toBe("needs_review");
});

test("Approval with no Integration attached marks the Submission approved, manually, by whom and when", async () => {
  const { user, slug, submissionId, read, idOf } = await reviewing();
  await user.mutation(api.review.check, { organisationSlug: slug, fieldValueId: await idOf("mileage_km") });
  await user.mutation(api.review.correct, {
    organisationSlug: slug,
    fieldValueId: await idOf("order_number"),
    value: "WO-0142",
  });
  vi.setSystemTime(new Date("2026-09-24T11:00:00Z"));

  await user.mutation(api.review.approve, { organisationSlug: slug, submissionId });

  const submission = await read();
  expect(submission.state).toBe("approved");
  expect(submission.approval).toEqual({
    mode: "manual",
    by: "ann@example.com",
    at: Date.parse("2026-09-24T11:00:00Z"),
  });
  expect(submission.history.map((h) => h.event)).toEqual(["uploaded", "extracted", "corrected", "approved"]);
  const { counts } = await user.query(api.submissions.list, { organisationSlug: slug, state: "approved" });
  expect(counts).toMatchObject({ needs_review: 0, approved: 1 });
});

test("an approved Submission can't be corrected, checked or approved again", async () => {
  const clean: Recording = {
    ...workOrder,
    matches: { ...workOrder.matches, mileage_km: { path: "vehicle.mileage", probability: 0.95 } },
    reading: { ...workOrder.reading, order: { number: "WO-1", _pages: [1] } },
  };
  clean.matches.order_number = { path: "order.number", probability: 0.95 };
  clean.fills = { ...workOrder.fills, order_number: "WO-1" };
  const { user, slug, submissionId, idOf } = await reviewing(clean);
  await user.mutation(api.review.approve, { organisationSlug: slug, submissionId });

  await expect(
    user.mutation(api.review.correct, {
      organisationSlug: slug,
      fieldValueId: await idOf("mileage_km"),
      value: 1,
    }),
  ).rejects.toThrow("This Submission is approved");
  await expect(
    user.mutation(api.review.approve, { organisationSlug: slug, submissionId }),
  ).rejects.toThrow("This Submission is approved");
});

test("\"Approve and next\" gets the next Submission that needs review", async () => {
  const { t, user, slug, formId, submissionId: first, idOf } = await reviewing();
  const second = (await uploadAndExtract(t, user, slug, formId))!;
  await user.mutation(api.review.check, { organisationSlug: slug, fieldValueId: await idOf("mileage_km") });
  await user.mutation(api.review.correct, {
    organisationSlug: slug,
    fieldValueId: await idOf("order_number"),
    value: "WO-0142",
  });

  const { nextSubmissionId } = await user.mutation(api.review.approve, {
    organisationSlug: slug,
    submissionId: first,
  });

  expect(nextSubmissionId).toBe(second);
});

test("the last Submission in the queue has no next one", async () => {
  const { user, slug, submissionId, idOf } = await reviewing();
  await user.mutation(api.review.check, { organisationSlug: slug, fieldValueId: await idOf("mileage_km") });
  await user.mutation(api.review.correct, {
    organisationSlug: slug,
    fieldValueId: await idOf("order_number"),
    value: "WO-0142",
  });

  const { nextSubmissionId } = await user.mutation(api.review.approve, { organisationSlug: slug, submissionId });

  expect(nextSubmissionId).toBeNull();
});

test("a Member can review and approve", async () => {
  const { t, slug, submissionId, idOf } = await reviewing();
  const bob = await addMembership(t, "bob", slug, "member");

  await bob.mutation(api.review.check, { organisationSlug: slug, fieldValueId: await idOf("mileage_km") });

  expect(
    (await bob.query(api.submissions.get, { organisationSlug: slug, submissionId })).fieldValues.find(
      (f) => f.key === "mileage_km",
    )!.review,
  ).toMatchObject({ state: "checked", by: "bob@example.com" });
});

test("nobody can review another Organisation's Field Values", async () => {
  const { t, idOf, submissionId } = await reviewing();
  const eve = await signUp(t, "eve", "Evil Corp");
  const fieldValueId: Id<"fieldValues"> = await idOf("mileage_km");

  await expect(
    eve.user.mutation(api.review.check, { organisationSlug: eve.slug, fieldValueId }),
  ).rejects.toThrow("Not found");
  await expect(
    eve.user.mutation(api.review.approve, { organisationSlug: eve.slug, submissionId }),
  ).rejects.toThrow("Submission not found");
});
