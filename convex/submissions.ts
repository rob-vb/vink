import { ConvexError, v } from "convex/values";
import { PDFDocument } from "pdf-lib";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  type ActionCtx,
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { deliveriesOf } from "./deliveries";
import { startExtraction } from "./extraction";
import { countIn } from "./lib/submissionStates";
import type { SplitInfo } from "./lib/eventInfo";
import { failureOf } from "./lib/failure";
import { orgAction, orgMutation, orgQuery } from "./lib/functions";
import { chargeItems } from "./items";
import { looksLikeEmail, type ParsedEmail, parseEml } from "./lib/emailParse";
import {
  ATTACHMENTS_TOO_LARGE,
  EMAIL_BODY_TOO_LARGE,
  EMPTY_EMAIL,
  IMAGE_TOO_LARGE,
  type InputKind,
  itemCountOf,
  kindOf,
  MAX_EMAIL_ATTACHMENT_BYTES,
  MAX_EMAIL_ATTACHMENTS,
  MAX_EMAIL_BODY_BYTES,
  MAX_IMAGE_BYTES,
  MAX_PDF_BYTES,
  mimeTypeOf,
  PDF_MIME_TYPE,
  PDF_TOO_LARGE,
  TOO_MANY_ATTACHMENTS,
  UNSUPPORTED_TYPE,
} from "./lib/inputLimits";
import { pdfStore } from "./lib/pdfStore";
import { EMAIL_MIME_TYPE, emailFilename, storeEmail } from "./lib/storedEmail";
import { sniffFile } from "./lib/sniff";
import type { FlatField } from "./lib/pipeline";
import {
  fieldValueNeedsReview,
  listNeedsReview,
  listReasons,
  needsReviewCount,
} from "./lib/reviewState";
import { submissionState, inputKind } from "./schema";

// An Extraction must finish within Convex's 10-minute action limit, and a PDF
// is never split.
const MAX_PAGES = 20;

// checkPdf's refusals. The app translates them by this exact text
// (lib/server-errors.ts); the public API maps them to its codes.
export const NOT_A_PDF = "This file isn't a PDF Vink can read.";
export const tooManyPages = (pages: number) =>
  `This PDF has ${pages} pages. Vink reads up to ${MAX_PAGES} pages per PDF.`;

/** Step 1 of an upload: where the browser PUTs the PDF. */
export const generateUploadUrl = orgMutation({
  args: {},
  handler: async (ctx) => {
    const key = `${ctx.organisationId}/${crypto.randomUUID()}`;
    // Recorded so an upload that never becomes a Submission is deleted (retention.ts).
    await ctx.db.insert("uploads", { organisationId: ctx.organisationId, key, issuedAt: Date.now() });
    return { key, url: await pdfStore.uploadUrl(key) };
  },
});

/** The upload under `key` is in use (a Submission or a Form Proposal sample): no longer an orphan. */
export async function claimUpload(ctx: MutationCtx, key: string) {
  const upload = await ctx.db
    .query("uploads")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (upload !== null) await ctx.db.delete(upload._id);
}

/**
 * Checks an uploaded PDF: issued to this Organisation, arrived, at most 10 MB,
 * readable and at most 20 pages. Returns its page count; a refused upload is removed.
 */
export async function checkUpload(
  ctx: ActionCtx,
  organisationId: Id<"organisations">,
  key: string,
) {
  await checkIssued(ctx, organisationId, key);
  return await checkPdf(ctx, key);
}

/**
 * The key must be an upload issued to this Organisation by generateUploadUrl and
 * not used yet (claimUpload removes its row). So another Submission's key, an
 * email attachment's key or a made-up key (`..` included) is Forbidden, and a
 * refusal afterwards can only delete the caller's own upload.
 */
export async function checkIssued(ctx: ActionCtx, organisationId: Id<"organisations">, key: string) {
  const issued = await ctx.runQuery(internal.submissions.isIssued, { organisationId, key });
  if (!issued) throw new ConvexError("Forbidden");
}

