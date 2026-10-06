// Subscriptions (ADR 0008): an automation platform, with an API Key, asks to
// hear about one Form's Approvals. That makes an ordinary Webhook attached to
// the Form, so Approvals reach the platform as Deliveries, with retries and a
// signature, and the Form's keys lock as for any attached Integration.
// Unsubscribing, revoking the key or an Admin deleting the Webhook ends it.
import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { createWebhook, dummyEnvelope, removeIntegration } from "./integrations";
import { envelopeSchema } from "./lib/payload";

// More would crowd out the Admin's own Integrations in the app's list.
export const MAX_SUBSCRIPTIONS = 50;

type Refusal = { refused: { status: number; code: string; message: string } };

const notFound = (what: string): Refusal => ({
  refused: { status: 404, code: "not_found", message: `There's no ${what} with that id in your Organisation.` },
});

export const subscribe = internalMutation({
  args: {
    organisationId: v.id("organisations"),
    apiKeyId: v.id("apiKeys"),
    formId: v.string(),
    url: v.string(),
  },
  handler: async (ctx, { organisationId, apiKeyId, formId: givenFormId, url }) => {
    const formId = ctx.db.normalizeId("forms", givenFormId);
    const form = formId && (await ctx.db.get(formId));
    if (!formId || !form || form.organisationId !== organisationId) return notFound("Form");
    const apiKey = (await ctx.db.get(apiKeyId))!;
    const existing = await ctx.db
      .query("subscriptions")
      .withIndex("by_organisationId", (q) => q.eq("organisationId", organisationId))
      .take(MAX_SUBSCRIPTIONS);
    if (existing.length >= MAX_SUBSCRIPTIONS) {
      return {
        refused: {
          status: 409,
          code: "too_many_subscriptions",
          message: `An Organisation can have ${MAX_SUBSCRIPTIONS} Subscriptions. End one first.`,
        },
      };
    }
    let integrationId: Id<"integrations">;
    try {
      integrationId = await createWebhook(ctx, organisationId, { name: apiKey.name, url, headers: [] });
    } catch (error) {
      if (!(error instanceof ConvexError)) throw error;
      return { refused: { status: 422, code: "invalid_url", message: "The url must be an https URL." } };
    }
    await ctx.db.insert("formIntegrations", { organisationId, formId, integrationId });
    const id = await ctx.db.insert("subscriptions", { organisationId, apiKeyId, integrationId, formId });
    const subscription = (await ctx.db.get(id))!;
    return { subscription: { id, formId, url, createdAt: subscription._creationTime } };
  },
});

/**
 * Removes the Subscription's Webhook. Any key of the Organisation may end it.
 * Idempotent: a Subscription that is gone already (an Admin deleted its
 * Webhook, a 410 ended it) or was never this Organisation's ends nothing and
 * answers the same, because platforms treat any 4xx on detach as an error.
 */
export const unsubscribe = internalMutation({
  args: { organisationId: v.id("organisations"), subscriptionId: v.string() },
  handler: async (ctx, { organisationId, subscriptionId }) => {
    const id = ctx.db.normalizeId("subscriptions", subscriptionId);
    const subscription = id && (await ctx.db.get(id));
    if (subscription && subscription.organisationId === organisationId) {
      await removeIntegration(ctx, subscription.integrationId);
    }
    return { id: subscriptionId };
  },
});

/** When an API Key is revoked: its Subscriptions end and their Webhooks go. */
export async function endSubscriptionsOf(ctx: MutationCtx, apiKeyId: Id<"apiKeys">) {
  const subscriptions = await ctx.db
    .query("subscriptions")
    .withIndex("by_apiKeyId", (q) => q.eq("apiKeyId", apiKeyId))
    .take(MAX_SUBSCRIPTIONS);
  for (const subscription of subscriptions) await removeIntegration(ctx, subscription.integrationId);
}

/** The test-send's example envelope for a Form, for platforms to show its fields; null for no such Form. */
export const sample = internalQuery({
  args: { organisationId: v.id("organisations"), formId: v.string() },
  handler: async (ctx, { organisationId, formId: givenFormId }) => {
    const formId = ctx.db.normalizeId("forms", givenFormId);
    const form = formId && (await ctx.db.get(formId));
    if (!form || form.organisationId !== organisationId) return null;
    return await dummyEnvelope(ctx, form, "examples");
  },
});

/** The JSON Schema of the envelope for a Form's current Version; null for no such Form. */
export const schema = internalQuery({
  args: { organisationId: v.id("organisations"), formId: v.string() },
  handler: async (ctx, { organisationId, formId: givenFormId }) => {
    const formId = ctx.db.normalizeId("forms", givenFormId);
    const form = formId && (await ctx.db.get(formId));
    if (!form || form.organisationId !== organisationId) return null;
    const formVersion = (await ctx.db
      .query("formVersions")
      .withIndex("by_formId_and_number", (q) => q.eq("formId", form._id).eq("number", form.version))
      .unique())!;
    return envelopeSchema(formVersion.fields);
  },
});
