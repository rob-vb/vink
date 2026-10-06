// The database side of billing (billing.ts talks to Polar). Polar owns the
// Subscription; each webhook hands its current state to `applySubscription`,
// which sets the Organisation's Plan. Pages periods stay monthly, also on an
// annual Subscription, and the `pages periods` cron renews them.
import { v, type Infer } from "convex/values";
import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { billingInterval } from "./schema";
import { allowanceOf, isLive } from "./lib/billing";
import { nextPeriodEnd, pagesOf } from "./pages";

const paidPlan = v.union(v.literal("starter"), v.literal("team"), v.literal("business"));

/** What a Checkout or Customer Portal session needs to know about the Organisation. */
export const organisation = internalQuery({
  args: { organisationId: v.id("organisations") },
  handler: async (ctx, { organisationId }) => {
    const organisation = (await ctx.db.get(organisationId))!;
    return {
      name: organisation.name,
      slug: organisation.slug,
      plan: pagesOf(organisation).plan,
      hasCustomer: organisation.polarCustomerId !== undefined,
      hasLiveSubscription:
        organisation.subscription !== undefined && isLive(organisation.subscription.status),
    };
  },
});

// Who paid: the Polar Customer, and its external ID, which Checkout set to
// the Organisation's ID.
const customer = v.object({ id: v.string(), externalId: v.union(v.string(), v.null()) });

/** The Customer's Organisation, remembering its Polar Customer; `null` for a stranger. */
async function organisationOf(ctx: MutationCtx, { id, externalId }: Infer<typeof customer>) {
  const organisationId = externalId && ctx.db.normalizeId("organisations", externalId);
  const organisation = organisationId ? await ctx.db.get(organisationId) : null;
  if (organisation === null) return null;
  if (organisation.polarCustomerId !== id) await ctx.db.patch(organisation._id, { polarCustomerId: id });
  return { ...organisation, polarCustomerId: id };
}

/**
 * Sets the Plan from the Customer's current Subscription (`null`: none that
 * still runs). Idempotent, so webhooks may come twice and in any order.
 * - a first Plan starts a monthly Pages period on the billing anchor's day;
 * - a change of Plan keeps the period and the Pages used, with the new allowance;
 * - no Subscription any more: back to Free Pages only; Top-ups lapse.
 */
export const applySubscription = internalMutation({
  args: {
    customer,
    subscription: v.union(
      v.null(),
      v.object({
        id: v.string(),
        status: v.string(),
        plan: paidPlan,
        interval: billingInterval,
        endsAt: v.union(v.number(), v.null()),
        // When the Subscription started, ms: Pages periods end on its day of the month.
        anchor: v.number(),
      }),
    ),
  },
  handler: async (ctx, { customer, subscription }) => {
    const organisation = await organisationOf(ctx, customer);
    if (organisation === null) {
      console.warn(`Polar Customer ${customer.id} belongs to no Organisation`);
      return;
    }
    const pages = pagesOf(organisation);
    if (subscription === null || !isLive(subscription.status)) {
      if (organisation.subscription === undefined) return;
      await ctx.db.patch(organisation._id, {
        subscription: undefined,
        pages: {
          ...pages,
          plan: null,
          allowance: 0,
          allowanceUsed: 0,
          periodEndsAt: null,
          anchorDay: undefined,
          topUp: 0,
          used: 0,
        },
      });
      return;
    }
    const { plan, anchor, ...state } = subscription;
    const allowance = allowanceOf(plan);
    const hadPaidPlan = organisation.subscription !== undefined && pages.periodEndsAt !== null;
    const now = Date.now();
    const anchorDay = new Date(anchor).getUTCDate();
    await ctx.db.patch(organisation._id, {
      subscription: state,
      pages: hadPaidPlan
        ? { ...pages, plan, allowance }
        : {
            ...pages,
            plan,
            allowance,
            allowanceUsed: 0,
            used: 0,
            periodEndsAt: nextPeriodEnd(anchor, now, anchorDay),
            anchorDay,
          },
    });
  },
});

/** Credits a paid Top-up Order once, however often its webhook arrives. */
export const creditTopUp = internalMutation({
  args: { customer, orderId: v.string(), pages: v.number() },
  handler: async (ctx, { customer, orderId, pages: added }) => {
    const organisation = await organisationOf(ctx, customer);
    // Not bought through Vink (no external ID): nothing to credit. Throwing
    // would make Polar retry, and 10 failures in a row disable the endpoint.
    if (organisation === null) {
      console.warn(`Polar Customer ${customer.id} belongs to no Organisation`);
      return;
    }
    const credited = await ctx.db
      .query("topUpPayments")
      .withIndex("by_orderId", (q) => q.eq("orderId", orderId))
      .unique();
    if (credited !== null) return;
    await ctx.db.insert("topUpPayments", { organisationId: organisation._id, orderId, pages: added });
    const pages = pagesOf(organisation);
    await ctx.db.patch(organisation._id, { pages: { ...pages, topUp: pages.topUp + added } });
  },
});
