// Change Form: before Approval, move a Document to another Form, also out of
// No Form (ADR 0010). Its values and corrections for the old Form are dropped,
// and Match, Fill and Verify run again on the stored Reading (a full Extraction
// when there is none). Its Items were charged when it was accepted, so a move
// charges nothing.
import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { startExtraction } from "./extraction";
import { moveTo } from "./lib/documentStates";
import { orgMutation, orgQuery } from "./lib/functions";

async function changeable(
  ctx: QueryCtx,
  organisationId: Id<"organisations">,
  documentId: Id<"documents">,
) {
  const document = await ctx.db.get(documentId);
  if (document === null || document.organisationId !== organisationId) {
    throw new ConvexError("Document not found");
  }
  if (document.state === "approved") throw new ConvexError("This Document is approved");
  if (
    document.state !== "needs_review" &&
    document.state !== "extraction_failed" &&
    document.state !== "no_form"
  ) {
    throw new ConvexError("This Document's Form can't be changed now");
  }
  return document;
}

/** What Change Form would throw away: the number of corrected values. */
export const impact = orgQuery({
  args: { documentId: v.id("documents") },
  handler: async (ctx, { documentId }) => {
    await changeable(ctx, ctx.organisationId, documentId);
    const fieldValues = await ctx.db
      .query("fieldValues")
      .withIndex("by_documentId", (q) => q.eq("documentId", documentId))
      .take(5000);
    return { corrections: fieldValues.filter((f) => f.review?.state === "corrected").length };
  },
});

export const changeForm = orgMutation({
  args: { documentId: v.id("documents"), formId: v.id("forms") },
  handler: async (ctx, { documentId, formId }) => {
    const document = await changeable(ctx, ctx.organisationId, documentId);
    const form = await ctx.db.get(formId);
    if (form === null || form.organisationId !== ctx.organisationId) {
      throw new ConvexError("Form not found");
    }
    if (formId === document.formId) throw new ConvexError("The Document is already on this Form");
    const oldForm = document.formId === undefined ? null : await ctx.db.get(document.formId);

    for (const table of ["fieldValues", "listValues"] as const) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_documentId", (q) => q.eq("documentId", documentId))
        .take(5000);
      for (const row of rows) await ctx.db.delete(row._id);
    }
    await ctx.db.patch(documentId, {
      formId,
      formVersion: form.version,
      userTouched: true,
      doesNotFit: undefined,
      jevVerified: undefined,
      reviewThreshold: undefined,
      extractionError: undefined,
    });
    await moveTo(ctx, document, "extracting");
    const identity = await ctx.auth.getUserIdentity();
    await ctx.db.insert("documentEvents", {
      organisationId: ctx.organisationId,
      documentId,
      event: "form_changed",
      detail: `${oldForm?.name ?? "No Form"} → ${form.name}`,
      by: ctx.userId,
      byEmail: identity?.email?.toLowerCase() ?? "",
      at: Date.now(),
    });
    await startExtraction(ctx, documentId);
  },
});
