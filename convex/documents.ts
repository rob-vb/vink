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
import { countIn } from "./lib/documentStates";
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
import { documentState, inputKind } from "./schema";

// An Extraction must finish within Convex's 10-minute action limit, and a PDF
// is never split.
const MAX_PAGES = 20;

// checkPdf's refusals. The app translates them by this exact text
// (lib/server-errors.ts); the public API maps them to its codes.
export const NOT_A_PDF = "This file isn't a PDF Vink can read.";
export const tooManyPages = (pages: number) =>
  `This PDF has ${pages} pages. Vink reads up to ${MAX_PAGES} pages per Document.`;

/** Step 1 of an upload: where the browser PUTs the PDF. */
export const generateUploadUrl = orgMutation({
  args: {},
  handler: async (ctx) => {
    const key = `${ctx.organisationId}/${crypto.randomUUID()}`;
    // Recorded so an upload that never becomes a Document is deleted (retention.ts).
    await ctx.db.insert("uploads", { organisationId: ctx.organisationId, key, issuedAt: Date.now() });
    return { key, url: await pdfStore.uploadUrl(key) };
  },
});

/** The upload under `key` is in use (a Document or a Form Proposal sample): no longer an orphan. */
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
 * not used yet (claimUpload removes its row). So another Document's key, an
 * email attachment's key or a made-up key (`..` included) is Forbidden, and a
 * refusal afterwards can only delete the caller's own upload.
 */
export async function checkIssued(ctx: ActionCtx, organisationId: Id<"organisations">, key: string) {
  const issued = await ctx.runQuery(internal.documents.isIssued, { organisationId, key });
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
 * image, or an .eml email) into a Document. Without a `formId`, the Router
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

/** Step 2 of a pasted email: the text the user pasted becomes an email Document. */
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
 * The one way a stored file becomes a Document, for the ways in that take a
 * file (upload, public API). The kind comes from the file's own first bytes
 * (lib/sniff.ts), never from a name or a Content-Type:
 *   PDF   = checkPdf, then its pages are charged
 *   image = JPG, PNG or HEIC at most 10 MB, 1 Item
 *   email = an .eml file (by its name, when the bytes are no PDF or image),
 *           read into an email Document (acceptEmail)
 * A refused file creates nothing, charges nothing and is removed from storage;
 * the refusal is thrown. (An Intake Address checks its parts itself, in intake.ts.)
 */
export async function acceptFile(
  ctx: ActionCtx,
  document: Acceptance & { key: string; filename: string },
): Promise<Id<"documents">> {
  const bytes = await pdfStore.read(document.key);
  if (bytes === null) throw new ConvexError("The upload didn't arrive. Try again.");
  try {
    const checked = await checkFile(bytes, document.filename);
    if (checked.kind === "email") {
      const { subject, from, date, body, attachments } = checked.email;
      // The file itself is not kept: acceptEmail writes the email the Reader reads.
      const id = await acceptEmail(ctx, {
        organisationId: document.organisationId,
        formId: document.formId,
        uploadedBy: document.uploadedBy,
        uploaderEmail: document.uploaderEmail,
        email: { subject, from, date, body, attachments },
        // Without a subject, the file's name tells the Documents apart.
        filename: subject === "" ? document.filename : undefined,
        uploadKey: document.key,
      });
      await pdfStore.remove(ctx, document.key);
      return id;
    }
    return await insertFile(ctx, document, checked);
  } catch (error) {
    // A refused file leaves nothing behind (a refused .eml is removed here too).
    await pdfStore.remove(ctx, document.key);
    throw error;
  }
}

/**
 * What an uploaded file is, checked, from its own first bytes (lib/sniff.ts):
 * a PDF (readable, at most 20 pages), a JPG, PNG or HEIC image (at most 10 MB)
 * or an .eml email (by its name, when the bytes are no PDF or image). Throws
 * the refusal. Shared by Documents (acceptFile) and Form Proposal samples
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
  document: Acceptance & { key: string; filename: string },
  file: { kind: InputKind; mimeType: string; pageCount: number; items: number },
) {
  return await ctx.runMutation(internal.documents.insert, {
    ...document,
    ...file,
    what: file.kind === "pdf" ? "PDF" : "image",
  });
}

/**
 * An email's checks, shared by Documents (acceptEmail) and Form Proposal
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
 * An email as an email Document: its text (at most 200 KB) and its PDF and
 * image attachments (at most 10, 12 MB together, each as an upload is checked)
 * become one Document, charged as itemCountOf says: the text 1 Item if it has
 * content, plus each attachment's. The server writes the stored email and its
 * attachments (lib/storedEmail.ts); nothing the sender sent decides a key or a
 * type. An email without text and attachments is refused. Unlike an Intake
 * Address, this does not ask Jev to split the email: what a person or program
 * sends in as one email is one Document.
 */
