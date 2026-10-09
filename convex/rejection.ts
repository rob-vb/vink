// Reject, Reopen and Delete: ruling a Submission unusable before Approval,
// undoing that, and (Admin only) removing any Submission's data outright.
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { moveTo } from "./lib/submissionStates";
import { orgMutation } from "./lib/functions";
import { removeSubmissionFiles } from "./lib/submissionFiles";

async function ownSubmission(
  ctx: MutationCtx,
  organisationId: Id<"organisations">,
  submissionId: Id<"submissions">,
) {
  const submission = await ctx.db.get(submissionId);
  if (submission === null || submission.organisationId !== organisationId) {
    throw new ConvexError("Submission not found");
  }
  if (submission.state === "approved") throw new ConvexError("This Submission is approved");
  return submission;
}

async function logged(
  ctx: MutationCtx,
  submission: Doc<"submissions">,
  userId: string,
  event: "rejected" | "reopened" | "deleted",
  detail?: string,
) {
  const identity = await ctx.auth.getUserIdentity();
  const who = { by: userId, byEmail: identity?.email?.toLowerCase() ?? "", at: Date.now() };
  await ctx.db.insert("submissionEvents", {
    organisationId: submission.organisationId,
    submissionId: submission._id,
    event,
    ...(detail ? { detail } : {}),
    ...who,
  });
  return who;
}

function requireRejected(submission: Doc<"submissions">) {
  if (submission.state !== "rejected" || submission.rejection === undefined) {
    throw new ConvexError("Only a Rejected Submission can be reopened");
  }
  return submission.rejection;
}

export const reject = orgMutation({
  args: { submissionId: v.id("submissions"), reason: v.optional(v.string()) },
  handler: async (ctx, { submissionId, reason }) => {
    const submission = await ownSubmission(ctx, ctx.organisationId, submissionId);
    if (
      submission.state !== "needs_review" &&
      submission.state !== "extraction_failed" &&
      submission.state !== "no_form"
    ) {
      throw new ConvexError("This Submission can't be rejected now");
    }
    const text = reason?.trim() || null;
    const who = await logged(ctx, submission, ctx.userId, "rejected", text ?? undefined);
    await ctx.db.patch(submissionId, {
      rejection: { ...who, reason: text, priorState: submission.state },
    });
    await moveTo(ctx, submission, "rejected");
  },
});

/** Back to the state it was rejected from, values and corrections intact. */
export const reopen = orgMutation({
  args: { submissionId: v.id("submissions") },
  handler: async (ctx, { submissionId }) => {
    const submission = await ownSubmission(ctx, ctx.organisationId, submissionId);
    const { priorState } = requireRejected(submission);
    if (submission.dataDeletedAt !== undefined) {
      throw new ConvexError("This Submission's PDF is gone, so it can't be reopened");
    }
    await ctx.db.patch(submissionId, { rejection: undefined, userTouched: true });
    await moveTo(ctx, submission, priorState);
    await logged(ctx, submission, ctx.userId, "reopened");
  },
});

/**
 * Delete now: removes any Submission's PDF, Reading and Field Values at once,
 * Approved included, and cancels its Deliveries not yet sent. The short record
 * stays: filename, uploader, approver, dates, history and Delivery status. An
 * Approved Submission stays Approved; any other becomes Deleted.
 */
export const remove = orgMutation({
  role: "admin",
  args: { submissionId: v.id("submissions") },
  handler: async (ctx, { submissionId }) => {
    const submission = await ctx.db.get(submissionId);
    if (submission === null || submission.organisationId !== ctx.organisationId) {
      throw new ConvexError("Submission not found");
    }
    if (submission.state === "deleted" || submission.dataDeletedAt !== undefined) {
      throw new ConvexError("This Submission's data was already deleted");
    }
    await deleteData(ctx, submission);
    if (submission.state !== "approved") await moveTo(ctx, submission, "deleted");
    await logged(ctx, submission, ctx.userId, "deleted");
  },
});

/**
 * Removes a Submission's PDF from R2, its Reading and Field Values, the Payload
 * its Deliveries carried and the receivers' response bodies. Deliveries not
 * yet sent are cancelled, so the data never leaves afterwards. Metadata,
 * history and the Delivery log (times and statuses) stay.
 */
export async function deleteData(ctx: MutationCtx, submission: Doc<"submissions">) {
  if (submission.dataDeletedAt === undefined) await removeSubmissionFiles(ctx, submission);
  for (const table of ["readings", "fieldValues", "listValues"] as const) {
    const rows = await ctx.db
      .query(table)
      .withIndex("by_submissionId", (q) => q.eq("submissionId", submission._id))
      .take(5000);
    for (const row of rows) await ctx.db.delete(row._id);
  }
  const deliveries = await ctx.db
    .query("deliveries")
    .withIndex("by_submissionId", (q) => q.eq("submissionId", submission._id))
    .take(100);
  for (const delivery of deliveries) {
    const open = delivery.state === "pending" || delivery.state === "retrying";
    await ctx.db.patch(delivery._id, {
      envelope: undefined,
      attempts: delivery.attempts.map((attempt) => ({ ...attempt, body: null })),
      ...(open && {
        state: "failed" as const,
        failureReason: "Cancelled: the Submission was deleted",
        nextAttemptAt: undefined,
      }),
    });
  }
  await ctx.db.patch(submission._id, { dataDeletedAt: Date.now(), retentionClockAt: undefined });
}
