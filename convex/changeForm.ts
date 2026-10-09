// Change Form: before Approval, move a Submission to another Form, also out of
// No Form (ADR 0010). Its values and corrections for the old Form are dropped,
// and Match, Fill and Verify run again on the stored Reading (a full Extraction
// when there is none). Its Items were charged when it was accepted, so a move
// charges nothing.
import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { startExtraction } from "./extraction";
import { moveTo } from "./lib/submissionStates";
import { orgMutation, orgQuery } from "./lib/functions";

async function changeable(
  ctx: QueryCtx,
  organisationId: Id<"organisations">,
  submissionId: Id<"submissions">,
) {
  const submission = await ctx.db.get(submissionId);
  if (submission === null || submission.organisationId !== organisationId) {
    throw new ConvexError("Submission not found");
  }
  if (submission.state === "approved") throw new ConvexError("This Submission is approved");
  if (
    submission.state !== "needs_review" &&
    submission.state !== "extraction_failed" &&
    submission.state !== "no_form"
  ) {
    throw new ConvexError("This Submission's Form can't be changed now");
  }
  return submission;
}

/** What Change Form would throw away: the number of corrected values. */
export const impact = orgQuery({
  args: { submissionId: v.id("submissions") },
  handler: async (ctx, { submissionId }) => {
    await changeable(ctx, ctx.organisationId, submissionId);
    const fieldValues = await ctx.db
      .query("fieldValues")
      .withIndex("by_submissionId", (q) => q.eq("submissionId", submissionId))
      .take(5000);
    return { corrections: fieldValues.filter((f) => f.review?.state === "corrected").length };
  },
});

export const changeForm = orgMutation({
  args: { submissionId: v.id("submissions"), formId: v.id("forms") },
  handler: async (ctx, { submissionId, formId }) => {
    const submission = await changeable(ctx, ctx.organisationId, submissionId);
    const form = await ctx.db.get(formId);
    if (form === null || form.organisationId !== ctx.organisationId) {
      throw new ConvexError("Form not found");
    }
    if (formId === submission.formId) throw new ConvexError("The Submission is already on this Form");
    const oldForm = submission.formId === undefined ? null : await ctx.db.get(submission.formId);

    for (const table of ["fieldValues", "listValues"] as const) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_submissionId", (q) => q.eq("submissionId", submissionId))
        .take(5000);
      for (const row of rows) await ctx.db.delete(row._id);
    }
    await ctx.db.patch(submissionId, {
      formId,
      formVersion: form.version,
      userTouched: true,
      doesNotFit: undefined,
      jevVerified: undefined,
      reviewThreshold: undefined,
      extractionError: undefined,
    });
    await moveTo(ctx, submission, "extracting");
    const identity = await ctx.auth.getUserIdentity();
    await ctx.db.insert("submissionEvents", {
      organisationId: ctx.organisationId,
      submissionId,
      event: "form_changed",
      detail: `${oldForm?.name ?? "No Form"} → ${form.name}`,
      info: { code: "form_changed", from: oldForm?.name ?? null, to: form.name },
      by: ctx.userId,
      byEmail: identity?.email?.toLowerCase() ?? "",
      at: Date.now(),
    });
    await startExtraction(ctx, submissionId);
  },
});
