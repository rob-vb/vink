"use node";
// Billing through Stripe Managed Payments: Checkout for a Plan or a Top-up, the
// Customer Portal to change or cancel, and the webhook that turns Stripe's
// state into the Organisation's Plan (billingState.ts). Custom Plans stay by
// hand (pages.ts). See ADR 0005.
import { ConvexError, v } from "convex/values";
import type Stripe from "stripe";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, type ActionCtx } from "./_generated/server";
import {
  isLive,
  PLAN_CHECKOUT_ID,
  planLookupKey,
  planOfLookupKey,
  TOP_UP_CHECKOUT_ID,
  TOP_UP_LOOKUP_KEY,
  TOP_UP_MAX_QUANTITY,
  TOP_UP_PAGES,
} from "./lib/billing";
import { orgAction } from "./lib/functions";
import { stripe, webhookEvent } from "./lib/stripe";
import { billingInterval } from "./schema";

const locale = v.union(v.literal("nl"), v.literal("en"));

type Organisation = {
  name: string;
  slug: string;
  stripeCustomerId: string | null;
};

function settingsUrl(slug: string, outcome: string) {
  return `${process.env.SITE_URL}/app/o/${slug}/settings?billing=${outcome}`;
}

async function customerFor(
  ctx: ActionCtx,
  organisationId: Id<"organisations">,
  organisation: Organisation,
) {
  if (organisation.stripeCustomerId) return organisation.stripeCustomerId;
  const identity = await ctx.auth.getUserIdentity();
  // The idempotency key makes two quick clicks one Customer.
  const customer = await stripe().customers.create(
    {
      name: organisation.name,
      email: identity?.email ?? undefined,
      metadata: { organisationId },
    },
    { idempotencyKey: `customer-${organisationId}` },
  );
  return await ctx.runMutation(internal.billingState.setStripeCustomer, {
    organisationId,
    customerId: customer.id,
  });
}

async function priceId(lookupKey: string) {
  const prices = await stripe().prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
  const price = prices.data[0];
  if (!price) throw new Error(`No active Stripe Price ${lookupKey}; run scripts/stripe-setup.ts`);
  return price.id;
}

// Managed Payments: Stripe (through Link) is the merchant of record. It works
// out, collects and remits the VAT, chooses the payment methods, collects the
// address and sends the receipts and invoices. So these sessions must not set
// automatic_tax, tax_id_collection, customer_update, invoice_creation or
// payment methods (docs.stripe.com/payments/managed-payments/update-checkout).
const managed = {
  managed_payments: { enabled: true },
} satisfies Partial<Stripe.Checkout.SessionCreateParams>;

/** Admin: a Checkout page for a first Plan. Returns its URL. */
export const checkout = orgAction({
  role: "admin",
  args: {
    plan: v.union(v.literal("starter"), v.literal("team"), v.literal("business")),
    interval: billingInterval,
    locale,
  },
  handler: async (ctx, { plan, interval, locale }) => {
    const organisation = await ctx.runQuery(internal.billingState.organisation, {
      organisationId: ctx.organisationId,
    });
    if (organisation.hasLiveSubscription) throw new ConvexError("already_subscribed");
    if (organisation.plan === "internal_unlimited") throw new ConvexError("internal_plan");
    const customer = await customerFor(ctx, ctx.organisationId, organisation);
    const session = await stripe().checkout.sessions.create({
      mode: "subscription",
      customer,
      line_items: [{ price: await priceId(planLookupKey(plan, interval)), quantity: 1 }],
      ...managed,
      locale,
      success_url: settingsUrl(organisation.slug, "subscribed"),
      cancel_url: settingsUrl(organisation.slug, "cancelled"),
      integration_identifier: PLAN_CHECKOUT_ID,
    });
    return session.url!;
  },
});