export const isIssued = internalQuery({
  args: { organisationId: v.id("organisations"), key: v.string() },
  handler: async (ctx, { organisationId, key }) => {
    const upload = await ctx.db
      .query("uploads")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    return upload !== null && upload.organisationId === organisationId;
  },
});

/**
 * What every way in (upload, Intake Address) checks before a PDF is accepted:
 * it arrived, is at most 10 MB, is readable and has at most 20 pages. Returns
 * its page count; a refused PDF is removed from storage.
 */
export async function checkPdf(ctx: ActionCtx, key: string) {
  const bytes = await pdfStore.read(key);
  if (bytes === null) {
    throw new ConvexError("The upload didn't arrive. Try again.");
  }
  try {
    return await checkPdfBytes(bytes);
  } catch (error) {
    // A refused upload leaves nothing behind.
    await pdfStore.remove(ctx, key);
    throw error;
  }
}

/** checkPdf's checks on bytes in hand: at most 10 MB, readable, at most 20 pages. Returns the page count. */
async function checkPdfBytes(bytes: Uint8Array) {
  if (bytes.length > MAX_PDF_BYTES) {
    throw new ConvexError(PDF_TOO_LARGE);
  }
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true }).catch(() => {
    throw new ConvexError(NOT_A_PDF);
  });
  if (pdf.getPageCount() > MAX_PAGES) {
    throw new ConvexError(tooManyPages(pdf.getPageCount()));
  }
  return pdf.getPageCount();
}

/**
 * Step 2 of an upload: turns the uploaded file (a PDF, a JPG, PNG or HEIC
 * image, or an .eml email) into a Submission. Without a `formId`, the Router
 * picks the Form after Read (ADR 0010).
 */
export const create = orgAction({
  args: { formId: v.optional(v.id("forms")), key: v.string(), filename: v.string() },
  handler: async (ctx, { formId, key, filename }) => {
    await checkIssued(ctx, ctx.organisationId, key);
    const identity = (await ctx.auth.getUserIdentity())!;
    await acceptFile(ctx, {
      organisationId: ctx.organisationId,
      formId,
      key,
      filename,
      uploadedBy: ctx.userId,
      uploaderEmail: identity.email?.toLowerCase() ?? "",
    });
  },
});

/** Step 2 of a pasted email: the text the user pasted becomes an email Submission. */
export const createEmail = orgAction({
  args: { formId: v.optional(v.id("forms")), subject: v.optional(v.string()), body: v.string() },
  handler: async (ctx, { formId, subject = "", body }) => {
    const identity = (await ctx.auth.getUserIdentity())!;
    const uploaderEmail = identity.email?.toLowerCase() ?? "";
    await acceptEmail(ctx, {
      organisationId: ctx.organisationId,
      formId,
      // The sender is not known from pasted text.
      email: { subject: subject.trim(), from: "", date: "", body, attachments: [] },
      uploadedBy: ctx.userId,
      uploaderEmail,
    });
  },
});

type Acceptance = {
  organisationId: Id<"organisations">;
  /** Left out: the Router picks the Form after Read (ADR 0010). */
  formId?: Id<"forms">;
  uploadedBy: string;
  uploaderEmail: string;
};

/**
 * The one way a stored file becomes a Submission, for the ways in that take a
 * file (upload, public API). The kind comes from the file's own first bytes
 * (lib/sniff.ts), never from a name or a Content-Type:
 *   PDF   = checkPdf, then its pages are charged
 *   image = JPG, PNG or HEIC at most 10 MB, 1 Item
 *   email = an .eml file (by its name, when the bytes are no PDF or image),
 *           read into an email Submission (acceptEmail)
 * A refused file creates nothing, charges nothing and is removed from storage;
 * the refusal is thrown. (An Intake Address checks its parts itself, in intake.ts.)
 */
