// Delivery (spec, Payload and Delivery): after Approval, one Delivery per
// attached Integration sends the envelope through the adapter of its kind
// (lib/integrationAdapters.ts), with the Integration's current configuration
// at every attempt.
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { removeIntegration } from "./integrations";
import { MAX_ATTEMPTS, nextAttemptAt } from "./lib/backoff";
import { refreshTokenKeeper, sendAlone } from "./lib/accounts";
import { submissionPayload } from "./lib/submissionPayload";
import { orgMutation, orgQuery } from "./lib/functions";
import { formOf } from "./lib/submissionForm";
import { kindOf, sendTo } from "./lib/integrationAdapters";
import { envelopeOf } from "./lib/payload";

// What the attempt log keeps of a response body.
const BODY_LOGGED = 500;

// How long an attempt waits (plus up to as long again) while another send writes to the same sheet.
const BUSY_WAIT_MS = 5_000;

/**
 * Creates a Delivery for every Integration attached to the Submission's Form
 * right now, freezing the envelope, and sends each. None when nothing is attached.
 */
export async function createDeliveries(ctx: MutationCtx, submission: Doc<"submissions">) {
  const { formId, formVersion } = formOf(submission);
  const links = await ctx.db
    .query("formIntegrations")
    .withIndex("by_formId", (q) => q.eq("formId", formId))
    .take(100);
  const approval = submission.approval!;
  if (links.length === 0) {
    // Nothing to send: the retention clock starts at Approval.
    await ctx.db.patch(submission._id, { retentionClockAt: approval.at });
    return;
  }
  const data = await submissionPayload(ctx, submission);
  for (const link of links) {
    const integration = (await ctx.db.get(link.integrationId))!;
    const deliveryId = `dlv_${crypto.randomUUID()}`;
    const envelope = envelopeOf({
      deliveryId,
      test: false,
      submission: { id: submission._id, filename: submission.filename, uploadedAt: submission._creationTime },
      form: { id: formId, version: formVersion },
      approval: { mode: approval.mode, by: approval.by, at: approval.at },
      data,
    });
    const id = await ctx.db.insert("deliveries", {
      organisationId: submission.organisationId,
      submissionId: submission._id,
      integrationId: integration._id,
      integrationName: integration.name,
      deliveryId,
      envelope: JSON.stringify(envelope),
      state: "pending",
      attempts: [],
    });
    await ctx.scheduler.runAfter(0, internal.deliveries.attempt, { id });
  }
}

/** What one attempt sends, with the Integration's configuration as it is now. */
export const attemptInput = internalQuery({
  args: { id: v.id("deliveries") },
  handler: async (ctx, { id }) => {
    const delivery = await ctx.db.get(id);
    if (delivery === null || delivery.envelope === undefined) return null;
    if (delivery.state !== "pending" && delivery.state !== "retrying") return null;
    const integration = await ctx.db.get(delivery.integrationId);
    if (integration === null) return null;
    const submission = await ctx.db.get(delivery.submissionId);
    return { envelope: delivery.envelope, integration, approverEmail: submission?.approval?.byEmail ?? null };
  },
});

// An adapter's Outcome (lib/integrationAdapters.ts).
const outcome = v.union(
  v.object({ kind: v.literal("delivered") }),
  v.object({ kind: v.literal("retry"), reason: v.string(), retryAfter: v.union(v.string(), v.null()) }),
  v.object({
    kind: v.literal("failed"),
    reason: v.string(),
    cause: v.optional(v.union(v.literal("access_expired"), v.literal("gone"))),
  }),
);

export const attempt = internalAction({
  args: { id: v.id("deliveries") },
  handler: async (ctx, { id }) => {
    const input = await ctx.runQuery(internal.deliveries.attemptInput, { id });
    if (input === null) return;
    const at = Date.now();
    const sent = await sendAlone(ctx, input.integration, () =>
      sendTo(input.integration, JSON.parse(input.envelope), {
        approverEmail: input.approverEmail,
        keepRefreshToken: refreshTokenKeeper(ctx, input.integration),
      }),
    );
    if (sent === "busy") {
      // Another send is writing to the same sheet: this one goes after it, not counted as an attempt.
      await ctx.scheduler.runAfter(BUSY_WAIT_MS + Math.random() * BUSY_WAIT_MS, internal.deliveries.attempt, { id });
      return;
    }
    await ctx.runMutation(internal.deliveries.recordAttempt, {
      id,
      attempt: {
        at,
        status: sent.status,
        body: sent.body === null ? null : sent.body.slice(0, BODY_LOGGED),
        error: sent.error,
      },
      outcome: sent.outcome,
    });
  },
});