/** Admin: a Checkout page for Top-ups, on top of a Plan. Returns its URL. */
export const topUp = orgAction({
  role: "admin",
  args: { locale },
  handler: async (ctx, { locale }) => {
    const organisation = await ctx.runQuery(internal.billingState.organisation, {
      organisationId: ctx.organisationId,
    });
    if (organisation.plan === null || organisation.plan === "internal_unlimited") {
      throw new ConvexError("no_plan");
    }
    const customer = await customerFor(ctx, ctx.organisationId, organisation);
    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      customer,
      line_items: [
        {
          price: await priceId(TOP_UP_LOOKUP_KEY),
          quantity: 1,
          adjustable_quantity: { enabled: true, minimum: 1, maximum: TOP_UP_MAX_QUANTITY },
        },
      ],
      ...managed,
      locale,
      success_url: settingsUrl(organisation.slug, "topped-up"),
      cancel_url: settingsUrl(organisation.slug, "cancelled"),
      integration_identifier: TOP_UP_CHECKOUT_ID,
    });
    return session.url!;
  },
});

/** Admin: the Customer Portal, to change Plan, cancel, pay or see invoices. Returns its URL. */
export const portal = orgAction({
  role: "admin",
  args: { locale },
  handler: async (ctx, { locale }) => {
    const organisation = await ctx.runQuery(internal.billingState.organisation, {
      organisationId: ctx.organisationId,
    });
    if (!organisation.stripeCustomerId) throw new ConvexError("no_customer");
    const session = await stripe().billingPortal.sessions.create({
      customer: organisation.stripeCustomerId,
      locale,
      return_url: settingsUrl(organisation.slug, "portal"),
      configuration: process.env.STRIPE_PORTAL_CONFIGURATION || undefined,
    });
    return session.url;
  },
});

function idOf(object: string | { id: string }) {
  return typeof object === "string" ? object : object.id;
}

/** Hands the Customer's current Subscription, if any still runs, to billingState. */
async function syncCustomer(ctx: ActionCtx, customerId: string) {
  const { data } = await stripe().subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 10,
  });
  const live = data.find((subscription) => isLive(subscription.status));
  const item = live?.items.data[0];
  const bought = item ? planOfLookupKey(item.price.lookup_key) : null;
  if (live && item && bought === null) {
    throw new Error(`Subscription ${live.id} has a Price that is no Plan: ${item.price.id}`);
  }
  await ctx.runMutation(internal.billingState.applySubscription, {
    customerId,
    subscription:
      live && item && bought
        ? {
            id: live.id,
            status: live.status,
            plan: bought.plan,
            interval: bought.interval,
            endsAt:
              live.cancel_at !== null
                ? live.cancel_at * 1000
                : live.cancel_at_period_end
                  ? item.current_period_end * 1000
                  : null,
            anchor: live.billing_cycle_anchor * 1000,
          }
        : null,
  });
}

async function creditTopUp(ctx: ActionCtx, session: Stripe.Checkout.Session) {
  const { data } = await stripe().checkout.sessions.listLineItems(session.id);
  const quantity = data
    .filter((line) => line.price?.lookup_key === TOP_UP_LOOKUP_KEY)
    .reduce((sum, line) => sum + (line.quantity ?? 0), 0);
  if (quantity === 0) return;
  await ctx.runMutation(internal.billingState.creditTopUp, {
    customerId: idOf(session.customer!),
    checkoutSessionId: session.id,
    pages: quantity * TOP_UP_PAGES,
  });
}

/**
 * A Stripe webhook, from http.ts. Returns `false` for a bad signature; throws
 * when handling fails, so Stripe sends it again.
 */
export const webhook = internalAction({
  args: { payload: v.string(), signature: v.string() },
  handler: async (ctx, { payload, signature }) => {
    let event: Stripe.Event;
    try {
      event = await webhookEvent(payload, signature);
    } catch {
      return false;
    }
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object;
        if (session.customer === null) break;
        if (session.mode === "subscription") await syncCustomer(ctx, idOf(session.customer));
        // A bank payment can complete unpaid and succeed later.
        else if (session.mode === "payment" && session.payment_status === "paid") {
          await creditTopUp(ctx, session);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "customer.subscription.paused":
      case "customer.subscription.resumed":
        await syncCustomer(ctx, idOf(event.data.object.customer));
        break;
      case "invoice.paid":
      case "invoice.payment_failed":
        // Stripe retries a failed payment and emails the customer; the
        // Subscription's status (past_due, then cancelled) carries the outcome.
        if (event.data.object.customer) await syncCustomer(ctx, idOf(event.data.object.customer));
        break;
    }
    return true;
  },
});