export async function acceptFile(
  ctx: ActionCtx,
  submission: Acceptance & { key: string; filename: string },
): Promise<Id<"submissions">> {
  const bytes = await pdfStore.read(submission.key);
  if (bytes === null) throw new ConvexError("The upload didn't arrive. Try again.");
  try {
    const checked = await checkFile(bytes, submission.filename);
    if (checked.kind === "email") {
      const { subject, from, date, body, attachments } = checked.email;
      // The file itself is not kept: acceptEmail writes the email the Reader reads.
      const id = await acceptEmail(ctx, {
        organisationId: submission.organisationId,
        formId: submission.formId,
        uploadedBy: submission.uploadedBy,
        uploaderEmail: submission.uploaderEmail,
        email: { subject, from, date, body, attachments },
        // Without a subject, the file's name tells the Submissions apart.
        filename: subject === "" ? submission.filename : undefined,
        uploadKey: submission.key,
      });
      await pdfStore.remove(ctx, submission.key);
      return id;
    }
    return await insertFile(ctx, submission, checked);
  } catch (error) {
    // A refused file leaves nothing behind (a refused .eml is removed here too).
    await pdfStore.remove(ctx, submission.key);
    throw error;
  }
}

/**
 * What an uploaded file is, checked, from its own first bytes (lib/sniff.ts):
 * a PDF (readable, at most 20 pages), a JPG, PNG or HEIC image (at most 10 MB)
 * or an .eml email (by its name, when the bytes are no PDF or image). Throws
 * the refusal. Shared by Submissions (acceptFile) and Form Proposal samples
 * (formProposals.ts); it removes nothing, the caller removes a refused upload.
 */
export async function checkFile(
  bytes: Uint8Array,
  filename: string,
): Promise<
  | { kind: "pdf" | "image"; mimeType: string; pageCount: number; items: number }
  | { kind: "email"; email: ParsedEmail }
> {
  const sniffed = sniffFile(bytes);
  if (sniffed === null) {
    const name = filename.toLowerCase();
    // Named as a PDF, and the bytes are nothing Vink reads: say so in the PDF's words.
    if (name.endsWith(".pdf")) throw new ConvexError(NOT_A_PDF);
    if (!name.endsWith(".eml") || !looksLikeEmail(bytes)) throw new ConvexError(UNSUPPORTED_TYPE);
    return { kind: "email", email: parseEml(bytes) };
  }
  if (sniffed.kind === "pdf") {
    const pageCount = await checkPdfBytes(bytes);
    return { kind: "pdf", mimeType: sniffed.mimeType, pageCount, items: pageCount };
  }
  if (bytes.length > MAX_IMAGE_BYTES) throw new ConvexError(IMAGE_TOO_LARGE);
  return { kind: "image", mimeType: sniffed.mimeType, pageCount: 1, items: 1 };
}

async function insertFile(
  ctx: ActionCtx,
  submission: Acceptance & { key: string; filename: string },
  file: { kind: InputKind; mimeType: string; pageCount: number; items: number },
) {
  return await ctx.runMutation(internal.submissions.insert, {
    ...submission,
    ...file,
    what: file.kind === "pdf" ? "PDF" : "image",
  });
}

/**
 * An email's checks, shared by Submissions (acceptEmail) and Form Proposal
 * samples: its text at most 200 KB, at most 10 attachments of 12 MB together,
 * each a PDF or image as an upload is checked, and not empty. Returns the
 * trimmed text, the attachments' parts and the Items the email costs.
 */
