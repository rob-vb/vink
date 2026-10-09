// Retention (spec, Retention): a daily cleanup deletes data, R2 objects
// included, and keeps metadata, history and Delivery logs. It also deletes
// uploads that never became a Submission, and forgets contact-form rate limits.
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { moveTo } from "./lib/submissionStates";
import { pdfStore } from "./lib/pdfStore";
import { forgetOldContactRequests } from "./contact";
import { deleteProposal } from "./formProposals";
import { retentionDaysOf } from "./organisations";
import { deleteData } from "./rejection";

const DAY = 24 * 60 * 60 * 1000;
const NEVER_APPROVED_DAYS = 90;
const REJECTED_DAYS = 30;
const PROPOSAL_DAYS = 7;
const ORPHAN_UPLOAD_HOURS = 24;

// Per rule and Organisation in one run; a full batch runs the cleanup again.
const BATCH = 50;

async function logged(ctx: MutationCtx, submission: Doc<"submissions">, detail: string) {
  await ctx.db.insert("submissionEvents", {
    organisationId: submission.organisationId,
    submissionId: submission._id,
    event: "data_deleted",
    detail,
    by: "vink",
    byEmail: "Vink",
    at: Date.now(),
  });
}

async function cleanOrganisation(ctx: MutationCtx, organisation: Doc<"organisations">, now: number) {
  const organisationId: Id<"organisations"> = organisation._id;
  const days = retentionDaysOf(organisation);
  let full = false;

  // Approved: N days after the last successful Delivery (or the Approval, or
  // the last attempt when every Delivery failed).
  const sent = await ctx.db
    .query("submissions")
    .withIndex("by_organisationId_and_retentionClockAt", (q) =>
      q.eq("organisationId", organisationId).gt("retentionClockAt", 0).lt("retentionClockAt", now - days * DAY),
    )
    .take(BATCH);
  for (const submission of sent) {
    await deleteData(ctx, submission);
    await logged(ctx, submission, `Kept ${days} days after it was sent`);
  }
  full ||= sent.length === BATCH;

  // Never approved: 90 days after upload.
  for (const state of ["extracting", "needs_review", "extraction_failed", "no_form"] as const) {
    const stale = await ctx.db
      .query("submissions")
      .withIndex("by_organisationId_and_state", (q) =>
        q.eq("organisationId", organisationId).eq("state", state).lt("_creationTime", now - NEVER_APPROVED_DAYS * DAY),
      )
      .take(BATCH);
    for (const submission of stale) {
      await deleteData(ctx, submission);
      await moveTo(ctx, submission, "deleted");
      await logged(ctx, submission, `Not approved within ${NEVER_APPROVED_DAYS} days`);
    }
    full ||= stale.length === BATCH;
  }

  // Rejected: 30 days after Reject.
  const rejected = await ctx.db
    .query("submissions")
    .withIndex("by_organisationId_and_state", (q) =>
      q.eq("organisationId", organisationId).eq("state", "rejected"),
    )
    .take(500);
  const due = rejected
    .filter((d) => d.dataDeletedAt === undefined && d.rejection!.at < now - REJECTED_DAYS * DAY)
    .slice(0, BATCH);
  for (const submission of due) {
    await deleteData(ctx, submission);
    await logged(ctx, submission, `Rejected ${REJECTED_DAYS} days ago`);
  }
  full ||= due.length === BATCH;

  // Unsaved Form Proposals: 7 days.
  const proposals = await ctx.db
    .query("formProposals")
    .withIndex("by_organisationId", (q) =>
      q.eq("organisationId", organisationId).lt("_creationTime", now - PROPOSAL_DAYS * DAY),
    )
    .take(BATCH);
  for (const proposal of proposals) await deleteProposal(ctx, proposal);
  full ||= proposals.length === BATCH;

  return full;
}

/** Deletes uploaded PDFs that never became a Submission or a Form Proposal sample. */
async function cleanOrphanUploads(ctx: MutationCtx, now: number) {
  const orphans = await ctx.db
    .query("uploads")
    .withIndex("by_issuedAt", (q) => q.lt("issuedAt", now - ORPHAN_UPLOAD_HOURS * 60 * 60 * 1000))
    .take(BATCH);
  for (const upload of orphans) {
    await pdfStore.remove(ctx, upload.key);
    await ctx.db.delete(upload._id);
  }
  return orphans.length === BATCH;
}

/** The daily cleanup (see crons.ts). */
export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let more = await cleanOrphanUploads(ctx, now);
    more = (await forgetOldContactRequests(ctx, now)) || more;
    for (const organisation of await ctx.db.query("organisations").take(1000)) {
      more = (await cleanOrganisation(ctx, organisation, now)) || more;
    }
    if (more) await ctx.scheduler.runAfter(0, internal.retention.run, {});
  },
});