export const recordAttempt = internalMutation({
  args: {
    id: v.id("deliveries"),
    attempt: v.object({
      at: v.number(),
      status: v.union(v.number(), v.null()),
      body: v.union(v.string(), v.null()),
      error: v.union(v.string(), v.null()),
    }),
    outcome,
  },
  handler: async (ctx, { id, attempt, outcome }) => {
    const delivery = (await ctx.db.get(id))!;
    // Settled meanwhile (e.g. its Integration was removed, or its Submission
    // deleted): keep the log only, and no response body once the data is gone.
    if (delivery.envelope === undefined) attempt = { ...attempt, body: null };
    const attempts = [...delivery.attempts, attempt];
    if (delivery.state !== "pending" && delivery.state !== "retrying") {
      await ctx.db.patch(id, { attempts });
      return;
    }
    if (outcome.kind === "delivered") {
      await ctx.db.patch(id, { attempts, state: "delivered", nextAttemptAt: undefined });
      // The retention clock runs from the last successful Delivery.
      const submission = await ctx.db.get(delivery.submissionId);
      if (submission && submission.dataDeletedAt === undefined) {
        await ctx.db.patch(submission._id, {
          retentionClockAt: Math.max(submission.retentionClockAt ?? 0, attempt.at),
        });
      }
      return;
    }
    const inSeries = attempts.length - (delivery.seriesStart ?? 0);
    const next =
      outcome.kind === "retry" ? nextAttemptAt(inSeries, outcome.retryAfter, attempt.at) : null;
    if (outcome.kind === "retry" && next !== null) {
      await ctx.db.patch(id, {
        attempts,
        state: "retrying",
        failureReason: outcome.reason,
        nextAttemptAt: next,
      });
      await ctx.scheduler.runAt(next, internal.deliveries.attempt, { id });
      return;
    }
    if (outcome.kind === "failed" && outcome.cause === "gone" && (await endSubscription(ctx, delivery, attempts))) {
      return;
    }
    const reason =
      outcome.kind === "retry"
        ? `Gave up after ${MAX_ATTEMPTS} attempts: ${outcome.reason.replace(/^The/, "the")}`
        : outcome.reason;
    await ctx.db.patch(id, { attempts, state: "failed", failureReason: reason, nextAttemptAt: undefined });
    if (outcome.kind === "failed" && outcome.cause === "access_expired") {
      await markNeedsReconnect(ctx, delivery.integrationId);
    }
    await notifyFailed(ctx, delivery);
    await startClockIfAllFailed(ctx, delivery.submissionId);
  },
});

/**
 * A Subscription's receiver answered 410 Gone: the platform has ended it, so
 * Vink ends the Subscription and removes its Webhook, as an unsubscribe does.
 * The Delivery fails without a notice: nothing is wrong for an Admin to fix.
 * False for an Admin's own Webhook, which fails as any refusal.
 */
async function endSubscription(ctx: MutationCtx, delivery: Doc<"deliveries">, attempts: Doc<"deliveries">["attempts"]) {
  const subscription = await ctx.db
    .query("subscriptions")
    .withIndex("by_integrationId", (q) => q.eq("integrationId", delivery.integrationId))
    .unique();
  if (subscription === null) return false;
  await ctx.db.patch(delivery._id, {
    attempts,
    state: "failed",
    failureReason: "The receiver answered 410 Gone: the Subscription ended",
    integrationRemoved: true,
    nextAttemptAt: undefined,
  });
  await removeIntegration(ctx, delivery.integrationId);
  await startClockIfAllFailed(ctx, delivery.submissionId);
  return true;
}

/** The Integration's connected account no longer lets Vink in: it shows as needing reconnecting. */
async function markNeedsReconnect(ctx: MutationCtx, integrationId: Id<"integrations">) {
  const integration = await ctx.db.get(integrationId);
  if (integration === null || kindOf(integration) === "webhook") return;
  await ctx.db.patch(integrationId, { needsReconnect: true });
}

/**
 * When every Delivery of a Submission has ended failed, its retention clock
 * starts at the last attempt, so its data isn't kept forever. A later
 * successful re-send moves the clock on.
 */
