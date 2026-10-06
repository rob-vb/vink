"use node";
// Billing through Polar, the merchant of record: Checkout for a Plan or a
// Top-up, the Customer Portal to change or cancel, and the webhook that turns
// Polar's state into the Organisation's Plan (billingState.ts). Custom Plans
// stay by hand (pages.ts). See ADR 0006.
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, type ActionCtx } from "./_generated/server";
import {
  isLive,
  planKey,
  planOfKey,
  PRODUCT_KEY,
  TOP_UP_KEY,
  TOP_UP_MAX_QUANTITY,
  TOP_UP_PAGES,
} from "./lib/billing";
import { orgAction } from "./lib/functions";
import { polar, webhookEvent } from "./lib/polar";
import { billingInterval } from "./schema";

const locale = v.union(v.literal("nl"), v.literal("en"));

type Customer = { id: string; external_id?: string | null };

function settingsUrl(slug: string, outcome: string) {
  return `${process.env.SITE_URL}/app/o/${slug}/settings?billing=${outcome}`;
}

async function productId(key: string) {
  const { items } = await polar().products.list({
    metadata: { [PRODUCT_KEY]: key },
    is_archived: false,
    limit: 1,
  });
  if (!items[0]) throw new Error(`No Polar Product ${key}; run scripts/polar-setup.mts`);
  return items[0].id;
}

// What every Checkout shares. The Organisation's ID is the Customer's external
// ID, so Polar makes the Customer at the first Checkout and finds it again
// after. Vink sells to businesses: Polar asks for the company name and address
// and takes a VAT number, for reverse charge.
async function checkoutFor(
  ctx: ActionCtx & { organisationId: string },
  organisation: { name: string; slug: string },
  locale: string,
  outcome: string,
) {
  const identity = await ctx.auth.getUserIdentity();
  return {
    external_customer_id: ctx.organisationId,
    customer_email: identity?.email ?? null,
    customer_billing_name: organisation.name,
    is_business_customer: true,
    allow_discount_codes: false,
    locale,
    success_url: settingsUrl(organisation.slug, outcome),
    return_url: settingsUrl(organisation.slug, "cancelled"),
  };
}

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
    const session = await polar().checkouts.create({
      products: [await productId(planKey(plan, interval))],
      ...(await checkoutFor(ctx, organisation, locale, "subscribed")),
    });
    return session.url;
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
    const session = await polar().checkouts.create({
      products: [await productId(TOP_UP_KEY)],
      min_units: 1,
      max_units: TOP_UP_MAX_QUANTITY,
      ...(await checkoutFor(ctx, organisation, locale, "topped-up")),
    });
    return session.url;
  },
});

/** Admin: the Customer Portal, to change Plan, cancel, pay or see invoices. Returns its URL. */
export const portal = orgAction({
  role: "admin",
  args: { locale },
  // The Portal picks its language from the browser.
  handler: async (ctx) => {
    const organisation = await ctx.runQuery(internal.billingState.organisation, {
      organisationId: ctx.organisationId,
    });
    if (!organisation.hasCustomer) throw new ConvexError("no_customer");
    const session = await polar().customerSessions.create({
      external_customer_id: ctx.organisationId,
      return_url: settingsUrl(organisation.slug, "portal"),
    });
    return session.customer_portal_url;
  },
});

/** Hands the Customer's current Subscription, if any still runs, to billingState. */
async function syncCustomer(ctx: ActionCtx, customer: Customer) {
  const { items } = await polar().subscriptions.list({ customer_id: customer.id, limit: 10 });
  const live = items.find((subscription) => isLive(subscription.status));
  const bought = live ? planOfKey(live.product.metadata[PRODUCT_KEY]) : null;
  if (live && bought === null) {
    throw new Error(`Subscription ${live.id} has a Product that is no Plan: ${live.product_id}`);
  }
  await ctx.runMutation(internal.billingState.applySubscription, {
    customer: { id: customer.id, externalId: customer.external_id ?? null },
    subscription:
      live && bought
        ? {
            id: live.id,
            status: live.status,
            plan: bought.plan,
            interval: bought.interval,
            endsAt: live.cancel_at_period_end
              ? Date.parse(live.current_period_end)
              : live.ends_at
                ? Date.parse(live.ends_at)
                : null,
            anchor: Date.parse(live.started_at ?? live.current_period_start),
          }
        : null,
  });
}

/**
 * A Polar webhook, from http.ts. Returns `false` for a bad signature; throws
 * when handling fails, so Polar sends it again.
 */
export const webhook = internalAction({
  args: {
    payload: v.string(),
    headers: v.object({ id: v.string(), timestamp: v.string(), signature: v.string() }),
  },
  handler: async (ctx, { payload, headers }) => {
    const event = await webhookEvent(payload, headers);
    if (event === "bad_signature") return false;
    if (event === "unknown_type") return true;
    switch (event.type) {
      // `subscription.updated` also comes with every cancel, uncancel, renewal,
      // failed payment, pause and revoke.
      case "subscription.created":
      case "subscription.updated":
        await syncCustomer(ctx, event.data.customer);
        break;
      case "order.paid": {
        const order = event.data;
        if (order.product?.metadata[PRODUCT_KEY] !== TOP_UP_KEY) break;
        if (!order.units) throw new Error(`Top-up Order ${order.id} has no units`);
        await ctx.runMutation(internal.billingState.creditTopUp, {
          customer: { id: order.customer.id, externalId: order.customer.external_id ?? null },
          orderId: order.id,
          pages: order.units * TOP_UP_PAGES,
        });
        break;
      }
    }
    return true;
  },
});
