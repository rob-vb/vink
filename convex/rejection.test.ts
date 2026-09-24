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
  reading: { vehicle: { licensePlate: "NWA-30-E", mileage: "9899", _pages: [1] } },
  matches: {
    licensePlate: { path: "vehicle.licensePlate", probability: 0.97 },
    mileageKm: { path: "vehicle.mileage", probability: 0.55 },
  },
  fills: { licensePlate: "NWA30E", mileageKm: 9899 },
};

async function uploaded(t: Backend) {
  const ann = await signUp(t, "ann", "Acme Fleet");
  const organisationSlug = ann.slug;
  const { formId } = await ann.user.mutation(api.forms.create, {
    organisationSlug,
    name: "Work order",
    fields: [
      { type: "text", label: "Kenteken", key: "licensePlate", required: true },
      { type: "number", label: "Kilometerstand", key: "mileageKm", required: false },
    ],
  });
  fakePipeline.replay(workOrder);
  const { key, url } = await ann.user.mutation(api.documents.generateUploadUrl, {
    organisationSlug,
  });
  putToUploadUrl(url, await pdfWithPages(1));
  await ann.user.action(api.documents.create, {
    organisationSlug,
    formId,
    key,
    filename: "werkorder.pdf",
  });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const documentId = await t.run(async (ctx) => (await ctx.db.query("documents").first())!._id);
  const bob = await addMembership(t, "bob", organisationSlug, "member");
  const on = { organisationSlug, documentId };
  const read = () => ann.user.query(api.documents.get, on);
  return { ...ann, bob, key, documentId, on, read };
}

test("a Member rejects a Document with a reason; it is listed under Rejected with who, when and why", async () => {
  const t = newBackend();
  const { bob, on, read } = await uploaded(t);
  vi.setSystemTime(new Date("2026-09-24T12:00:00Z"));

  await bob.mutation(api.rejection.reject, { ...on, reason: "Blank scan" });

  const document = await read();
  expect(document.state).toBe("rejected");
  expect(document.rejection).toEqual({
    by: "bob@example.com",
    at: Date.parse("2026-09-24T12:00:00Z"),
    reason: "Blank scan",
  });
  expect(document.history.at(-1)).toMatchObject({ event: "rejected", detail: "Blank scan" });
  const { documents, counts } = await bob.query(api.documents.list, {
    organisationSlug: on.organisationSlug,
    state: "rejected",
  });
  expect(documents).toEqual([
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

test("a Document whose Extraction failed can be rejected, and reopens as failed", async () => {
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
  const mileageKm = (await read()).fieldValues.find((f) => f.key === "mileageKm")!;
  await user.mutation(api.review.check, { organisationSlug: on.organisationSlug, fieldValueId: mileageKm.id });
  await user.mutation(api.rejection.reject, on);

  await user.mutation(api.rejection.reopen, on);

  const document = await read();
  expect(document.state).toBe("needs_review");
  expect(document.rejection).toBeNull();
  expect(document.userTouched).toBe(true);
  expect(document.fieldValues.find((f) => f.key === "mileageKm")!.review).toMatchObject({ state: "checked" });
  expect(document.history.map((h) => h.event).slice(-2)).toEqual(["rejected", "reopened"]);
});

test("an approved Document can't be rejected", async () => {
  const t = newBackend();
  const { user, on, read } = await uploaded(t);
  const mileageKm = (await read()).fieldValues.find((f) => f.key === "mileageKm")!;
  await user.mutation(api.review.check, { organisationSlug: on.organisationSlug, fieldValueId: mileageKm.id });
  await user.mutation(api.review.approve, on);

  await expect(user.mutation(api.rejection.reject, on)).rejects.toThrow("This Document is approved");
  await expect(user.mutation(api.rejection.remove, on)).rejects.toThrow("This Document is approved");
});

test("only a Rejected Document can be reopened or deleted", async () => {
  const t = newBackend();
  const { user, on } = await uploaded(t);

  await expect(user.mutation(api.rejection.reopen, on)).rejects.toThrow("Only a Rejected Document");
  await expect(user.mutation(api.rejection.remove, on)).rejects.toThrow("Only a Rejected Document");
});

test("a Member can't delete a Document", async () => {
  const t = newBackend();
  const { bob, on } = await uploaded(t);
  await bob.mutation(api.rejection.reject, on);

  await expect(bob.mutation(api.rejection.remove, on)).rejects.toThrow("Forbidden");
});

test("an Admin deletes a Rejected Document: the PDF and its data go, the metadata and a Deleted line stay", async () => {
  const t = newBackend();
  const { user, key, on, read } = await uploaded(t);
  await user.mutation(api.rejection.reject, { ...on, reason: "Private data" });

  await user.mutation(api.rejection.remove, on);

  expect(fakePdfStore.objects.has(key)).toBe(false);
  const document = await read();
  expect(document).toMatchObject({
    state: "deleted",
    filename: "werkorder.pdf",
    fieldValues: [],
    lists: [],
  });
  expect(document.history.at(-1)).toMatchObject({ event: "deleted", by: "ann@example.com" });
  const leftovers = await t.run(async (ctx) => ({
    readings: await ctx.db.query("readings").collect(),
    fieldValues: await ctx.db.query("fieldValues").collect(),
  }));
  expect(leftovers).toEqual({ readings: [], fieldValues: [] });
  await expect(user.mutation(api.rejection.reopen, on)).rejects.toThrow("Only a Rejected Document");
  await expect(user.mutation(api.documents.pdfUrl, on)).rejects.toThrow("The PDF was deleted");
});

test("a deleted Document stays listed under Rejected", async () => {
  const t = newBackend();
  const { user, on } = await uploaded(t);
  await user.mutation(api.rejection.reject, on);
  await user.mutation(api.rejection.remove, on);

  const { documents, counts } = await user.query(api.documents.list, {
    organisationSlug: on.organisationSlug,
    state: "rejected",
  });

  expect(documents).toEqual([expect.objectContaining({ state: "deleted" })]);
  expect(counts).toMatchObject({ rejected: 0 });
});

test("nobody can reject another Organisation's Document", async () => {
  const t = newBackend();
  const { documentId } = await uploaded(t);
  const eve = await signUp(t, "eve", "Evil Corp");

  await expect(
    eve.user.mutation(api.rejection.reject, { organisationSlug: eve.slug, documentId }),
  ).rejects.toThrow("Document not found");
});