async function startClockIfAllFailed(ctx: MutationCtx, submissionId: Id<"submissions">) {
  const submission = await ctx.db.get(submissionId);
  if (submission === null || submission.dataDeletedAt !== undefined) return;
  const deliveries = await ctx.db
    .query("deliveries")
    .withIndex("by_submissionId", (q) => q.eq("submissionId", submissionId))
    .take(100);
  if (deliveries.some((d) => d.state !== "failed")) return;
  const lastAttempt = Math.max(0, ...deliveries.flatMap((d) => d.attempts.map((a) => a.at)));
  await ctx.db.patch(submissionId, {
    retentionClockAt: Math.max(submission.retentionClockAt ?? 0, lastAttempt || Date.now()),
  });
}

async function notifyFailed(ctx: MutationCtx, delivery: Doc<"deliveries">) {
  const submission = await ctx.db.get(delivery.submissionId);
  await ctx.db.insert("notifications", {
    organisationId: delivery.organisationId,
    text: `${submission?.filename ?? "A Submission"} couldn't be delivered to ${delivery.integrationName}`,
    submissionId: delivery.submissionId,
    at: Date.now(),
    readBy: [],
  });
}

/** Sends a failed Delivery again: a new attempt-series, same `deliveryId`, current configuration. */
export const resend = orgMutation({
  role: "admin",
  args: { id: v.id("deliveries") },
  handler: async (ctx, { id }) => {
    const delivery = await ctx.db.get(id);
    if (delivery === null || delivery.organisationId !== ctx.organisationId) {
      throw new ConvexError("Delivery not found");
    }
    if (delivery.integrationRemoved) {
      throw new ConvexError("Integration removed: this Delivery can't be sent again");
    }
    if (delivery.state !== "failed") throw new ConvexError("Only a failed Delivery can be sent again");
    if (delivery.envelope === undefined) throw new ConvexError("This Submission's data was deleted");
    await ctx.db.patch(id, {
      state: "pending",
      failureReason: undefined,
      seriesStart: delivery.attempts.length,
    });
    await ctx.scheduler.runAfter(0, internal.deliveries.attempt, { id });
  },
});

/**
 * Fails an Integration's open Deliveries with "Integration removed" (all of
 * them, or only those of one Form's Submissions when it is detached from it).
 */
export async function failOpenDeliveries(
  ctx: MutationCtx,
  integrationId: Id<"integrations">,
  formId?: Id<"forms">,
) {
  const deliveries = await ctx.db
    .query("deliveries")
    .withIndex("by_integrationId", (q) => q.eq("integrationId", integrationId))
    .take(1000);
  for (const delivery of deliveries) {
    if (delivery.state !== "pending" && delivery.state !== "retrying") continue;
    if (formId !== undefined) {
      const submission = await ctx.db.get(delivery.submissionId);
      if (submission?.formId !== formId) continue;
    }
    await ctx.db.patch(delivery._id, {
      state: "failed",
      failureReason: "Integration removed",
      integrationRemoved: true,
      nextAttemptAt: undefined,
    });
    await startClockIfAllFailed(ctx, delivery.submissionId);
  }
}

function viewOf(delivery: Doc<"deliveries">) {
  return {
    id: delivery._id,
    deliveryId: delivery.deliveryId,
    integrationName: delivery.integrationName,
    state: delivery.state,
    failureReason: delivery.failureReason ?? null,
    nextAttemptAt: delivery.nextAttemptAt ?? null,
    canResend: delivery.state === "failed" && !delivery.integrationRemoved && delivery.envelope !== undefined,
    attempts: delivery.attempts,
  };
}

/** A Submission's Deliveries, oldest first. */
export async function deliveriesOf(ctx: QueryCtx, submissionId: Id<"submissions">) {
  const deliveries = await ctx.db
    .query("deliveries")
    .withIndex("by_submissionId", (q) => q.eq("submissionId", submissionId))
    .take(100);
  return deliveries.map(viewOf);
}

/** An Integration's Deliveries, newest first, with the Submission each carried. */
export const forIntegration = orgQuery({
  role: "admin",
  args: { integrationId: v.id("integrations") },
  handler: async (ctx, { integrationId }) => {
    const integration = await ctx.db.get(integrationId);
    if (integration === null || integration.organisationId !== ctx.organisationId) {
      throw new ConvexError("Integration not found");
    }
    const deliveries = await ctx.db
      .query("deliveries")
      .withIndex("by_integrationId", (q) => q.eq("integrationId", integrationId))
      .order("desc")
      .take(50);
    return await Promise.all(
      deliveries.map(async (delivery) => {
        const submission = await ctx.db.get(delivery.submissionId);
        return {
          ...viewOf(delivery),
          submission: { id: delivery.submissionId, filename: submission?.filename ?? "" },
        };
      }),
    );
  },
});
