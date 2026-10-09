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
    attachments: [{ filename: "werkbon.jpg", mimeType: "image/jpeg", key: `${org.organisationId}/mail-1/1` }],
  };
  fakePdfStore.objects.set(`${org.organisationId}/mail-1`, bytes(JSON.stringify(email)));
  fakePdfStore.objects.set(`${org.organisationId}/mail-1/1`, photo);
  fakePipeline.replay({
    ...complaintRecording,
    textLayer: [{ page: 1, text: "Subject: Klacht over levering 4410\n\nDe levering van gisteren was onvolledig." }],
  });

  const documentId = await documentOf(t, org, {
    key: `${org.organisationId}/mail-1`,
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
    key: `${org.organisationId}/gone`,
    kind: "email",
    mimeType: "application/json",
    pageCount: 1,
  });
  await settle(t);

  const document = await org.user.query(api.documents.get, { organisationSlug: org.slug, documentId });
  expect(document.state).toBe("extraction_failed");
  expect(fakePipeline.reads).toEqual([]);
  // The screen gets a code, never the technical error (that goes to the logs).
  expect(document.failure).toBe("unreadable");
  expect(await t.run(async (ctx) => (await ctx.db.get(documentId))!.extractionError)).toBe("unreadable");
});

/** An email Document whose stored file is `file`, with the extra files in `files`; Extraction settled. */
async function emailDocumentWith(
  t: Backend,
  org: Awaited<ReturnType<typeof withComplaintForm>>,
  file: unknown,
  files: Record<string, Uint8Array> = {},
  { key = `${org.organisationId}/mail-x` }: { key?: string } = {},
) {
  fakePdfStore.objects.set(key, typeof file === "string" ? bytes(file) : bytes(JSON.stringify(file)));
  for (const [k, v] of Object.entries(files)) fakePdfStore.objects.set(k, v);
  fakePipeline.replay(complaintRecording);
  const read = vi.spyOn(fakePdfStore, "read");
  // The technical reason goes to the logs only; the Document keeps a code.
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  const documentId = await documentOf(t, org, { key, kind: "email", mimeType: "application/json", pageCount: 1 });
  await settle(t);
  const document = await org.user.query(api.documents.get, { organisationSlug: org.slug, documentId });
  const code = await t.run(async (ctx) => (await ctx.db.get(documentId))!.extractionError);
  const error = logged.mock.calls.map((c) => c.join(" ")).join("\n");
  logged.mockRestore();
  if (document.state === "extraction_failed") {
    expect(code).toBe("unreadable");
    expect(document.failure).toBe("unreadable");
    expect(JSON.stringify(document)).not.toContain(error);
  }
  const calls = read.mock.calls.map(([called]) => called);
  read.mockRestore();
  const readsOf = (k: string) => calls.filter((called) => called === k).length;
  return { document, error, readsOf, key };
}

const validEmail = (attachments: unknown[] = []) => ({
  subject: "Klacht",
  from: "anouk@bakkerij-dewit.example",
  date: "",
  body: "De levering was onvolledig.",
  attachments,
});

test("a stored email whose attachment points at another Organisation's file is refused and never read", async () => {
  const t = newBackend();
  const org = await withComplaintForm(t);
  const forged = validEmail([{ filename: "x.jpg", mimeType: "image/jpeg", key: "otherorganisation/secret.jpg" }]);

  const { document, error, readsOf } = await emailDocumentWith(t, org, forged, {
    "otherorganisation/secret.jpg": bytes("another Organisation's photo"),
  });

  expect(document.state).toBe("extraction_failed");
  expect(error).toContain("not its own");
  expect(readsOf("otherorganisation/secret.jpg")).toBe(0);
  expect(fakePipeline.reads).toEqual([]);
});

test("a stored email under another Organisation's prefix is refused", async () => {
  const t = newBackend();
  const org = await withComplaintForm(t);

  const { document, error } = await emailDocumentWith(t, org, validEmail(), {}, { key: "otherorganisation/mail-x" });

  expect(document.state).toBe("extraction_failed");
  expect(error).toContain("not this Organisation's");
});

test.each([
  ["is not JSON", "{ nope", "not valid JSON"],
  ["has no body", { subject: "a", from: "b", date: "", attachments: [] }, "expected shape"],
  ["has an attachment without a key", validEmail([{ filename: "x.pdf", mimeType: "application/pdf" }]), "without a name, type or key"],
  [
    "has an attachment of an unsupported type",
    validEmail([{ filename: "x.exe", mimeType: "application/x-msdownload", key: "ORG/mail-x/1" }]),
    "unsupported type",
  ],
  [
    "has more than 10 attachments",
    validEmail(Array.from({ length: 11 }, (_, i) => ({ filename: `${i}.pdf`, mimeType: "application/pdf", key: `ORG/mail-x/${i}` }))),
    "more than 10 attachments",
  ],
])("a stored email that %s fails at once, with no retries", async (_name, file, expected) => {
  const t = newBackend();
  const org = await withComplaintForm(t);
  const text = JSON.stringify(file).replaceAll("ORG", org.organisationId);

  const { document, error, readsOf, key } = await emailDocumentWith(t, org, typeof file === "string" ? file : text);

  expect(document.state).toBe("extraction_failed");
  expect(error).toContain(expected);
  expect(readsOf(key)).toBe(1);
  expect(fakePipeline.reads).toEqual([]);
});

test("attachments over 12 MB together fail at once; a missing attachment file too, each read once", async () => {
  const t = newBackend();
  const org = await withComplaintForm(t);
  const prefix = `${org.organisationId}/mail-x`;
  const big = new Uint8Array(7 * 1024 * 1024);
  const email = validEmail([
    { filename: "a.pdf", mimeType: "application/pdf", key: `${prefix}/1` },
    { filename: "b.pdf", mimeType: "application/pdf", key: `${prefix}/2` },
  ]);

  const over = await emailDocumentWith(t, org, email, { [`${prefix}/1`]: big, [`${prefix}/2`]: big });
  expect(over.document.state).toBe("extraction_failed");
  expect(over.error).toContain("larger than 12 MB together");
  expect(over.readsOf(`${prefix}/2`)).toBe(1);

  fakePdfStore.objects.clear();
  fakePipeline.reset();
  const missing = await emailDocumentWith(t, org, email, { [`${prefix}/1`]: bytes("pdf") }, { key: `${prefix}-2` });
  expect(missing.document.state).toBe("extraction_failed");
});

test("an image Document with an unsupported type fails at once", async () => {
  const t = newBackend();
  const org = await withComplaintForm(t);
  fakePdfStore.objects.set("org/x.bmp", bytes("bmp"));
  fakePipeline.replay(complaintRecording);

  const documentId = await documentOf(t, org, { key: "org/x.bmp", kind: "image", mimeType: "image/bmp", pageCount: 1 });
  await settle(t);

  const document = await org.user.query(api.documents.get, { organisationSlug: org.slug, documentId });
  expect(document.state).toBe("extraction_failed");
  expect(await t.run(async (ctx) => (await ctx.db.get(documentId))!.extractionError)).toBe("unreadable");
});

test("the stored JSON cannot change the kind the Reader gets", async () => {
  const t = newBackend();
  const org = await withComplaintForm(t);

  await emailDocumentWith(t, org, { ...validEmail(), kind: "pdf", bytes: "x", pageCount: 99 });

  expect(fakePipeline.reads).toHaveLength(1);
  expect(fakePipeline.reads[0]).toMatchObject({ kind: "email", attachments: [] });
  expect(fakePipeline.reads[0]).not.toHaveProperty("pageCount");
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
