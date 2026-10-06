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
import { MAX_ATTEMPTS, nextAttemptAt } from "./lib/backoff";
import { refreshTokenKeeper, sendAlone } from "./lib/accounts";
import { documentPayload } from "./lib/documentPayload";
import { orgMutation, orgQuery } from "./lib/functions";
import { kindOf, sendTo } from "./lib/integrationAdapters";
import { envelopeOf } from "./lib/payload";

// What the attempt log keeps of a response body.
const BODY_LOGGED = 500;

// How long an attempt waits (plus up to as long again) while another send writes to the same sheet.
const BUSY_WAIT_MS = 5_000;

/**
 * Creates a Delivery for every Integration attached to the Document's Form
 * right now, freezing the envelope, and sends each. None when nothing is attached.
 */
export async function createDeliveries(ctx: MutationCtx, document: Doc<"documents">) {
  const links = await ctx.db
    .query("formIntegrations")
    .withIndex("by_formId", (q) => q.eq("formId", document.formId))
    .take(100);
  const approval = document.approval!;
  if (links.length === 0) {
    // Nothing to send: the retention clock starts at Approval.
    await ctx.db.patch(document._id, { retentionClockAt: approval.at });
    return;
  }
  const data = await documentPayload(ctx, document);
  for (const link of links) {
    const integration = (await ctx.db.get(link.integrationId))!;
    const deliveryId = `dlv_${crypto.randomUUID()}`;
    const envelope = envelopeOf({
      deliveryId,
      test: false,
      document: { id: document._id, filename: document.filename, uploadedAt: document._creationTime },
      form: { id: document.formId, version: document.formVersion },
      approval: { mode: approval.mode, by: approval.by, at: approval.at },
      data,
    });
    const id = await ctx.db.insert("deliveries", {
      organisationId: document.organisationId,
      documentId: document._id,
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
    const document = await ctx.db.get(delivery.documentId);
    return { envelope: delivery.envelope, integration, approverEmail: document?.approval?.byEmail ?? null };
  },
});

// An adapter's Outcome (lib/integrationAdapters.ts).
const outcome = v.union(
  v.object({ kind: v.literal("delivered") }),
  v.object({ kind: v.literal("retry"), reason: v.string(), retryAfter: v.union(v.string(), v.null()) }),
  v.object({
    kind: v.literal("failed"),
    reason: v.string(),
    cause: v.optional(v.literal("access_expired")),
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
    // Settled meanwhile (e.g. its Integration was removed, or its Document
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
      const document = await ctx.db.get(delivery.documentId);
      if (document && document.dataDeletedAt === undefined) {
        await ctx.db.patch(document._id, {
          retentionClockAt: Math.max(document.retentionClockAt ?? 0, attempt.at),
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
    const reason =
      outcome.kind === "retry"
        ? `Gave up after ${MAX_ATTEMPTS} attempts: ${outcome.reason.replace(/^The/, "the")}`
        : outcome.reason;
    await ctx.db.patch(id, { attempts, state: "failed", failureReason: reason, nextAttemptAt: undefined });
    if (outcome.kind === "failed" && outcome.cause === "access_expired") {
      await markNeedsReconnect(ctx, delivery.integrationId);
    }
    await notifyFailed(ctx, delivery);
    await startClockIfAllFailed(ctx, delivery.documentId);
  },
});

/** The Integration's connected account no longer lets Vink in: it shows as needing reconnecting. */
async function markNeedsReconnect(ctx: MutationCtx, integrationId: Id<"integrations">) {
  const integration = await ctx.db.get(integrationId);
  if (integration === null || kindOf(integration) === "webhook") return;
  await ctx.db.patch(integrationId, { needsReconnect: true });
}

/**
 * When every Delivery of a Document has ended failed, its retention clock
 * starts at the last attempt, so its data isn't kept forever. A later
 * successful re-send moves the clock on.
 */
async function startClockIfAllFailed(ctx: MutationCtx, documentId: Id<"documents">) {
  const document = await ctx.db.get(documentId);
  if (document === null || document.dataDeletedAt !== undefined) return;
  const deliveries = await ctx.db
    .query("deliveries")
    .withIndex("by_documentId", (q) => q.eq("documentId", documentId))
    .take(100);
  if (deliveries.some((d) => d.state !== "failed")) return;
  const lastAttempt = Math.max(0, ...deliveries.flatMap((d) => d.attempts.map((a) => a.at)));
  await ctx.db.patch(documentId, {
    retentionClockAt: Math.max(document.retentionClockAt ?? 0, lastAttempt || Date.now()),
  });
}

async function notifyFailed(ctx: MutationCtx, delivery: Doc<"deliveries">) {
  const document = await ctx.db.get(delivery.documentId);
  await ctx.db.insert("notifications", {
    organisationId: delivery.organisationId,
    text: `${document?.filename ?? "A Document"} couldn't be delivered to ${delivery.integrationName}`,
    documentId: delivery.documentId,
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
    if (delivery.envelope === undefined) throw new ConvexError("This Document's data was deleted");
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
 * them, or only those of one Form's Documents when it is detached from it).
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
      const document = await ctx.db.get(delivery.documentId);
      if (document?.formId !== formId) continue;
    }
    await ctx.db.patch(delivery._id, {
      state: "failed",
      failureReason: "Integration removed",
      integrationRemoved: true,
      nextAttemptAt: undefined,
    });
    await startClockIfAllFailed(ctx, delivery.documentId);
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

/** A Document's Deliveries, oldest first. */
export async function deliveriesOf(ctx: QueryCtx, documentId: Id<"documents">) {
  const deliveries = await ctx.db
    .query("deliveries")
    .withIndex("by_documentId", (q) => q.eq("documentId", documentId))
    .take(100);
  return deliveries.map(viewOf);
}

/** An Integration's Deliveries, newest first, with the Document each carried. */
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
        const document = await ctx.db.get(delivery.documentId);
        return {
          ...viewOf(delivery),
          document: { id: delivery.documentId, filename: document?.filename ?? "" },
        };
      }),
    );
  },
});
