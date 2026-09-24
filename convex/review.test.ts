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
    vehicle: { licensePlate: "NWA-30-E", mileage: "9899", _pages: [1] },
  },
  matches: {
    licensePlate: { path: "vehicle.licensePlate", probability: 0.97 },
    mileageKm: { path: "vehicle.mileage", probability: 0.55 },
    orderNumber: { path: null, probability: 0.9 },
  },
  fills: { licensePlate: "NWA30E", mileageKm: 9899 },
};

async function acmeWithWorkOrderForm(t: Backend) {
  const ann = await signUp(t, "ann", "Acme Fleet");
  const { formId } = await ann.user.mutation(api.forms.create, {
    organisationSlug: ann.slug,
    name: "Work order",
    fields: [
      { type: "text", label: "Kenteken", key: "licensePlate", required: true },
      { type: "number", label: "Kilometerstand", key: "mileageKm", required: false },
      { type: "text", label: "Werkorder", key: "orderNumber", required: true },
    ],
  });
  return { ...ann, formId };
}

async function reviewing(recording: Recording = workOrder) {
  const t = newBackend();
  const acme = await acmeWithWorkOrderForm(t);
  fakePipeline.replay(recording);
  const documentId = (await uploadAndExtract(t, acme.user, acme.slug, acme.formId))!;
  const read = () =>
    acme.user.query(api.documents.get, { organisationSlug: acme.slug, documentId });
  const idOf = async (key: string) => (await read()).fieldValues.find((f) => f.key === key)!.id;
  return { t, ...acme, documentId, read, idOf };
}

test("a Document with values to check lists how many are Needs Review", async () => {
  const { read } = await reviewing();

  const document = await read();
  expect(document.needsReviewCount).toBe(2);
  expect(document.fieldValues.map((f) => [f.key, f.needsReview])).toEqual([
    ["licensePlate", false],
    ["mileageKm", true],
    ["orderNumber", true],
  ]);
});

test("correcting a value marks it Corrected by whom and when, and clears Needs Review", async () => {
  const { user, slug, read, idOf } = await reviewing();
  vi.setSystemTime(new Date("2026-09-24T10:00:00Z"));

  await user.mutation(api.review.correct, {
    organisationSlug: slug,
    fieldValueId: await idOf("orderNumber"),
    value: "WO-0142",
  });

  const document = await read();
  const orderNumber = document.fieldValues.find((f) => f.key === "orderNumber")!;
  expect(orderNumber).toMatchObject({
    value: "WO-0142",
    needsReview: false,
    reviewReasons: ["required_empty"],
    review: { state: "corrected", by: "ann@example.com", at: Date.parse("2026-09-24T10:00:00Z") },
  });
  expect(document.needsReviewCount).toBe(1);
  expect(document.userTouched).toBe(true);
  expect(document.history.map((h) => h.event)).toContain("corrected");
});

test("a correction must fit the Field's type, and a required Field can't be corrected to empty", async () => {
  const { user, slug, idOf } = await reviewing();

  await expect(
    user.mutation(api.review.correct, {
      organisationSlug: slug,
      fieldValueId: await idOf("mileageKm"),
      value: "a lot",
    }),
  ).rejects.toThrow("Kilometerstand needs a number");
  await expect(
    user.mutation(api.review.correct, {
      organisationSlug: slug,
      fieldValueId: await idOf("orderNumber"),
      value: null,
    }),
  ).rejects.toThrow("Werkorder is required");
});

test("confirming a value marks it Checked and clears Needs Review, without touching the Document", async () => {
  const { user, slug, read, idOf } = await reviewing();

  await user.mutation(api.review.check, {
    organisationSlug: slug,
    fieldValueId: await idOf("mileageKm"),
  });

  const document = await read();
  expect(document.fieldValues.find((f) => f.key === "mileageKm")).toMatchObject({
    value: 9899,
    needsReview: false,
    review: { state: "checked", by: "ann@example.com" },
  });
  expect(document.userTouched).toBe(false);
});

test("undoing a correction brings back the extracted value and Needs Review", async () => {
  const { user, slug, read, idOf } = await reviewing();
  const mileageKm = await idOf("mileageKm");
  await user.mutation(api.review.correct, { organisationSlug: slug, fieldValueId: mileageKm, value: 9800 });
  await user.mutation(api.review.correct, { organisationSlug: slug, fieldValueId: mileageKm, value: 9900 });

  await user.mutation(api.review.undo, { organisationSlug: slug, fieldValueId: mileageKm });

  const document = await read();
  expect(document.fieldValues.find((f) => f.key === "mileageKm")).toMatchObject({
    value: 9899,
    needsReview: true,
    review: null,
  });
});

test("undoing a check brings back Needs Review", async () => {
  const { user, slug, read, idOf } = await reviewing();
  const mileageKm = await idOf("mileageKm");
  await user.mutation(api.review.check, { organisationSlug: slug, fieldValueId: mileageKm });

  await user.mutation(api.review.undo, { organisationSlug: slug, fieldValueId: mileageKm });

  expect((await read()).needsReviewCount).toBe(2);
});

