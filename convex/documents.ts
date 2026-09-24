import { ConvexError, v } from "convex/values";
import { PDFDocument } from "pdf-lib";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type QueryCtx } from "./_generated/server";
import { startExtraction } from "./extraction";
import { countIn } from "./lib/documentStates";
import { orgAction, orgMutation, orgQuery } from "./lib/functions";
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

/** Step 1 of an upload: where the browser PUTs the PDF. */
export const generateUploadUrl = orgMutation({
  args: {},
  handler: async (ctx) => {
    const key = `${ctx.organisationId}/${crypto.randomUUID()}`;
    return { key, url: await pdfStore.uploadUrl(key) };
  },
});

/** Step 2 of an upload: turns the uploaded PDF into a Document of a Form. */
export const create = orgAction({
  args: { formId: v.id("forms"), key: v.string(), filename: v.string() },
  handler: async (ctx, { formId, key, filename }) => {
    // The key must be one issued to this Organisation by generateUploadUrl.
    if (!key.startsWith(`${ctx.organisationId}/`)) {
      throw new ConvexError("Forbidden");
    }
    const bytes = await pdfStore.read(key);
    if (bytes === null) {
      throw new ConvexError("The upload didn't arrive. Try again.");
    }
    try {
      const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true }).catch(
        () => {
          throw new ConvexError("This file isn't a PDF DocuHelper can read.");
        },
      );
      if (pdf.getPageCount() > MAX_PAGES) {
        throw new ConvexError(
          `This PDF has ${pdf.getPageCount()} pages. DocuHelper reads up to ${MAX_PAGES} pages per Document.`,
        );
      }
      const identity = (await ctx.auth.getUserIdentity())!;
      await ctx.runMutation(internal.documents.insert, {
        organisationId: ctx.organisationId,
        formId,
        key,
        filename,
        pageCount: pdf.getPageCount(),
        uploadedBy: ctx.userId,
        uploaderEmail: identity.email?.toLowerCase() ?? "",
      });
    } catch (error) {
      // A refused upload leaves nothing behind.
      await pdfStore.remove(ctx, key);
      throw error;
    }
  },
});

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
  handler: async (ctx, { formId, ...document }) => {
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
    await ctx.db.insert("documentEvents", {
      organisationId: document.organisationId,
      documentId,
      event: "uploaded",
      by: document.uploadedBy,
      byEmail: document.uploaderEmail,
      at: Date.now(),
    });
    await countIn(ctx, document.organisationId, "extracting");
    await startExtraction(ctx, documentId);
  },
});

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
      rejection: rejectionOf(document),
      dataDeleted: document.dataDeletedAt !== undefined,
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
          };
        }),
      ),
    };
  },
});
