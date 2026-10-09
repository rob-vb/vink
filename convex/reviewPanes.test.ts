// What the review screen's panes need from the backend (ADR 0010, step 8): the
// Document's kind, MIME type and split reason, the stored email with its
// attachments' page counts, and signed URLs for an email's attachments only.
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
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
vi.mock("./lib/reader", async () => ({ reader: (await import("./test.setup")).fakeReader }));
vi.mock("./lib/router", async () => ({ router: (await import("./test.setup")).fakeRouter }));
vi.mock("./lib/splitter", async () => ({ splitter: (await import("./test.setup")).fakeSplitter }));
vi.mock("./lib/matcher", async () => ({ matcher: (await import("./test.setup")).fakeMatcher }));
vi.mock("./lib/filler", async () => ({ filler: (await import("./test.setup")).fakeFiller }));
vi.mock("./lib/verifier", async () => ({ verifier: (await import("./test.setup")).fakeVerifier }));

type Backend = ReturnType<typeof newBackend>;

beforeEach(() => {
  vi.useFakeTimers();
  fakePdfStore.objects.clear();
  fakePdfStore.types.clear();
  fakePipeline.reset();
  vi.stubEnv("INTAKE_SECRET", "intake-secret");
  vi.stubEnv("INBOUND_DOMAIN", "in.vink.test");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

const settle = (t: Backend) => t.finishAllScheduledFunctions(vi.runAllTimers);

const complaint: Recording = {
  reading: { complaint: { subject: "Klacht over levering 4410", _pages: [1] } },
  matches: { subject: { path: "complaint.subject", probability: 0.99 } },
  fills: { subject: "Klacht over levering 4410" },
  route: "Complaint",
  split: { answer: "together", probability: 0.95 },
};

async function setup(t: Backend) {
  const org = await signUp(t, "ann", "Bakkerij De Wit");
  await org.user.mutation(api.forms.create, {
    organisationSlug: org.slug,
    name: "Complaint",
    description: "Customer complaints",
    fields: [{ type: "text", label: "Onderwerp", key: "subject", required: true }],
  });
  await org.user.mutation(api.intake.switchOn, { organisationSlug: org.slug });
  const { address } = await org.user.query(api.intake.get, { organisationSlug: org.slug });
  return { org, token: address!.split("@")[0] };
}

async function sendMail(t: Backend, token: string) {
  const pdfKey = `intake/${crypto.randomUUID()}`;
  const photoKey = `intake/${crypto.randomUUID()}`;
  fakePdfStore.objects.set(pdfKey, await pdfWithPages(3));
  fakePdfStore.objects.set(photoKey, Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, ...new TextEncoder().encode("jpeg bytes")]));
  await t.fetch("/intake/email", {
    method: "POST",
    headers: { Authorization: "Bearer intake-secret", "Content-Type": "application/json" },
    body: JSON.stringify({
      token,
      from: "anouk@bakkerij-dewit.example",
      receivedAt: Date.now(),
      subject: "Klacht over levering 4410",
      date: "2026-10-06T07:12:00.000Z",
      body: "De levering van gisteren was onvolledig.",
      attachments: [
        { key: pdfKey, filename: "pakbon.pdf", mimeType: "application/pdf" },
        { key: photoKey, filename: "doos.jpg", mimeType: "image/jpeg" },
      ],
    }),
  });
  await settle(t);
}

test("get tells the pane which kind a Document is, and an email's file lists its attachments with their pages", async () => {
  const t = newBackend();
  const { org, token } = await setup(t);
  fakePipeline.replay(complaint);
  await sendMail(t, token);
  const [document] = await t.run((ctx) => ctx.db.query("documents").collect());

  const view = await org.user.query(api.documents.get, { organisationSlug: org.slug, documentId: document._id });
  expect(view).toMatchObject({ kind: "email", mimeType: "application/json", splitReason: null });

  // The pane reads this file through a signed URL; the pages let it number the attachments' pages after the body's.
  const stored = JSON.parse(new TextDecoder().decode(fakePdfStore.objects.get(document.key)!)) as StoredEmail;
  expect(stored.attachments).toEqual([
    { filename: "pakbon.pdf", mimeType: "application/pdf", key: `${document.key}/1`, pageCount: 3 },
    { filename: "doos.jpg", mimeType: "image/jpeg", key: `${document.key}/2`, pageCount: 1 },
  ]);
});

test("a Document from before kinds is a PDF to the pane", async () => {
  const t = newBackend();
  const org = await signUp(t, "ann", "Bakkerij De Wit");
  const { formId } = await org.user.mutation(api.forms.create, {
    organisationSlug: org.slug,
    name: "Invoice",
    fields: [{ type: "text", label: "Leverancier", key: "supplier_name", required: true }],
  });
  const documentId = await t.run(async (ctx) => {
    const organisationId = (await ctx.db.query("organisations").first())!._id;
    return await ctx.db.insert("documents", {
      organisationId,
      formId,
      formVersion: 1,
      key: "old/key",
      filename: "old.pdf",
      pageCount: 1,
      uploadedBy: "ann",
      uploaderEmail: "ann@test.nl",
      state: "needs_review",
    });
  });
  const view = await org.user.query(api.documents.get, { organisationSlug: org.slug, documentId });
  expect(view).toMatchObject({ kind: "pdf", mimeType: "application/pdf", splitReason: null });
});

test("attachmentUrl signs only the Document's own attachments, for members of its Organisation", async () => {
  const t = newBackend();
  const { org, token } = await setup(t);
  fakePipeline.replay(complaint);
  await sendMail(t, token);
  const [document] = await t.run((ctx) => ctx.db.query("documents").collect());
  const args = { organisationSlug: org.slug, documentId: document._id };

  expect(await org.user.mutation(api.documents.attachmentUrl, { ...args, index: 1 })).toContain(
    `/view/${document.key}/2?`,
  );
  await expect(org.user.mutation(api.documents.attachmentUrl, { ...args, index: 2 })).rejects.toThrow(
    "Attachment not found",
  );
  await expect(org.user.mutation(api.documents.attachmentUrl, { ...args, index: -1 })).rejects.toThrow(
    "Attachment not found",
  );

  // Another Organisation's Document looks like a missing one.
  const eve = await signUp(t, "eve", "Eve BV");
  await expect(
    eve.user.mutation(api.documents.attachmentUrl, { organisationSlug: eve.slug, documentId: document._id, index: 0 }),
  ).rejects.toThrow("Submission not found");
});