export async function checkEmail(email: {
  body: string;
  attachments: Array<{ filename: string; bytes: Uint8Array }>;
}) {
  const body = email.body.trim();
  if (new TextEncoder().encode(body).length > MAX_EMAIL_BODY_BYTES) throw new ConvexError(EMAIL_BODY_TOO_LARGE);
  if (email.attachments.length > MAX_EMAIL_ATTACHMENTS) throw new ConvexError(TOO_MANY_ATTACHMENTS);
  if (email.attachments.reduce((sum, a) => sum + a.bytes.length, 0) > MAX_EMAIL_ATTACHMENT_BYTES) {
    throw new ConvexError(ATTACHMENTS_TOO_LARGE);
  }
  if (body === "" && email.attachments.length === 0) throw new ConvexError(EMPTY_EMAIL);

  const parts: Array<{ filename: string; mimeType: string; bytes: Uint8Array; pageCount: number }> = [];
  const counted: Array<{ kind: "pdf"; pageCount: number } | { kind: "image" }> = [];
  for (const attachment of email.attachments) {
    const sniffed = sniffFile(attachment.bytes);
    if (sniffed === null) throw new ConvexError(UNSUPPORTED_TYPE);
    if (sniffed.kind === "pdf") {
      counted.push({ kind: "pdf", pageCount: await checkPdfBytes(attachment.bytes) });
    } else {
      if (attachment.bytes.length > MAX_IMAGE_BYTES) throw new ConvexError(IMAGE_TOO_LARGE);
      counted.push({ kind: "image" });
    }
    const counts = counted[counted.length - 1];
    parts.push({
      filename: attachment.filename,
      mimeType: sniffed.mimeType,
      bytes: attachment.bytes,
      pageCount: counts.kind === "pdf" ? counts.pageCount : 1,
    });
  }
  const items = itemCountOf({ kind: "email", body, attachments: counted });
  return { body, parts, items };
}

/**
 * An email as an email Submission: its text (at most 200 KB) and its PDF and
 * image attachments (at most 10, 12 MB together, each as an upload is checked)
 * become one Submission, charged as itemCountOf says: the text 1 Item if it has
 * content, plus each attachment's. The server writes the stored email and its
 * attachments (lib/storedEmail.ts); nothing the sender sent decides a key or a
 * type. An email without text and attachments is refused. Unlike an Intake
 * Address, this does not ask Jev to split the email: what a person or program
 * sends in as one email is one Submission.
 */
export async function acceptEmail(
  ctx: ActionCtx,
  {
    email,
    filename,
    uploadKey,
    ...submission
  }: Acceptance & {
    email: {
      subject: string;
      from: string;
      date: string;
      body: string;
      attachments: Array<{ filename: string; bytes: Uint8Array }>;
    };
    /** The name in the list; the subject by default. */
    filename?: string;
    /** The upload this email came from, which is no longer an orphan once the Submission exists. */
    uploadKey?: string;
  },
): Promise<Id<"submissions">> {
  const { body, parts, items } = await checkEmail(email);

  const stored = await storeEmail(ctx, submission.organisationId, { ...email, body }, parts);
  try {
    return await ctx.runMutation(internal.submissions.insert, {
      ...submission,
      key: stored.key,
      filename: filename ?? emailFilename(email.subject, email.from),
      kind: "email",
      mimeType: EMAIL_MIME_TYPE,
      // The email's own page: the body (see Verify in lib/reader.ts).
      pageCount: 1,
      items,
      what: "email",
      attachmentKeys: stored.attachmentKeys,
      ...(uploadKey === undefined ? {} : { uploadKey }),
    });
  } catch (error) {
    for (const key of [stored.key, ...stored.attachmentKeys]) await pdfStore.remove(ctx, key);
    throw error;
  }
}

export const insert = internalMutation({
  args: {
    organisationId: v.id("organisations"),
    formId: v.optional(v.id("forms")),
    key: v.string(),
    filename: v.string(),
    pageCount: v.number(),
    uploadedBy: v.string(),
    uploaderEmail: v.string(),
    // A PDF unless said otherwise.
    kind: v.optional(inputKind),
    mimeType: v.optional(v.string()),
    /** The Items to charge; a PDF's pages by default. */
    items: v.optional(v.number()),
    /** What an out-of-Items refusal calls the input: "this PDF needs 8". */
    what: v.optional(v.string()),
    attachmentKeys: v.optional(v.array(v.string())),
    /** The upload this Submission came from, when its file is not the Submission's own. */
    uploadKey: v.optional(v.string()),
  },
  handler: async (ctx, { items, what, uploadKey, ...args }) => {
    await chargeItems(
      ctx,
      args.organisationId,
      items ?? itemCountOf({ kind: "pdf", pageCount: args.pageCount }),
      what,
    );
    const submissionId = await createSubmission(ctx, args);
    if (uploadKey !== undefined) await claimUpload(ctx, uploadKey);
    return submissionId;
  },
});

