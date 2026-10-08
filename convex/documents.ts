import { ConvexError, v } from "convex/values";
import { PDFDocument } from "pdf-lib";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  type ActionCtx,
  internalMutation,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { deliveriesOf } from "./deliveries";
import { startExtraction } from "./extraction";
import { countIn } from "./lib/documentStates";
import { orgAction, orgMutation, orgQuery } from "./lib/functions";
import { chargeItems } from "./items";
import { MAX_PDF_BYTES, PDF_TOO_LARGE } from "./lib/pdfLimits";
import { pdfStore } from "./lib/pdfStore";
import type { FlatField } from "./lib/pipeline";
import {
  fieldValueNeedsReview,
  listNeedsReview,
  listReasons,
  needsReviewCount,
} from "./lib/reviewState";
import { documentState } from "./schema";

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
  checkIssued(organisationId, key);
  return await checkPdf(ctx, key);
}

/** The key must be one issued to this Organisation by generateUploadUrl. */
function checkIssued(organisationId: Id<"organisations">, key: string) {
  if (!key.startsWith(`${organisationId}/`)) {
    throw new ConvexError("Forbidden");
  }
}

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
  } catch (error) {
    // A refused upload leaves nothing behind.
    await pdfStore.remove(ctx, key);
    throw error;
  }
}

/** Step 2 of an upload: turns the uploaded PDF into a Document of a Form. */
export const create = orgAction({
  args: { formId: v.id("forms"), key: v.string(), filename: v.string() },
  handler: async (ctx, { formId, key, filename }) => {
    checkIssued(ctx.organisationId, key);
    const identity = (await ctx.auth.getUserIdentity())!;
    await acceptPdf(ctx, {
      organisationId: ctx.organisationId,
      formId,
      key,
      filename,
      uploadedBy: ctx.userId,
      uploaderEmail: identity.email?.toLowerCase() ?? "",
    });
  },
});

/**
 * The one way a stored PDF becomes a Document of a Form, for every way in
 * (upload, Intake Address, public API): checkPdf, then charge its Items and
 * create the Document in one transaction. A refused PDF creates nothing,
 * charges nothing and is removed from storage; the refusal is thrown.
 */
export async function acceptPdf(
  ctx: ActionCtx,
  document: {
    organisationId: Id<"organisations">;
    formId: Id<"forms">;
    key: string;
    filename: string;
    uploadedBy: string;
    uploaderEmail: string;
  },
): Promise<Id<"documents">> {
  const pageCount = await checkPdf(ctx, document.key);
  try {
    return await ctx.runMutation(internal.documents.insert, { ...document, pageCount });
  } catch (error) {
    await pdfStore.remove(ctx, document.key);
    throw error;
  }
}

export const insert = internalMutation({
  args: {
    organisationId: v.id("organisations"),
    formId: v.id("forms"),
    key: v.string(),
    filename: v.string(),
    pageCount: v.number(),
    uploadedBy: v.string(),
    uploaderEmail: v.string(),
  },
  handler: async (ctx, args) => {
    await chargeItems(ctx, args.organisationId, args.pageCount);
    return await createDocument(ctx, args);
  },
});

/**
 * A Document of a Form at its current Form Version, in Extracting. With a
 * `reading`, the Extraction starts from it and never reads the PDF.
 */
export async function createDocument(
  ctx: MutationCtx,
  {
    formId,
    reading,
    ...document
  }: {
    organisationId: Id<"organisations">;
    formId: Id<"forms">;
    key: string;
    filename: string;
    pageCount: number;
    uploadedBy: string;
    uploaderEmail: string;
    reading?: { json: string; textLayer: Array<{ page: number; text: string }> };
  },
) {
  const form = await ctx.db.get(formId);
  if (form === null || form.organisationId !== document.organisationId) {
    throw new ConvexError("Form not found");
  }
  const documentId = await ctx.db.insert("documents", {
    ...document,
    formId,
    formVersion: form.version,
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
    const form = await ctx.db.get(document.formId);
    const formVersion = await ctx.db
      .query("formVersions")
      .withIndex("by_formId_and_number", (q) =>
        q.eq("formId", document.formId).eq("number", document.formVersion),
      )
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
      state: document.state,
      formName: form?.name ?? "",
      formVersion: document.formVersion,
      formId: document.formId,
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

// The states with a tab in the Document list; Rejected is behind a filter.
const listedStates = [
  "extracting",
  "needs_review",
  "approved",
  "extraction_failed",
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
      .take(10);
    const counts = Object.fromEntries(
      listedStates.map((s) => [s, counters.find((c) => c.state === s)?.count ?? 0]),
    ) as Record<(typeof listedStates)[number], number>;
    return {
      counts,
      documents: await Promise.all(
        documents.map(async (document) => {
          const form = await ctx.db.get(document.formId);
          return {
            id: document._id,
            filename: document.filename,
            pageCount: document.pageCount,
            state: document.state,
            formName: form?.name ?? "",
            formVersion: document.formVersion,
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
