// GET /v1/submissions/{id}: a Submission's state and, only after Approval, its
// Payload in the envelope every Webhook gets. Before Approval nothing of its
// Field Values is in the answer, so nothing leaves Vink unapproved.
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalQuery } from "../_generated/server";
import { formOf } from "../lib/submissionForm";
import { submissionPayload } from "../lib/submissionPayload";
import type { SubmissionState } from "../lib/submissionStates";
import { envelopeOf } from "../lib/payload";
import { apiError, apiJson } from "./respond";
import { type ApiRoute, route } from "./router";

// The states on the wire (openapi/submissionRead.ts submissions them).
const wireState: Record<SubmissionState, string> = {
  extracting: "processing",
  needs_review: "needs_review",
  approved: "approved",
  extraction_failed: "failed",
  no_form: "no_form",
  rejected: "rejected",
  deleted: "deleted",
};

const iso = (ms: number) => new Date(ms).toISOString();

/** The answer for one of the Organisation's Submissions; null for no such Submission. */
export const read = internalQuery({
  args: { organisationId: v.id("organisations"), submissionId: v.string() },
  handler: async (ctx, { organisationId, submissionId: givenId }) => {
    const submissionId = ctx.db.normalizeId("submissions", givenId);
    const submission = submissionId && (await ctx.db.get(submissionId));
    if (!submission || submission.organisationId !== organisationId) return null;
    const { approval } = submission;
    const sendable = submission.state === "approved" && approval !== undefined && submission.dataDeletedAt === undefined;
    return {
      id: submission._id,
      form_id: submission.formId ?? null,
      state: wireState[submission.state],
      filename: submission.filename,
      uploaded_at: iso(submission._creationTime),
      data_deleted_at: submission.dataDeletedAt === undefined ? null : iso(submission.dataDeletedAt),
      payload: sendable
        ? envelopeOf({
            // Not a Delivery: one id per Submission, the same on every read.
            deliveryId: `sub_${submission._id}`,
            test: false,
            submission: { id: submission._id, filename: submission.filename, uploadedAt: submission._creationTime },
            form: { id: formOf(submission).formId, version: formOf(submission).formVersion },
            approval: { mode: approval.mode, by: approval.by, at: approval.at },
            data: await submissionPayload(ctx, submission),
          })
        : null,
    };
  },
});

export const submissionReadRoutes: ApiRoute[] = [
  route("GET", "/v1/submissions/{id}", async (ctx, _request, { caller, params }) => {
    const submission = await ctx.runQuery(internal.publicApi.submissionRead.read, {
      organisationId: caller.organisationId,
      submissionId: params.id,
    });
    if (submission === null) return apiError(404, "not_found", "There's no Submission with that id in your Organisation.");
    return apiJson(submission);
  }),
];