test("Approval is refused while anything is Needs Review", async () => {
  const { user, slug, documentId, read, idOf } = await reviewing();
  await user.mutation(api.review.check, {
    organisationSlug: slug,
    fieldValueId: await idOf("mileageKm"),
  });

  await expect(
    user.mutation(api.review.approve, { organisationSlug: slug, documentId }),
  ).rejects.toThrow("1 value still needs review");
  expect((await read()).state).toBe("needs_review");
});

test("Approval with no Integration attached marks the Document approved, manually, by whom and when", async () => {
  const { user, slug, documentId, read, idOf } = await reviewing();
  await user.mutation(api.review.check, { organisationSlug: slug, fieldValueId: await idOf("mileageKm") });
  await user.mutation(api.review.correct, {
    organisationSlug: slug,
    fieldValueId: await idOf("orderNumber"),
    value: "WO-0142",
  });
  vi.setSystemTime(new Date("2026-09-24T11:00:00Z"));

  await user.mutation(api.review.approve, { organisationSlug: slug, documentId });

  const document = await read();
  expect(document.state).toBe("approved");
  expect(document.approval).toEqual({
    mode: "manual",
    by: "ann@example.com",
    at: Date.parse("2026-09-24T11:00:00Z"),
  });
  expect(document.history.map((h) => h.event)).toEqual(["uploaded", "extracted", "corrected", "approved"]);
  const { counts } = await user.query(api.documents.list, { organisationSlug: slug, state: "approved" });
  expect(counts).toMatchObject({ needs_review: 0, approved: 1 });
});

test("an approved Document can't be corrected, checked or approved again", async () => {
  const clean: Recording = {
    ...workOrder,
    matches: { ...workOrder.matches, mileageKm: { path: "vehicle.mileage", probability: 0.95 } },
    reading: { ...workOrder.reading, order: { number: "WO-1", _pages: [1] } },
  };
  clean.matches.orderNumber = { path: "order.number", probability: 0.95 };
  clean.fills = { ...workOrder.fills, orderNumber: "WO-1" };
  const { user, slug, documentId, idOf } = await reviewing(clean);
  await user.mutation(api.review.approve, { organisationSlug: slug, documentId });

  await expect(
    user.mutation(api.review.correct, {
      organisationSlug: slug,
      fieldValueId: await idOf("mileageKm"),
      value: 1,
    }),
  ).rejects.toThrow("This Document is approved");
  await expect(
    user.mutation(api.review.approve, { organisationSlug: slug, documentId }),
  ).rejects.toThrow("This Document is approved");
});

test("\"Approve and next\" gets the next Document that needs review", async () => {
  const { t, user, slug, formId, documentId: first, idOf } = await reviewing();
  const second = (await uploadAndExtract(t, user, slug, formId))!;
  await user.mutation(api.review.check, { organisationSlug: slug, fieldValueId: await idOf("mileageKm") });
  await user.mutation(api.review.correct, {
    organisationSlug: slug,
    fieldValueId: await idOf("orderNumber"),
    value: "WO-0142",
  });

  const { nextDocumentId } = await user.mutation(api.review.approve, {
    organisationSlug: slug,
    documentId: first,
  });

  expect(nextDocumentId).toBe(second);
});

test("the last Document in the queue has no next one", async () => {
  const { user, slug, documentId, idOf } = await reviewing();
  await user.mutation(api.review.check, { organisationSlug: slug, fieldValueId: await idOf("mileageKm") });
  await user.mutation(api.review.correct, {
    organisationSlug: slug,
    fieldValueId: await idOf("orderNumber"),
    value: "WO-0142",
  });

  const { nextDocumentId } = await user.mutation(api.review.approve, { organisationSlug: slug, documentId });

  expect(nextDocumentId).toBeNull();
});

test("a Member can review and approve", async () => {
  const { t, slug, documentId, idOf } = await reviewing();
  const bob = await addMembership(t, "bob", slug, "member");

  await bob.mutation(api.review.check, { organisationSlug: slug, fieldValueId: await idOf("mileageKm") });

  expect(
    (await bob.query(api.documents.get, { organisationSlug: slug, documentId })).fieldValues.find(
      (f) => f.key === "mileageKm",
    )!.review,
  ).toMatchObject({ state: "checked", by: "bob@example.com" });
});

test("nobody can review another Organisation's Field Values", async () => {
  const { t, idOf, documentId } = await reviewing();
  const eve = await signUp(t, "eve", "Evil Corp");
  const fieldValueId: Id<"fieldValues"> = await idOf("mileageKm");

  await expect(
    eve.user.mutation(api.review.check, { organisationSlug: eve.slug, fieldValueId }),
  ).rejects.toThrow("Not found");
  await expect(
    eve.user.mutation(api.review.approve, { organisationSlug: eve.slug, documentId }),
  ).rejects.toThrow("Document not found");
});
