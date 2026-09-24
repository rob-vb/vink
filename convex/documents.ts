import { ConvexError, type Infer, v } from "convex/values";
import { PDFDocument } from "pdf-lib";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  internalMutation,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { orgAction, orgMutation, orgQuery } from "./lib/functions";
import { pdfStore } from "./lib/pdfStore";
import { documentState } from "./schema";

type DocumentState = Infer<typeof documentState>;

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
    await count(ctx, document.organisationId, "extracting", +1);
  },
});

async function count(
  ctx: MutationCtx,
  organisationId: Id<"organisations">,
  state: DocumentState,
  delta: number,
) {
  const counter = await ctx.db
    .query("documentCounts")
    .withIndex("by_organisationId_and_state", (q) =>
      q.eq("organisationId", organisationId).eq("state", state),
    )
    .unique();
  if (counter === null) {
    await ctx.db.insert("documentCounts", { organisationId, state, count: delta });
  } else {
    await ctx.db.patch(counter._id, { count: counter.count + delta });
  }
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

/** One Document with its history, oldest event first. */
export const get = orgQuery({
  args: { documentId: v.id("documents") },
  handler: async (ctx, { documentId }) => {
    const document = await getDocument(ctx, ctx.organisationId, documentId);
    const form = await ctx.db.get(document.formId);
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
      history: events.map((e) => ({ event: e.event, by: e.byEmail, at: e.at })),
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
    return await pdfStore.viewUrl(document.key, PDF_URL_SECONDS);
  },
});

// The states with a tab in the Document list.
const listedStates = ["extracting", "needs_review", "approved", "extraction_failed"] as const;

/** The Documents in one state, newest first. */
export const list = orgQuery({
  args: { state: documentState },
  handler: async (ctx, { state }) => {
    const documents = await ctx.db
      .query("documents")
      .withIndex("by_organisationId_and_state", (q) =>
        q.eq("organisationId", ctx.organisationId).eq("state", state),
      )
      .order("desc")
      .take(200);
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
          };
        }),
      ),
    };
  },
});