/**
 * A Submission of a Form at its current Form Version, in Extracting; without a
 * Form, it is the Router's to place after Read (ADR 0010). With a `reading`,
 * the Extraction starts from it and never reads the PDF.
 */
export async function createSubmission(
  ctx: MutationCtx,
  {
    formId,
    reading,
    kind = "pdf",
    mimeType = PDF_MIME_TYPE,
    split,
    ...submission
  }: {
    organisationId: Id<"organisations">;
    formId?: Id<"forms">;
    key: string;
    filename: string;
    pageCount: number;
    kind?: InputKind;
    mimeType?: string;
    /** An email's attachments, stored under `${key}/…` (lib/submissionFiles.ts removes them with it). */
    attachmentKeys?: string[];
    /** Why Vink split an email it was unsure about; the Submission then waits for a user (never Auto-Send). */
    split?: SplitInfo;
    uploadedBy: string;
    uploaderEmail: string;
    reading?: { json: string; textLayer: Array<{ page: number; text: string }> };
  },
) {
  const form = formId === undefined ? null : await ctx.db.get(formId);
  if (formId !== undefined && (form === null || form.organisationId !== submission.organisationId)) {
    throw new ConvexError("Form not found");
  }
  const submissionId = await ctx.db.insert("submissions", {
    ...submission,
    kind,
    mimeType,
    ...(form === null ? {} : { formId: form._id, formVersion: form.version }),
    // `userTouched` rules out Auto-Send: a split Vink was unsure about needs a look.
    ...(split === undefined ? {} : { splitInfo: split, userTouched: true }),
    state: "extracting",
  });
  await claimUpload(ctx, submission.key);
  await ctx.db.insert("submissionEvents", {
    organisationId: submission.organisationId,
    submissionId,
    event: "uploaded",
    by: submission.uploadedBy,
    byEmail: submission.uploaderEmail,
    at: Date.now(),
  });
  if (split !== undefined) {
    await ctx.db.insert("submissionEvents", {
      organisationId: submission.organisationId,
      submissionId,
      event: "mail_split",
      info: { code: "mail_split", split },
      by: "vink",
      byEmail: "Vink",
      at: Date.now(),
    });
  }
  await countIn(ctx, submission.organisationId, "extracting");
  if (reading) {
    await ctx.db.insert("readings", {
      organisationId: submission.organisationId,
      submissionId,
      ...reading,
    });
  }
  await startExtraction(ctx, submissionId);
  return submissionId;
}

async function getSubmission(
  ctx: QueryCtx,
  organisationId: Id<"organisations">,
  submissionId: Id<"submissions">,
) {
  const submission = await ctx.db.get(submissionId);
  // Another Organisation's Submission looks the same as a missing one.
  if (submission === null || submission.organisationId !== organisationId) {
    throw new ConvexError("Submission not found");
  }
  return submission;
}

function rejectionOf(submission: Doc<"submissions">) {
  const { rejection } = submission;
  return rejection ? { by: rejection.byEmail, at: rejection.at, reason: rejection.reason } : null;
}

/** What a user sees of one Field Value. */
function viewOf(field: FlatField, fieldValue: Doc<"fieldValues">) {
  const { review } = fieldValue;
  return {
    id: fieldValue._id,
    key: field.key,
    label: field.label,
    type: field.type,
    required: field.required,
    options: field.type === "choice" ? field.options.map((o) => o.value) : null,
    value: fieldValue.value,
    readText: fieldValue.readText,
    sourcePath: fieldValue.sourcePath,
    pages: fieldValue.pages,
    confidence: fieldValue.confidence,
    lowestSignal: fieldValue.lowestSignal,
    signals: fieldValue.signals,
    reviewReasons: fieldValue.reviewReasons,
    needsReview: fieldValueNeedsReview(fieldValue),
    review: review ? { state: review.state, by: review.byEmail, at: review.at } : null,
  };
}

