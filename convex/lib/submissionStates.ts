import type { Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { submissionState } from "../schema";

export type SubmissionState = Infer<typeof submissionState>;

/** Adds a new Submission to its state's count. */
export async function countIn(
  ctx: MutationCtx,
  organisationId: Id<"organisations">,
  state: SubmissionState,
) {
  await count(ctx, organisationId, state, +1);
}

/** Moves a Submission to another state, keeping the Submission list's counts in step. */
export async function moveTo(ctx: MutationCtx, submission: Doc<"submissions">, state: SubmissionState) {
  await ctx.db.patch(submission._id, { state });
  await count(ctx, submission.organisationId, submission.state, -1);
  await count(ctx, submission.organisationId, state, +1);
}

async function count(
  ctx: MutationCtx,
  organisationId: Id<"organisations">,
  state: SubmissionState,
  delta: number,
) {
  const counter = await ctx.db
    .query("submissionCounts")
    .withIndex("by_organisationId_and_state", (q) =>
      q.eq("organisationId", organisationId).eq("state", state),
    )
    .unique();
  if (counter === null) {
    await ctx.db.insert("submissionCounts", { organisationId, state, count: delta });
  } else {
    await ctx.db.patch(counter._id, { count: counter.count + delta });
  }
}
