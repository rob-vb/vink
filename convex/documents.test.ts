import { PDFDocument } from "pdf-lib";
import { beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  addMembership,
  fakePdfStore,
  newBackend,
  putToUploadUrl,
  signUp,
} from "./test.setup";

vi.mock("./lib/pdfStore", async () => ({
  pdfStore: (await import("./test.setup")).fakePdfStore,
}));

type Backend = ReturnType<typeof newBackend>;
type User = ReturnType<Backend["withIdentity"]>;

beforeEach(() => {
  fakePdfStore.objects.clear();
});

async function pdfWithPages(pages: number) {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pages; i++) pdf.addPage();
  return await pdf.save();
}

/** What the upload screen does: get an upload URL, PUT the PDF there, create the Document. */
async function upload(
  user: User,
  organisationSlug: string,
  formId: Id<"forms">,
  filename: string,
  bytes: Uint8Array,
) {
  const { key, url } = await user.mutation(api.documents.generateUploadUrl, {
    organisationSlug,
  });
  putToUploadUrl(url, bytes);
  return await user.action(api.documents.create, {
    organisationSlug,
    formId,
    key,
    filename,
  });
}

/** Acme Fleet with a Tyre service Form at version 2, and Cas as a Member. */
async function acmeWithForm(t: Backend) {
  const ann = await signUp(t, "ann", "Acme Fleet");
  const { formId } = await ann.user.mutation(api.forms.create, {
    organisationSlug: ann.slug,
    name: "Tyre service",
    fields: [{ type: "text", label: "Kenteken", key: "license_plate", required: true }],
  });
  await ann.user.mutation(api.forms.save, {
    organisationSlug: ann.slug,
    formId,
    name: "Tyre service",
    fields: [{ type: "text", label: "Kenteken", key: "license_plate", required: false }],
  });
  const cas = await addMembership(t, "cas", ann.slug, "member");
  return { ann, cas, slug: ann.slug, formId };
}

test("a Member uploads a PDF against a Form and finds it Extracting on the current Form Version", async () => {
  const t = newBackend();
  const { cas, slug, formId } = await acmeWithForm(t);

  await upload(cas, slug, formId, "werkorder-0142.pdf", await pdfWithPages(3));

  const { documents } = await cas.query(api.documents.list, {
    organisationSlug: slug,
    state: "extracting",
  });
  expect(documents).toEqual([
    expect.objectContaining({
      filename: "werkorder-0142.pdf",
      pageCount: 3,
      state: "extracting",
      formName: "Tyre service",
      formVersion: 2,
      uploadedBy: "cas@example.com",
    }),
  ]);
});

test("a PDF over 20 pages is refused with a clear message, and nothing is stored", async () => {
  const t = newBackend();
  const { cas, slug, formId } = await acmeWithForm(t);

  await expect(
    upload(cas, slug, formId, "bundle.pdf", await pdfWithPages(21)),
  ).rejects.toThrow("This PDF has 21 pages. Vink reads up to 20 pages per Document.");

  expect(fakePdfStore.objects.size).toBe(0);
  expect(
    (await cas.query(api.documents.list, { organisationSlug: slug, state: "extracting" }))
      .documents,
  ).toEqual([]);
});

test("a PDF of exactly 20 pages is accepted", async () => {
  const t = newBackend();
  const { cas, slug, formId } = await acmeWithForm(t);

  await upload(cas, slug, formId, "bundle.pdf", await pdfWithPages(20));

  expect(
    (await cas.query(api.documents.list, { organisationSlug: slug, state: "extracting" }))
      .documents,
  ).toEqual([expect.objectContaining({ pageCount: 20 })]);
});

test("a user can't upload into an Organisation they have no Membership in", async () => {
  const t = newBackend();
  const { slug, formId } = await acmeWithForm(t);
  const bob = await signUp(t, "bob", "Bob's Tyres");

  await expect(
    upload(bob.user, slug, formId, "sneaky.pdf", await pdfWithPages(1)),
  ).rejects.toThrow("Forbidden");
});

test("a PDF uploaded for one Organisation can't become a Document of another", async () => {
  const t = newBackend();
  const { cas, slug } = await acmeWithForm(t);
  const bob = await signUp(t, "bob", "Bob's Tyres");
  const { formId: bobsFormId } = await bob.user.mutation(api.forms.create, {
    organisationSlug: bob.slug,
    name: "Invoice",
    fields: [{ type: "text", label: "Number", key: "number", required: true }],
  });
  await addMembership(t, "cas", bob.slug, "member");
  const { key, url } = await cas.mutation(api.documents.generateUploadUrl, {
    organisationSlug: slug,
  });
  putToUploadUrl(url, await pdfWithPages(1));

  await expect(
    cas.action(api.documents.create, {
      organisationSlug: bob.slug,
      formId: bobsFormId,
      key,
      filename: "acme-order.pdf",
    }),
  ).rejects.toThrow("Forbidden");
});