/**
 * One Submission with its history, oldest event first, and its Field Values in
 * the order of its Form Version's Fields: top-level ones, and per List Field
 * its entries, each a Field Value per sub-Field.
 */
export const get = orgQuery({
  args: { submissionId: v.id("submissions") },
  handler: async (ctx, { submissionId }) => {
    const submission = await getSubmission(ctx, ctx.organisationId, submissionId);
    const { formId, formVersion: versionNumber } = submission;
    const form = formId === undefined ? null : await ctx.db.get(formId);
    const formVersion =
      formId === undefined || versionNumber === undefined
        ? null
        : await ctx.db
            .query("formVersions")
            .withIndex("by_formId_and_number", (q) => q.eq("formId", formId).eq("number", versionNumber))
            .unique();
    const fields = formVersion?.fields ?? [];
    const fieldValues = await ctx.db
      .query("fieldValues")
      .withIndex("by_submissionId", (q) => q.eq("submissionId", submissionId))
      .take(5000);
    const topLevel = new Map(fieldValues.filter((f) => !f.list).map((f) => [f.key, f]));
    const inLists = new Map(
      fieldValues.flatMap((f) => (f.list ? [[`${f.list.key}[${f.list.entry}].${f.key}`, f]] : [])),
    );
    const listValues = await ctx.db
      .query("listValues")
      .withIndex("by_submissionId", (q) => q.eq("submissionId", submissionId))
      .take(100);
    const events = await ctx.db
      .query("submissionEvents")
      .withIndex("by_submissionId", (q) => q.eq("submissionId", submissionId))
      .take(500);
    return {
      id: submission._id,
      filename: submission.filename,
      pageCount: submission.pageCount,
      // Which pane the review screen shows; a Submission from before kinds is a PDF.
      kind: kindOf(submission),
      mimeType: mimeTypeOf(submission),
      // Why Vink split the email this Submission came from, when it was unsure.
      splitReason: submission.splitReason ?? null,
      split: submission.splitInfo ?? null,
      state: submission.state,
      formName: form?.name ?? "",
      formVersion: submission.formVersion ?? null,
      formId: submission.formId ?? null,
      jevVerified: submission.jevVerified ?? false,
      doesNotFit: submission.doesNotFit ?? false,
      reviewThreshold: submission.reviewThreshold ?? null,
      userTouched: submission.userTouched ?? false,
      // A code, never the server's error text (lib/failure.ts).
      failure: failureOf(submission.extractionError),
      deliveries: await deliveriesOf(ctx, submissionId),
      rejection: rejectionOf(submission),
      dataDeleted: submission.dataDeletedAt !== undefined,
      dataDeletedAt: submission.dataDeletedAt ?? null,
      // The Admin who deleted it now; `null` when retention did, or nobody.
      dataDeletedBy:
        submission.dataDeletedAt === undefined
          ? null
          : (events.findLast((e) => e.event === "deleted")?.byEmail ?? null),
      approval: submission.approval
        ? { mode: submission.approval.mode, by: submission.approval.byEmail, at: submission.approval.at }
        : null,
      needsReviewCount: needsReviewCount(fieldValues, listValues),
      history: events.map((e) => ({
        event: e.event,
        detail: e.detail ?? null,
        info: e.info ?? null,
        by: e.byEmail,
        at: e.at,
      })),
      fieldValues: fields.flatMap((field) => {
        if (field.type === "list") return [];
        const fieldValue = topLevel.get(field.key);
        return fieldValue ? [viewOf(field, fieldValue)] : [];
      }),
      lists: fields.flatMap((field) => {
        if (field.type !== "list") return [];
        const list = listValues.find((l) => l.key === field.key);
        if (list === undefined) return [];
        const removed = new Set(list.removedEntries ?? []);
        const added = new Set(list.addedEntries ?? []);
        const entries = Array.from({ length: list.entryCount }, (_, entry) => ({
          entry,
          removed: removed.has(entry),
          added: added.has(entry),
          fieldValues: field.fields.flatMap((subField) => {
            const fieldValue = inLists.get(`${field.key}[${entry}].${subField.key}`);
            return fieldValue ? [viewOf(subField, fieldValue)] : [];
          }),
        }));
        return [
          {
            key: field.key,
            label: field.label,
            required: field.required,
            sourcePath: list.sourcePath,
            completeness: list.completeness,
            reviewReasons: listReasons(list),
            needsReview: listNeedsReview(list),
            complete: list.complete ? { by: list.complete.byEmail, at: list.complete.at } : null,
            entries,
          },
        ];
      }),
    };
  },
});

