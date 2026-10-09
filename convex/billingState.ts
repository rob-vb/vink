// The database side of billing (billing.ts talks to Stripe). Stripe owns the
// Subscription; each webhook hands its current state to `applySubscription`,
// which sets the Organisation's Plan. Items periods stay monthly, also on an
// annual Subscription, and the `item periods` cron renews them.
import { v } from "convex/values";
import { internalMutation, internalQuery, type QueryCtx } from "./_generated/server";
import { billingInterval } from "./schema";
import { allowanceOf, isLive } from "./lib/billing";
import { itemsOf, itemsPatch, nextPeriodEnd } from "./items";

const paidPlan = v.union(v.literal("starter"), v.literal("team"), v.literal("business"));

/** What a Checkout or Customer Portal session needs to know about the Organisation. */
export const organisation = internalQuery({
  args: { organisationId: v.id("organisations") },
  handler: async (ctx, { organisationId }) => {
    const organisation = (await ctx.db.get(organisationId))!;
    return {
      name: organisation.name,
      slug: organisation.slug,
      plan: itemsOf(organisation).plan,
      stripeCustomerId: organisation.stripeCustomerId ?? null,
      hasLiveSubscription:
        organisation.subscription !== undefined && isLive(organisation.subscription.status),
    };
  },
});

/** Stores the Organisation's Stripe Customer, unless it already has one; returns the one it keeps. */
export const setStripeCustomer = internalMutation({
  args: { organisationId: v.id("organisations"), customerId: v.string() },
  handler: async (ctx, { organisationId, customerId }) => {
    const organisation = (await ctx.db.get(organisationId))!;
    if (organisation.stripeCustomerId) return organisation.stripeCustomerId;
    await ctx.db.patch(organisationId, { stripeCustomerId: customerId });
    return customerId;
  },
});

/** The Customer's Organisation; `null` for a Customer Vink didn't make. */
async function byCustomer(ctx: QueryCtx, customerId: string) {
  return await ctx.db
    .query("organisations")
    .withIndex("by_stripeCustomerId", (q) => q.eq("stripeCustomerId", customerId))
    .unique();
}

/**
 * Sets the Plan from the Customer's current Subscription (`null`: none that
 * still runs). Idempotent, so webhooks may come twice and in any order.
 * - a first Plan starts a monthly Items period on the billing anchor's day;
 * - a change of Plan keeps the period and the Items used, with the new allowance;
 * - no Subscription any more: back to Free Items only; Top-ups lapse.
 */
export const applySubscription = internalMutation({
  args: {
    customerId: v.string(),
    // When billing.ts read this from Stripe, ms: an older read never overwrites a newer one.
    listedAt: v.number(),
    subscription: v.union(
      v.null(),
      v.object({
        id: v.string(),
        status: v.string(),
        plan: paidPlan,
        interval: billingInterval,
        endsAt: v.union(v.number(), v.null()),
        // The billing cycle anchor, ms: Items periods end on its day of the month.
        anchor: v.number(),
      }),
    ),
  },
  handler: async (ctx, { customerId, listedAt, subscription }) => {
    const organisation = await byCustomer(ctx, customerId);
    if (organisation === null) {
      console.warn(`Stripe Customer ${customerId} belongs to no Organisation`);
      return;
    }
    if (listedAt < (organisation.billingSyncedAt ?? 0)) return;
    const items = itemsOf(organisation);
    if (subscription === null || !isLive(subscription.status)) {
      if (organisation.subscription === undefined) {
        await ctx.db.patch(organisation._id, { billingSyncedAt: listedAt });
        return;
      }
      await ctx.db.patch(organisation._id, {
        billingSyncedAt: listedAt,
        subscription: undefined,
        ...itemsPatch({
          ...items,
          plan: null,
          allowance: 0,
          allowanceUsed: 0,
          periodEndsAt: null,
          anchorDay: undefined,
          topUp: 0,
          used: 0,
        }),
      });
      return;
    }
    const { plan, anchor, ...state } = subscription;
    const allowance = allowanceOf(plan);
    const hadPaidPlan = organisation.subscription !== undefined && items.periodEndsAt !== null;
    const now = Date.now();
    const anchorDay = new Date(anchor).getUTCDate();
    await ctx.db.patch(organisation._id, {
      billingSyncedAt: listedAt,
      subscription: state,
      ...itemsPatch(
        hadPaidPlan
          ? { ...items, plan, allowance }
          : {
              ...items,
              plan,
              allowance,
              allowanceUsed: 0,
              used: 0,
              periodEndsAt: nextPeriodEnd(anchor, now, anchorDay),
              anchorDay,
            },
      ),
    });
  },
});

/** Credits a paid Top-up Checkout once, however often its webhook arrives. */
export const creditTopUp = internalMutation({
  args: { customerId: v.string(), checkoutSessionId: v.string(), items: v.number() },
  handler: async (ctx, { customerId, checkoutSessionId, items: added }) => {
    const organisation = await byCustomer(ctx, customerId);
    // Not bought through Vink: nothing to credit. Throwing would only make
    // Stripe retry for days.
    if (organisation === null) {
      console.warn(`Stripe Customer ${customerId} belongs to no Organisation`);
      return;
    }
    const credited = await ctx.db
      .query("topUpPayments")
      .withIndex("by_checkoutSessionId", (q) => q.eq("checkoutSessionId", checkoutSessionId))
      .unique();
    if (credited !== null) return;
    await ctx.db.insert("topUpPayments", {
      organisationId: organisation._id,
      checkoutSessionId,
      items: added,
    });
    const items = itemsOf(organisation);
    await ctx.db.patch(organisation._id, itemsPatch({ ...items, topUp: items.topUp + added }));
  },
});
