// Reject, Reopen and Delete: ruling a Document unusable before Approval,
// undoing that, and (Admin only) removing its data outright.
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { moveTo } from "./lib/documentStates";
import { orgMutation } from "./lib/functions";
import { pdfStore } from "./lib/pdfStore";

async function ownDocument(
  ctx: MutationCtx,
  organisationId: Id<"organisations">,
  documentId: Id<"documents">,
) {
  const document = await ctx.db.get(documentId);
  if (document === null || document.organisationId !== organisationId) {
    throw new ConvexError("Document not found");
  }
  if (document.state === "approved") throw new ConvexError("This Document is approved");
  return document;
}

async function logged(
  ctx: MutationCtx,
  document: Doc<"documents">,
  userId: string,
  event: "rejected" | "reopened" | "deleted",
  detail?: string,
) {
  const identity = await ctx.auth.getUserIdentity();
  const who = { by: userId, byEmail: identity?.email?.toLowerCase() ?? "", at: Date.now() };
  await ctx.db.insert("documentEvents", {
    organisationId: document.organisationId,
    documentId: document._id,
    event,
    ...(detail ? { detail } : {}),
    ...who,
  });
  return who;
}

function requireRejected(document: Doc<"documents">) {
  if (document.state !== "rejected" || document.rejection === undefined) {
    throw new ConvexError("Only a Rejected Document can be reopened or deleted");
  }
  return document.rejection;
}

export const reject = orgMutation({
  args: { documentId: v.id("documents"), reason: v.optional(v.string()) },
  handler: async (ctx, { documentId, reason }) => {
    const document = await ownDocument(ctx, ctx.organisationId, documentId);
    if (document.state !== "needs_review" && document.state !== "extraction_failed") {
      throw new ConvexError("This Document can't be rejected now");
    }
    const text = reason?.trim() || null;
    const who = await logged(ctx, document, ctx.userId, "rejected", text ?? undefined);
    await ctx.db.patch(documentId, {
      rejection: { ...who, reason: text, priorState: document.state },
    });
    await moveTo(ctx, document, "rejected");
  },
});

/** Back to the state it was rejected from, values and corrections intact. */
export const reopen = orgMutation({
  args: { documentId: v.id("documents") },
  handler: async (ctx, { documentId }) => {
    const document = await ownDocument(ctx, ctx.organisationId, documentId);
    const { priorState } = requireRejected(document);
    if (document.dataDeletedAt !== undefined) {
      throw new ConvexError("This Document's PDF is gone, so it can't be reopened");
    }
    await ctx.db.patch(documentId, { rejection: undefined, userTouched: true });
    await moveTo(ctx, document, priorState);
    await logged(ctx, document, ctx.userId, "reopened");
  },
});

/** Deletes a Rejected Document's PDF, Reading and Field Values; its metadata and history stay. */
export const remove = orgMutation({
  role: "admin",
  args: { documentId: v.id("documents") },
  handler: async (ctx, { documentId }) => {
    const document = await ownDocument(ctx, ctx.organisationId, documentId);
    requireRejected(document);
    await deleteData(ctx, document);
    await moveTo(ctx, document, "deleted");
    await logged(ctx, document, ctx.userId, "deleted");
  },
});

/** Removes a Document's PDF from R2 and its Reading and Field Values. */
export async function deleteData(ctx: MutationCtx, document: Doc<"documents">) {
  if (document.dataDeletedAt === undefined) await pdfStore.remove(ctx, document.key);
  for (const table of ["readings", "fieldValues", "listValues"] as const) {
    const rows = await ctx.db
      .query(table)
      .withIndex("by_documentId", (q) => q.eq("documentId", document._id))
      .take(5000);
    for (const row of rows) await ctx.db.delete(row._id);
  }
  await ctx.db.patch(document._id, { dataDeletedAt: Date.now() });
}