// Long enough to open the PDF, short enough that a leaked link soon stops working.
const PDF_URL_SECONDS = 5 * 60;

/**
 * A short-lived signed URL for a Submission's PDF. A mutation, not a query, so a
 * cached result never hands out a URL that has already expired.
 */
export const pdfUrl = orgMutation({
  args: { submissionId: v.id("submissions") },
  handler: async (ctx, { submissionId }) => {
    const submission = await getSubmission(ctx, ctx.organisationId, submissionId);
    if (submission.dataDeletedAt !== undefined) throw new ConvexError("The PDF was deleted");
    return await pdfStore.viewUrl(submission.key, PDF_URL_SECONDS);
  },
});

/**
 * A short-lived signed URL for one attachment of an email Submission, by its
 * place in the email's list (the stored email file names the same places). Only
 * the Submission's own attachment keys are ever signed.
 */
export const attachmentUrl = orgMutation({
  args: { submissionId: v.id("submissions"), index: v.number() },
  handler: async (ctx, { submissionId, index }) => {
    const submission = await getSubmission(ctx, ctx.organisationId, submissionId);
    if (submission.dataDeletedAt !== undefined) throw new ConvexError("The file was deleted");
    const key = submission.attachmentKeys?.[index];
    if (key === undefined) throw new ConvexError("Attachment not found");
    return await pdfStore.viewUrl(key, PDF_URL_SECONDS);
  },
});

// The states with a tab in the Submission list (No Form has its own list); Rejected is behind a filter.
const listedStates = [
  "extracting",
  "needs_review",
  "approved",
  "extraction_failed",
  "no_form",
  "rejected",
] as const;

/**
 * The Submissions in one state, newest first. The Rejected list also holds the
 * Submissions deleted after rejection, which keep their metadata.
 */
export const list = orgQuery({
  args: { state: submissionState },
  handler: async (ctx, { state }) => {
    const inState = (s: typeof state) =>
      ctx.db
        .query("submissions")
        .withIndex("by_organisationId_and_state", (q) =>
          q.eq("organisationId", ctx.organisationId).eq("state", s),
        )
        .order("desc")
        .take(200);
    const submissions =
      state === "rejected"
        ? [...(await inState("rejected")), ...(await inState("deleted"))].sort(
            (a, b) => b._creationTime - a._creationTime,
          )
        : await inState(state);
    const counters = await ctx.db
      .query("submissionCounts")
      .withIndex("by_organisationId_and_state", (q) =>
        q.eq("organisationId", ctx.organisationId),
      )
      .take(20);
    const counts = Object.fromEntries(
      listedStates.map((s) => [s, counters.find((c) => c.state === s)?.count ?? 0]),
    ) as Record<(typeof listedStates)[number], number>;
    return {
      counts,
      submissions: await Promise.all(
        submissions.map(async (submission) => {
          const form = submission.formId === undefined ? null : await ctx.db.get(submission.formId);
          return {
            id: submission._id,
            filename: submission.filename,
            pageCount: submission.pageCount,
            state: submission.state,
            formName: form?.name ?? "",
            formVersion: submission.formVersion ?? null,
            uploadedBy: submission.uploaderEmail,
            uploadedAt: submission._creationTime,
            rejection: rejectionOf(submission),
            approvalMode: submission.approval?.mode ?? null,
          };
        }),
      ),
    };
  },
});

