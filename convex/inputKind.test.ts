// The input model (ADR 0010, step 3): Submissions and Form Proposals from before
// kinds have no `kind` and no `mimeType`. They read as a PDF until
// `submissions:backfillInputKind` has run, which then fills them in.
// TODO(narrow): delete the "from before kinds" tests with the fallbacks.
import { beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { fakePdfStore, newBackend, pdfWithPages, putToUploadUrl, signUp } from "./test.setup";

vi.mock("./lib/pdfStore", async () => ({
  pdfStore: (await import("./test.setup")).fakePdfStore,
}));
vi.mock("./extraction", async (importOriginal) => {
  // Starting an Extraction is not under test here: it would call the models.
  const original = await importOriginal<typeof import("./extraction")>();
  return { ...original, startExtraction: vi.fn(async () => {}) };
});

type Backend = ReturnType<typeof newBackend>;

beforeEach(() => {
  fakePdfStore.objects.clear();
  fakePdfStore.types.clear();
});

/** An Organisation with an Invoice Form, an old Submission and an old sample, as prod has them. */
async function seedOld(t: Backend) {
  const ann = await signUp(t, "ann", "Kantoor Noord");
  const { formId } = await ann.user.mutation(api.forms.create, {
    organisationSlug: ann.slug,
    name: "Invoice",
    fields: [{ type: "text", label: "Invoice number", key: "invoice_number", required: true }],
  });
  return await t.run(async (ctx) => {
    const form = (await ctx.db.get(formId))!;
    const base = {
      organisationId: form.organisationId,
      formId,
      formVersion: 1,
      pageCount: 2,
      uploadedBy: "ann",
      uploaderEmail: "ann@example.com",
      state: "needs_review" as const,
    };
    // No `kind`, no `mimeType`: written before step 3.
    const old = await ctx.db.insert("submissions", { ...base, key: "org/old", filename: "F-1.pdf" });
    const oldToo = await ctx.db.insert("submissions", { ...base, key: "org/old-too", filename: "F-2.pdf" });
    // Already written by the new code.
    const current = await ctx.db.insert("submissions", {
      ...base,
      key: "org/new",
      filename: "foto.png",
      kind: "image",
      mimeType: "image/png",
    });
    const sample = await ctx.db.insert("formProposals", {
      organisationId: form.organisationId,
      createdBy: "ann",
      createdByEmail: "ann@example.com",
      key: "org/sample",
      filename: "voorbeeld.pdf",
      pageCount: 1,
      state: "ready",
    });
    return { old, oldToo, current, sample };
  });
}

test("a Submission from before kinds reads as a PDF, with the file key and its MIME type", async () => {
  const t = newBackend();
  const { old } = await seedOld(t);

  const input = await t.query(internal.extraction.input, { submissionId: old });

  expect(input).toMatchObject({ fileKey: "org/old", kind: "pdf", mimeType: "application/pdf" });
  expect(input).not.toHaveProperty("pdfKey");
});

test("a Submission with a kind keeps it when read", async () => {
  const t = newBackend();
  const { current } = await seedOld(t);

  expect(await t.query(internal.extraction.input, { submissionId: current })).toMatchObject({
    fileKey: "org/new",
    kind: "image",
    mimeType: "image/png",
  });
});

test("the backfill gives old Submissions and samples kind pdf and application/pdf, and changes nothing else", async () => {
  const t = newBackend();
  const { old, oldToo, current, sample } = await seedOld(t);
  const snapshot = async (id: Id<"submissions">) => await t.run(async (ctx) => await ctx.db.get(id));
  const before = await snapshot(old);

  const first = await t.action(internal.submissions.backfillInputKind, {});

  expect(first).toEqual({ submissions: 2, formProposals: 1 });
  const after = await snapshot(old);
  expect(after).toEqual({ ...before, kind: "pdf", mimeType: "application/pdf" });
  expect(await snapshot(oldToo)).toMatchObject({ kind: "pdf", mimeType: "application/pdf" });
  // A Submission written by the new code is left alone.
  expect(await snapshot(current)).toMatchObject({ kind: "image", mimeType: "image/png" });
  expect(await t.run(async (ctx) => await ctx.db.get(sample))).toMatchObject({
    kind: "pdf",
    mimeType: "application/pdf",
  });
  // Reads give the same answer as before the backfill.
  expect(await t.query(internal.extraction.input, { submissionId: old })).toMatchObject({
    fileKey: "org/old",
    kind: "pdf",
    mimeType: "application/pdf",
  });
});

test("the backfill is idempotent: a second run fills nothing", async () => {
  const t = newBackend();
  await seedOld(t);

  await t.action(internal.submissions.backfillInputKind, {});
  const second = await t.action(internal.submissions.backfillInputKind, {});

  expect(second).toEqual({ submissions: 0, formProposals: 0 });
});

test("a Submission uploaded now is stored with kind pdf and application/pdf", async () => {
  const t = newBackend();
  const ann = await signUp(t, "ann", "Kantoor Noord");
  const { formId } = await ann.user.mutation(api.forms.create, {
    organisationSlug: ann.slug,
    name: "Invoice",
    fields: [{ type: "text", label: "Invoice number", key: "invoice_number", required: true }],
  });
  const { key, url } = await ann.user.mutation(api.submissions.generateUploadUrl, { organisationSlug: ann.slug });
  putToUploadUrl(url, new Uint8Array(await pdfWithPages(2)));

  await ann.user.action(api.submissions.create, { organisationSlug: ann.slug, formId, key, filename: "F-3.pdf" });

  const stored = await t.run(async (ctx) => await ctx.db.query("submissions").collect());
  expect(stored).toMatchObject([{ key, kind: "pdf", mimeType: "application/pdf", pageCount: 2 }]);
});

function withoutSystemFields<T extends { _id: unknown; _creationTime: number }>(row: T) {
  const { _id, _creationTime, ...fields } = row;
  void _id;
  void _creationTime;
  return fields;
}

/** Copies of the old Submission and old sample, so every table holds more than one page of rows to fill. */
async function addMoreOld(t: Backend, ids: Awaited<ReturnType<typeof seedOld>>) {
  await t.run(async (ctx) => {
    const submission = withoutSystemFields((await ctx.db.get(ids.old))!);
    for (let i = 0; i < 4; i++) await ctx.db.insert("submissions", { ...submission, key: `org/more-${i}` });
    const sample = withoutSystemFields((await ctx.db.get(ids.sample))!);
    for (let i = 0; i < 3; i++) await ctx.db.insert("formProposals", { ...sample, key: `org/sample-${i}` });
    // One more that the new code wrote: the walk must pass it by.
    await ctx.db.insert("formProposals", { ...sample, key: "org/sample-new", kind: "image", mimeType: "image/png" });
  });
}

async function everyRow(t: Backend) {
  return await t.run(async (ctx) => ({
    submissions: await ctx.db.query("submissions").collect(),
    formProposals: await ctx.db.query("formProposals").collect(),
  }));
}

test("the backfill walks tables of several pages: every row is filled, nothing else changes, a second full run changes nothing", async () => {
  const t = newBackend();
  const ids = await seedOld(t);
  await addMoreOld(t, ids);
  const before = await everyRow(t);
  // 2 + 4 old Submissions plus 1 new; 1 + 3 old samples plus 1 new.
  expect(before.submissions).toHaveLength(7);
  expect(before.formProposals).toHaveLength(5);

  // The first table really takes several pages.
  const firstPage = await t.mutation(internal.submissions.backfillInputKindPage, {
    table: "submissions",
    cursor: null,
    numItems: 2,
  });
  expect(firstPage.isDone).toBe(false);
  expect(firstPage.filled).toBeLessThanOrEqual(2);

  const first = await t.action(internal.submissions.backfillInputKind, { numItems: 2 });

  // The page above already filled up to two of the six old Submissions.
  expect(first.submissions + firstPage.filled).toBe(6);
  expect(first.formProposals).toBe(4);
  const after = await everyRow(t);
  for (const submission of after.submissions) {
    const old = before.submissions.find((d) => d._id === submission._id)!;
    expect(submission).toEqual({ ...old, kind: old.kind ?? "pdf", mimeType: old.mimeType ?? "application/pdf" });
  }
  for (const proposal of after.formProposals) {
    const old = before.formProposals.find((p) => p._id === proposal._id)!;
    expect(proposal).toEqual({ ...old, kind: old.kind ?? "pdf", mimeType: old.mimeType ?? "application/pdf" });
  }
  expect(after.submissions.filter((d) => d.kind === "image")).toHaveLength(1);
  expect(after.formProposals.filter((p) => p.kind === "image")).toHaveLength(1);

  // A full second run, with a page size of 2 and with the default, changes nothing.
  expect(await t.action(internal.submissions.backfillInputKind, { numItems: 2 })).toEqual({
    submissions: 0,
    formProposals: 0,
  });
  expect(await t.action(internal.submissions.backfillInputKind, {})).toEqual({ submissions: 0, formProposals: 0 });
  expect(await everyRow(t)).toEqual(after);
});