export async function acceptEmail(
  ctx: ActionCtx,
  {
    email,
    filename,
    uploadKey,
    ...document
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
    /** The upload this email came from, which is no longer an orphan once the Document exists. */
    uploadKey?: string;
  },
): Promise<Id<"documents">> {
  const { body, parts, items } = await checkEmail(email);

  const stored = await storeEmail(ctx, document.organisationId, { ...email, body }, parts);
  try {
    return await ctx.runMutation(internal.documents.insert, {
      ...document,
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
    /** The upload this Document came from, when its file is not the Document's own. */
    uploadKey: v.optional(v.string()),
  },
  handler: async (ctx, { items, what, uploadKey, ...args }) => {
    await chargeItems(
      ctx,
      args.organisationId,
      items ?? itemCountOf({ kind: "pdf", pageCount: args.pageCount }),
      what,
    );
    const documentId = await createDocument(ctx, args);
    if (uploadKey !== undefined) await claimUpload(ctx, uploadKey);
    return documentId;
  },
});

/**
 * A Document of a Form at its current Form Version, in Extracting; without a
 * Form, it is the Router's to place after Read (ADR 0010). With a `reading`,
 * the Extraction starts from it and never reads the PDF.
 */
export async function createDocument(
  ctx: MutationCtx,
  {
    formId,
    reading,
    kind = "pdf",
    mimeType = PDF_MIME_TYPE,
    splitReason,
    ...document
  }: {
    organisationId: Id<"organisations">;
    formId?: Id<"forms">;
    key: string;
    filename: string;
    pageCount: number;
    kind?: InputKind;
    mimeType?: string;
    /** An email's attachments, stored under `${key}/…` (lib/documentFiles.ts removes them with it). */
    attachmentKeys?: string[];
    /** Why Vink split an email it was unsure about; the Document then waits for a user (never Auto-Send). */
    splitReason?: string;
    uploadedBy: string;
    uploaderEmail: string;
    reading?: { json: string; textLayer: Array<{ page: number; text: string }> };
  },
) {
  const form = formId === undefined ? null : await ctx.db.get(formId);
  if (formId !== undefined && (form === null || form.organisationId !== document.organisationId)) {
    throw new ConvexError("Form not found");
  }
  const documentId = await ctx.db.insert("documents", {
    ...document,
    kind,
    mimeType,
    ...(form === null ? {} : { formId: form._id, formVersion: form.version }),
    // `userTouched` rules out Auto-Send: a split Vink was unsure about needs a look.
    ...(splitReason === undefined ? {} : { splitReason, userTouched: true }),
    state: "extracting",
  });
  await claimUpload(ctx, document.key);
  await ctx.db.insert("documentEvents", {
    organisationId: document.organisationId,
    documentId,
    event: "uploaded",
    by: document.uploadedBy,
    byEmail: document.uploaderEmail,
    at: Date.now(),
  });
  if (splitReason !== undefined) {
    await ctx.db.insert("documentEvents", {
      organisationId: document.organisationId,
      documentId,
      event: "mail_split",
      detail: splitReason,
      by: "vink",
      byEmail: "Vink",
      at: Date.now(),
    });
  }
  await countIn(ctx, document.organisationId, "extracting");
  if (reading) {
    await ctx.db.insert("readings", {
      organisationId: document.organisationId,
      documentId,
      ...reading,
    });
  }
  await startExtraction(ctx, documentId);
  return documentId;
}

async function getDocument(
  ctx: QueryCtx,
  organisationId: Id<"organisations">,
  documentId: Id<"documents">,
) {
  const document = await ctx.db.get(documentId);
  // Another Organisation's Document looks the same as a missing one.
  if (document === null || document.organisationId !== organisationId) {
    throw new ConvexError("Document not found");
  }
  return document;
}

function rejectionOf(document: Doc<"documents">) {
  const { rejection } = document;
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
 * One Document with its history, oldest event first, and its Field Values in
 * the order of its Form Version's Fields: top-level ones, and per List Field
 * its entries, each a Field Value per sub-Field.
 */
export const get = orgQuery({
  args: { documentId: v.id("documents") },
  handler: async (ctx, { documentId }) => {
    const document = await getDocument(ctx, ctx.organisationId, documentId);
    const { formId, formVersion: versionNumber } = document;
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
      .withIndex("by_documentId", (q) => q.eq("documentId", documentId))
      .take(5000);
    const topLevel = new Map(fieldValues.filter((f) => !f.list).map((f) => [f.key, f]));
    const inLists = new Map(
      fieldValues.flatMap((f) => (f.list ? [[`${f.list.key}[${f.list.entry}].${f.key}`, f]] : [])),
    );
    const listValues = await ctx.db
      .query("listValues")
      .withIndex("by_documentId", (q) => q.eq("documentId", documentId))
      .take(100);
    const events = await ctx.db
      .query("documentEvents")
      .withIndex("by_documentId", (q) => q.eq("documentId", documentId))
      .take(500);
    return {
      id: document._id,
      filename: document.filename,
      pageCount: document.pageCount,
      // Which pane the review screen shows; a Document from before kinds is a PDF.
      kind: kindOf(document),
      mimeType: mimeTypeOf(document),
      // Why Vink split the email this Document came from, when it was unsure.
      splitReason: document.splitReason ?? null,
      state: document.state,
      formName: form?.name ?? "",
      formVersion: document.formVersion ?? null,
      formId: document.formId ?? null,
      jevVerified: document.jevVerified ?? false,
      doesNotFit: document.doesNotFit ?? false,
      reviewThreshold: document.reviewThreshold ?? null,
      userTouched: document.userTouched ?? false,
      extractionError: document.extractionError ?? null,
      deliveries: await deliveriesOf(ctx, documentId),
      rejection: rejectionOf(document),
      dataDeleted: document.dataDeletedAt !== undefined,
      dataDeletedAt: document.dataDeletedAt ?? null,
      // The Admin who deleted it now; `null` when retention did, or nobody.
      dataDeletedBy:
        document.dataDeletedAt === undefined
          ? null
          : (events.findLast((e) => e.event === "deleted")?.byEmail ?? null),
      approval: document.approval
        ? { mode: document.approval.mode, by: document.approval.byEmail, at: document.approval.at }
        : null,
      needsReviewCount: needsReviewCount(fieldValues, listValues),
      history: events.map((e) => ({
        event: e.event,
        detail: e.detail ?? null,
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
 * A short-lived signed URL for a Document's PDF. A mutation, not a query, so a
 * cached result never hands out a URL that has already expired.
 */
export const pdfUrl = orgMutation({
  args: { documentId: v.id("documents") },
  handler: async (ctx, { documentId }) => {
    const document = await getDocument(ctx, ctx.organisationId, documentId);
    if (document.dataDeletedAt !== undefined) throw new ConvexError("The PDF was deleted");
    return await pdfStore.viewUrl(document.key, PDF_URL_SECONDS);
  },
});

/**
 * A short-lived signed URL for one attachment of an email Document, by its
 * place in the email's list (the stored email file names the same places). Only
 * the Document's own attachment keys are ever signed.
 */
export const attachmentUrl = orgMutation({
  args: { documentId: v.id("documents"), index: v.number() },
  handler: async (ctx, { documentId, index }) => {
    const document = await getDocument(ctx, ctx.organisationId, documentId);
    if (document.dataDeletedAt !== undefined) throw new ConvexError("The file was deleted");
    const key = document.attachmentKeys?.[index];
    if (key === undefined) throw new ConvexError("Attachment not found");
    return await pdfStore.viewUrl(key, PDF_URL_SECONDS);
  },
});

// The states with a tab in the Document list (No Form has its own list); Rejected is behind a filter.
const listedStates = [
  "extracting",
  "needs_review",
  "approved",
  "extraction_failed",
  "no_form",
  "rejected",
] as const;

/**
 * The Documents in one state, newest first. The Rejected list also holds the
 * Documents deleted after rejection, which keep their metadata.
 */
export const list = orgQuery({
  args: { state: documentState },
  handler: async (ctx, { state }) => {
    const inState = (s: typeof state) =>
      ctx.db
        .query("documents")
        .withIndex("by_organisationId_and_state", (q) =>
          q.eq("organisationId", ctx.organisationId).eq("state", s),
        )
        .order("desc")
        .take(200);
    const documents =
      state === "rejected"
        ? [...(await inState("rejected")), ...(await inState("deleted"))].sort(
            (a, b) => b._creationTime - a._creationTime,
          )
        : await inState(state);
    const counters = await ctx.db
      .query("documentCounts")
      .withIndex("by_organisationId_and_state", (q) =>
        q.eq("organisationId", ctx.organisationId),
      )
      .take(20);
    const counts = Object.fromEntries(
      listedStates.map((s) => [s, counters.find((c) => c.state === s)?.count ?? 0]),
    ) as Record<(typeof listedStates)[number], number>;
    return {
      counts,
      documents: await Promise.all(
        documents.map(async (document) => {
          const form = document.formId === undefined ? null : await ctx.db.get(document.formId);
          return {
            id: document._id,
            filename: document.filename,
            pageCount: document.pageCount,
            state: document.state,
            formName: form?.name ?? "",
            formVersion: document.formVersion ?? null,
            uploadedBy: document.uploaderEmail,
            uploadedAt: document._creationTime,
            rejection: rejectionOf(document),
            approvalMode: document.approval?.mode ?? null,
          };
        }),
      ),
    };
  },
});

/** Rows one backfill page reads. Far under a mutation's limits (~16k reads, ~8k writes). */
const BACKFILL_PAGE_SIZE = 500;

/**
 * The input model (ADR 0010, step 3), backfill step: gives every Document and
 * Form Proposal from before kinds its `kind: "pdf"` and `mimeType:
 * "application/pdf"`. Idempotent; it changes nothing else, so no totals move.
 * Run once per deployment, after the code that reads a missing kind as a PDF
 * is deployed. One command walks both tables to the end, one page per
 * mutation (a single mutation over a big table would roll back whole):
 *   npx convex run documents:backfillInputKind          (dev)
 *   npx convex run --prod documents:backfillInputKind   (prod)
 * Returns the total it filled per table. The check is a full second run: it
 * must return `{ documents: 0, formProposals: 0 }`. If a run stops half way,
 * run it again: pages already done find nothing to fill.
 *
 * TODO(narrow): once it ran on dev AND prod (a second run says 0 for both),
 * make `kind` and `mimeType` required on `documents` and `formProposals` in
 * schema.ts, drop the fallbacks in lib/inputLimits.ts (kindOf, mimeTypeOf) and
 * their callers, and remove these two functions.
 */
export const backfillInputKind = internalAction({
  args: { numItems: v.optional(v.number()) },
  handler: async (ctx, { numItems }): Promise<{ documents: number; formProposals: number }> => {
    const filled = { documents: 0, formProposals: 0 };
    for (const table of ["documents", "formProposals"] as const) {
      let cursor: string | null = null;
      for (;;) {
        const page: BackfillPage = await ctx.runMutation(internal.documents.backfillInputKindPage, {
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
    table: v.union(v.literal("documents"), v.literal("formProposals")),
    cursor: v.optional(v.union(v.string(), v.null())),
    numItems: v.optional(v.number()),
  },
  handler: async (ctx, { table, cursor, numItems }): Promise<BackfillPage> => {
    const paginationOpts = { cursor: cursor ?? null, numItems: numItems ?? BACKFILL_PAGE_SIZE };
    let filled = 0;
    if (table === "documents") {
      const { page, continueCursor, isDone } = await ctx.db.query("documents").paginate(paginationOpts);
      for (const document of page) {
        if (document.kind !== undefined && document.mimeType !== undefined) continue;
        await ctx.db.patch(document._id, {
          kind: document.kind ?? "pdf",
          mimeType: document.mimeType ?? PDF_MIME_TYPE,
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