/** Rows one backfill page reads. Far under a mutation's limits (~16k reads, ~8k writes). */
const BACKFILL_PAGE_SIZE = 500;

/**
 * The input model (ADR 0010, step 3), backfill step: gives every Submission and
 * Form Proposal from before kinds its `kind: "pdf"` and `mimeType:
 * "application/pdf"`. Idempotent; it changes nothing else, so no totals move.
 * Run once per deployment, after the code that reads a missing kind as a PDF
 * is deployed. One command walks both tables to the end, one page per
 * mutation (a single mutation over a big table would roll back whole):
 *   npx convex run submissions:backfillInputKind          (dev)
 *   npx convex run --prod submissions:backfillInputKind   (prod)
 * Returns the total it filled per table. The check is a full second run: it
 * must return `{ submissions: 0, formProposals: 0 }`. If a run stops half way,
 * run it again: pages already done find nothing to fill.
 *
 * TODO(narrow): once it ran on dev AND prod (a second run says 0 for both),
 * make `kind` and `mimeType` required on `submissions` and `formProposals` in
 * schema.ts, drop the fallbacks in lib/inputLimits.ts (kindOf, mimeTypeOf) and
 * their callers, and remove these two functions.
 */
export const backfillInputKind = internalAction({
  args: { numItems: v.optional(v.number()) },
  handler: async (ctx, { numItems }): Promise<{ submissions: number; formProposals: number }> => {
    const filled = { submissions: 0, formProposals: 0 };
    for (const table of ["submissions", "formProposals"] as const) {
      let cursor: string | null = null;
      for (;;) {
        const page: BackfillPage = await ctx.runMutation(internal.submissions.backfillInputKindPage, {
          table,
          cursor,
          numItems,
        });
        filled[table] += page.filled;
        if (page.isDone) break;
        cursor = page.continueCursor;
      }
    }
    return filled;
  },
});

type BackfillPage = { filled: number; continueCursor: string; isDone: boolean };

/** One page of `backfillInputKind`: patches only the rows on it that still lack a kind or MIME type. */
export const backfillInputKindPage = internalMutation({
  args: {
    table: v.union(v.literal("submissions"), v.literal("formProposals")),
    cursor: v.optional(v.union(v.string(), v.null())),
    numItems: v.optional(v.number()),
  },
  handler: async (ctx, { table, cursor, numItems }): Promise<BackfillPage> => {
    const paginationOpts = { cursor: cursor ?? null, numItems: numItems ?? BACKFILL_PAGE_SIZE };
    let filled = 0;
    if (table === "submissions") {
      const { page, continueCursor, isDone } = await ctx.db.query("submissions").paginate(paginationOpts);
      for (const submission of page) {
        if (submission.kind !== undefined && submission.mimeType !== undefined) continue;
        await ctx.db.patch(submission._id, {
          kind: submission.kind ?? "pdf",
          mimeType: submission.mimeType ?? PDF_MIME_TYPE,
        });
        filled++;
      }
      return { filled, continueCursor, isDone };
    }
    const { page, continueCursor, isDone } = await ctx.db.query("formProposals").paginate(paginationOpts);
    for (const proposal of page) {
      if (proposal.kind !== undefined && proposal.mimeType !== undefined) continue;
      await ctx.db.patch(proposal._id, {
        kind: proposal.kind ?? "pdf",
        mimeType: proposal.mimeType ?? PDF_MIME_TYPE,
      });
      filled++;
    }
    return { filled, continueCursor, isDone };
  },
});
