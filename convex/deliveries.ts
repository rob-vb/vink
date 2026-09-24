// Delivery (spec, Payload and Delivery): after Approval, one Delivery per
// attached Integration POSTs the envelope, signed with the Integration's
// current configuration at every attempt.
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
import { endpointOf, sendSigned } from "./integrations";
import { documentPayload } from "./lib/documentPayload";
import { orgQuery } from "./lib/functions";
import { envelopeOf } from "./lib/payload";

// What the attempt log keeps of a response body.
const BODY_LOGGED = 500;

/**
 * Creates a Delivery for every Integration attached to the Document's Form
 * right now, freezing the envelope, and sends each. None when nothing is attached.
 */
export async function createDeliveries(ctx: MutationCtx, document: Doc<"documents">) {
  const links = await ctx.db
    .query("formIntegrations")
    .withIndex("by_formId", (q) => q.eq("formId", document.formId))
    .take(100);
  if (links.length === 0) return;
  const approval = document.approval!;
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
    return { envelope: delivery.envelope, endpoint: await endpointOf(integration) };
  },
});

export type Outcome =
  | { kind: "delivered" }
  | { kind: "failed"; reason: string }
  | { kind: "retry"; reason: string; retryAfter: string | null };

/** How an answer (or the lack of one) settles an attempt. */
function outcomeOf(status: number | null, retryAfter: string | null, error: string | null): Outcome {
  if (status === null) return { kind: "retry", reason: error!, retryAfter: null };
  if (status >= 200 && status < 300) return { kind: "delivered" };
  if (status === 408 || status === 429 || status >= 500) {
    return { kind: "retry", reason: `The receiver answered ${status}`, retryAfter };
  }
  return { kind: "failed", reason: `The receiver refused it (${status})` };
}

export const attempt = internalAction({
  args: { id: v.id("deliveries") },
  handler: async (ctx, { id }) => {
    const input = await ctx.runQuery(internal.deliveries.attemptInput, { id });
    if (input === null) return;
    const at = Date.now();
    const { answer, failure } = await sendSigned(input.endpoint, JSON.parse(input.envelope));
    await ctx.runMutation(internal.deliveries.recordAttempt, {
      id,
      attempt: {
        at,
        status: answer?.status ?? null,
        body: answer ? answer.body.slice(0, BODY_LOGGED) : null,
        error: failure?.message ?? null,
      },
      retryAfter: answer?.retryAfter ?? null,
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
    retryAfter: v.union(v.string(), v.null()),
  },
  handler: async (ctx, { id, attempt, retryAfter }) => {
    const delivery = (await ctx.db.get(id))!;
    // Settled meanwhile (e.g. its Integration was removed): keep the log only.
    const attempts = [...delivery.attempts, attempt];
    if (delivery.state !== "pending" && delivery.state !== "retrying") {
      await ctx.db.patch(id, { attempts });
      return;
    }
    const outcome = outcomeOf(attempt.status, retryAfter, attempt.error);
    if (outcome.kind === "delivered") {
      await ctx.db.patch(id, { attempts, state: "delivered", nextAttemptAt: undefined });
    } else {
      await ctx.db.patch(id, {
        attempts,
        state: "failed",
        failureReason: outcome.reason,
        nextAttemptAt: undefined,
      });
    }
  },
});

function viewOf(delivery: Doc<"deliveries">) {
  return {
    id: delivery._id,
    deliveryId: delivery.deliveryId,
    integrationName: delivery.integrationName,
    state: delivery.state,
    failureReason: delivery.failureReason ?? null,
    nextAttemptAt: delivery.nextAttemptAt ?? null,
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