test("a Document can't be filed under another Organisation's Form", async () => {
  const t = newBackend();
  const { cas, slug } = await acmeWithForm(t);
  const bob = await signUp(t, "bob", "Bob's Tyres");
  const { formId: bobsFormId } = await bob.user.mutation(api.forms.create, {
    organisationSlug: bob.slug,
    name: "Invoice",
    fields: [{ type: "text", label: "Number", key: "number", required: true }],
  });

  await expect(
    upload(cas, slug, bobsFormId, "order.pdf", await pdfWithPages(1)),
  ).rejects.toThrow("Form not found");
  expect(fakePdfStore.objects.size).toBe(0);
});

test("a file that isn't a readable PDF is refused with a clear message, and nothing is stored", async () => {
  const t = newBackend();
  const { cas, slug, formId } = await acmeWithForm(t);

  await expect(
    upload(cas, slug, formId, "photo.pdf", new TextEncoder().encode("not a pdf")),
  ).rejects.toThrow("This file isn't a PDF Vink can read.");
  expect(fakePdfStore.objects.size).toBe(0);
});

test("the Document list counts Documents per state, within the Organisation only", async () => {
  const t = newBackend();
  const { cas, slug, formId } = await acmeWithForm(t);
  const bob = await signUp(t, "bob", "Bob's Tyres");
  await upload(cas, slug, formId, "one.pdf", await pdfWithPages(1));
  await upload(cas, slug, formId, "two.pdf", await pdfWithPages(2));

  const acme = await cas.query(api.documents.list, {
    organisationSlug: slug,
    state: "extracting",
  });
  expect(acme.counts).toEqual({
    extracting: 2,
    needs_review: 0,
    approved: 0,
    extraction_failed: 0,
    rejected: 0,
  });
  expect(acme.documents.map((d) => d.filename)).toEqual(["two.pdf", "one.pdf"]);

  const bobs = await bob.user.query(api.documents.list, {
    organisationSlug: bob.slug,
    state: "extracting",
  });
  expect(bobs).toEqual({
    counts: { extracting: 0, needs_review: 0, approved: 0, extraction_failed: 0, rejected: 0 },
    documents: [],
  });
  await expect(
    bob.user.query(api.documents.list, { organisationSlug: slug, state: "extracting" }),
  ).rejects.toThrow("Forbidden");
});

test("a Member opens the PDF through a signed URL that expires within 5 minutes", async () => {
  const t = newBackend();
  const { ann, cas, slug, formId } = await acmeWithForm(t);
  const pdf = await pdfWithPages(1);
  await upload(cas, slug, formId, "order.pdf", pdf);
  const [document] = (
    await ann.user.query(api.documents.list, { organisationSlug: slug, state: "extracting" })
  ).documents;

  const url = await ann.user.mutation(api.documents.pdfUrl, {
    organisationSlug: slug,
    documentId: document.id,
  });

  const [, key, expires] = url.match(/^https:\/\/r2\.test\/view\/(.+)\?expires=(\d+)$/)!;
  expect(fakePdfStore.objects.get(key)).toEqual(pdf);
  expect(Number(expires)).toBeLessThanOrEqual(300);
});

test("a user without a Membership in the Organisation gets no URL for its PDF", async () => {
  const t = newBackend();
  const { cas, slug, formId } = await acmeWithForm(t);
  const bob = await signUp(t, "bob", "Bob's Tyres");
  await upload(cas, slug, formId, "order.pdf", await pdfWithPages(1));
  const [document] = (
    await cas.query(api.documents.list, { organisationSlug: slug, state: "extracting" })
  ).documents;

  await expect(
    bob.user.mutation(api.documents.pdfUrl, { organisationSlug: slug, documentId: document.id }),
  ).rejects.toThrow("Forbidden");
  await expect(
    bob.user.mutation(api.documents.pdfUrl, {
      organisationSlug: bob.slug,
      documentId: document.id,
    }),
  ).rejects.toThrow("Document not found");
});

test("a Document's history records who uploaded it and when", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  try {
    const t = newBackend();
    const { ann, cas, slug, formId } = await acmeWithForm(t);
    vi.setSystemTime(new Date("2026-09-24T09:30:00Z"));
    await upload(cas, slug, formId, "order.pdf", await pdfWithPages(1));
    const [{ id }] = (
      await ann.user.query(api.documents.list, { organisationSlug: slug, state: "extracting" })
    ).documents;

    const document = await ann.user.query(api.documents.get, {
      organisationSlug: slug,
      documentId: id,
    });

    expect(document).toMatchObject({
      filename: "order.pdf",
      state: "extracting",
      formName: "Tyre service",
      formVersion: 2,
      pageCount: 1,
      history: [
        { event: "uploaded", by: "cas@example.com", at: Date.parse("2026-09-24T09:30:00Z") },
      ],
    });
  } finally {
    vi.useRealTimers();
  }
});

test("a user can't read a Document of an Organisation they have no Membership in", async () => {
  const t = newBackend();
  const { cas, slug, formId } = await acmeWithForm(t);
  const bob = await signUp(t, "bob", "Bob's Tyres");
  await upload(cas, slug, formId, "order.pdf", await pdfWithPages(1));
  const [{ id }] = (
    await cas.query(api.documents.list, { organisationSlug: slug, state: "extracting" })
  ).documents;

  await expect(
    bob.user.query(api.documents.get, { organisationSlug: bob.slug, documentId: id }),
  ).rejects.toThrow("Document not found");
});
