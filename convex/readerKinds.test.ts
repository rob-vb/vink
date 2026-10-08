// Read by kind (ADR 0010, step 4): the Extraction and the Form Proposal pick
// the Reader's input from the stored Document's kind. Reader, Matcher, Filler,
// Verifier (Jev) and Proposer are the fakes of test.setup.ts; lib/readers.test.ts
// runs the real Reader against a fake Vertex.
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { createDocument } from "./documents";
import { startProposal } from "./formProposals";
import type { StoredEmail } from "./lib/readerInput";
import {
  fakePdfStore,
  fakePipeline,
  newBackend,
  pdfWithPages,
  signUp,
  type Recording,
} from "./test.setup";

vi.mock("./lib/pdfStore", async () => ({
  pdfStore: (await import("./test.setup")).fakePdfStore,
}));
vi.mock("./lib/reader", async () => ({
  reader: (await import("./test.setup")).fakeReader,
}));
vi.mock("./lib/proposer", async () => ({
  proposer: (await import("./test.setup")).fakeProposer,
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
  fakePdfStore.types.clear();
  fakePipeline.reset();
});

afterEach(() => {
  vi.useRealTimers();
});

const settle = (t: Backend) => t.finishAllScheduledFunctions(vi.runAllTimers);
const bytes = (text: string) => new TextEncoder().encode(text);

async function withComplaintForm(t: Backend) {
  const ann = await signUp(t, "ann", "Bakkerij De Wit");
  const { formId } = await ann.user.mutation(api.forms.create, {
    organisationSlug: ann.slug,
    name: "Klacht",
    fields: [
      { type: "text", label: "Onderwerp", key: "subject", required: true },
      { type: "text", label: "Werkbonnummer", key: "work_order_number", required: false },
    ],
  });
  const organisationId = (await t.run(async (ctx) => (await ctx.db.get(formId))!.organisationId));
  return { ...ann, formId, organisationId };
}

/** A Document of a kind, as the intake of that kind will leave it: its file stored, Extraction started. */
async function documentOf(
  t: Backend,
  { formId, organisationId }: { formId: Id<"forms">; organisationId: Id<"organisations"> },
  stored: { key: string; kind: "pdf" | "email" | "image"; mimeType: string; pageCount: number },
) {
  return await t.run(async (ctx) =>
    createDocument(ctx, {
      organisationId,
      formId,
      filename: "input",
      uploadedBy: "ann",
      uploaderEmail: "ann@example.com",
      ...stored,
    }),
  );
}

const complaintRecording: Recording = {
  reading: {
    complaint: { subject: "Klacht over levering 4410", _pages: [1] },
    photo: { workOrderNumber: "WB-2217", _pages: [2] },
  },
  matches: {
    subject: { path: "complaint.subject", probability: 0.99 },
    work_order_number: { path: "photo.workOrderNumber", probability: 0.9 },
  },
  fills: { subject: "Klacht over levering 4410", work_order_number: "WB-2217" },
};

const verifyCall = () => fakePipeline.calls.find((c) => c.step === "verify");

test("a PDF Document is read as a PDF with its stored page count, as before", async () => {
  const t = newBackend();
  const org = await withComplaintForm(t);
  const pdf = await pdfWithPages(2);
  fakePdfStore.objects.set("org/a.pdf", pdf);
  fakePipeline.replay({ ...complaintRecording, textLayer: [{ page: 1, text: "Klacht over levering 4410" }] });

  const documentId = await documentOf(t, org, {
    key: "org/a.pdf",
    kind: "pdf",
    mimeType: "application/pdf",
    pageCount: 2,
  });
  await settle(t);

  expect(fakePipeline.reads).toEqual([{ kind: "pdf", bytes: pdf, pageCount: 2 }]);
  expect(verifyCall()).toMatchObject({ supportAskedFor: ["subject"] });
  expect((await org.user.query(api.documents.get, { organisationSlug: org.slug, documentId })).state).toBe(
    "needs_review",
  );
});

test("an image Document is read as an image with its MIME type, and Verify asks for no support", async () => {
  const t = newBackend();
  const org = await withComplaintForm(t);
  const photo = bytes("jpeg bytes");
  fakePdfStore.objects.set("org/foto.jpg", photo);
  // An image has no text layer.
  fakePipeline.replay(complaintRecording);

  const documentId = await documentOf(t, org, {
    key: "org/foto.jpg",
    kind: "image",
    mimeType: "image/jpeg",
    pageCount: 1,
  });
  await settle(t);

  expect(fakePipeline.reads).toEqual([{ kind: "image", bytes: photo, mimeType: "image/jpeg" }]);
  expect(verifyCall()).toMatchObject({ fields: ["subject", "work_order_number"], supportAskedFor: [] });
  const document = await org.user.query(api.documents.get, { organisationSlug: org.slug, documentId });
  expect(document.state).toBe("needs_review");
  expect(document.fieldValues).toMatchObject([
    { key: "subject", value: "Klacht over levering 4410", signals: { fit: 1, support: null } },
    { key: "work_order_number", value: "WB-2217", signals: { fit: 1, support: null } },
  ]);
});

test("an email Document is read with its headers, body and attachments, and Verify uses the body as one page", async () => {
  const t = newBackend();
  const org = await withComplaintForm(t);
  const photo = bytes("jpeg bytes");
  const email: StoredEmail = {
    subject: "Klacht over levering 4410",
    from: "anouk@bakkerij-dewit.example",
    date: "Tue, 6 Oct 2026 09:12:00 +0200",
    body: "De levering van gisteren was onvolledig.",
    attachments: [{ filename: "werkbon.jpg", mimeType: "image/jpeg", key: "org/mail-1/werkbon.jpg" }],
  };
  fakePdfStore.objects.set("org/mail-1.json", bytes(JSON.stringify(email)));
  fakePdfStore.objects.set("org/mail-1/werkbon.jpg", photo);
  fakePipeline.replay({
    ...complaintRecording,
    textLayer: [{ page: 1, text: "Subject: Klacht over levering 4410\n\nDe levering van gisteren was onvolledig." }],
  });

  const documentId = await documentOf(t, org, {
    key: "org/mail-1.json",
    kind: "email",
    mimeType: "application/json",
    pageCount: 1,
  });
  await settle(t);

  expect(fakePipeline.reads).toEqual([
    {
      kind: "email",
      subject: "Klacht over levering 4410",
      from: "anouk@bakkerij-dewit.example",
      date: "Tue, 6 Oct 2026 09:12:00 +0200",
      body: "De levering van gisteren was onvolledig.",
      attachments: [{ filename: "werkbon.jpg", mimeType: "image/jpeg", bytes: photo }],
    },
  ]);
  // The subject comes from the body page; the number read off the photo has no text to check.
  expect(verifyCall()).toMatchObject({ supportAskedFor: ["subject"] });
  const document = await org.user.query(api.documents.get, { organisationSlug: org.slug, documentId });
  expect(document.fieldValues).toMatchObject([
    { key: "subject", pages: [1], signals: { support: 1 } },
    { key: "work_order_number", pages: [2], signals: { support: null } },
  ]);
});

test("an input whose file is missing is a failed Read: Extraction Failed, with no Reading stored", async () => {
  const t = newBackend();
  const org = await withComplaintForm(t);
  fakePipeline.replay(complaintRecording);

  const documentId = await documentOf(t, org, {
    key: "org/gone.json",
    kind: "email",
    mimeType: "application/json",
    pageCount: 1,
  });
  await settle(t);

  const document = await org.user.query(api.documents.get, { organisationSlug: org.slug, documentId });
  expect(document.state).toBe("extraction_failed");
  expect(fakePipeline.reads).toEqual([]);
  expect(
    await t.run(async (ctx) => (await ctx.db.get(documentId))!.extractionError),
  ).toContain("No file stored under org/gone.json");
});

test("a Form Proposal sample of any kind goes to the Reader and the Proposer as that kind", async () => {
  const t = newBackend();
  const org = await withComplaintForm(t);
  const photo = bytes("png bytes");
  fakePdfStore.objects.set("org/sample.png", photo);
  fakePipeline.replay({ ...complaintRecording, proposal: [] });
  const proposalId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("formProposals", {
      organisationId: org.organisationId,
      createdBy: "ann",
      createdByEmail: "ann@example.com",
      key: "org/sample.png",
      kind: "image",
      mimeType: "image/png",
      filename: "voorbeeld.png",
      pageCount: 1,
      state: "reading",
    });
    await startProposal(ctx, id);
    return id;
  });
  await settle(t);

  const sample = { kind: "image", bytes: photo, mimeType: "image/png" };
  expect(fakePipeline.reads).toEqual([sample]);
  expect(fakePipeline.proposed).toEqual([sample]);
  expect(
    await org.user.query(api.formProposals.get, { organisationSlug: org.slug, proposalId }),
  ).toMatchObject({ state: "ready" });
});
