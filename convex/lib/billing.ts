// What Vink sells through Stripe, by Price lookup key, so the code needs no
// Price IDs per environment: scripts/stripe-setup.mts makes the same keys in a
// sandbox and in live mode. Pages and prices come from lib/plans.ts.
import { plans } from "../../lib/plans";

export type PaidPlan = "starter" | "team" | "business";
export type BillingInterval = "monthly" | "annual";

/** One Top-up: 100 Pages for €10, until the end of the period. */
export const TOP_UP_PAGES = 100;
export const TOP_UP_CENTS = 1000;
export const TOP_UP_LOOKUP_KEY = "vink_topup_100";
/** At most this many Top-ups in one Checkout. */
export const TOP_UP_MAX_QUANTITY = 10;

// Tags each Checkout flow in the Stripe Dashboard.
export const PLAN_CHECKOUT_ID = "vink_plan_wdupdhtv";
export const TOP_UP_CHECKOUT_ID = "vink_topup_lylhksve";

/** Subscription statuses in which the Organisation keeps its Plan. */
const LIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

export function isLive(status: string) {
  return LIVE_STATUSES.has(status);
}

export function planLookupKey(plan: PaidPlan, interval: BillingInterval) {
  return `vink_${plan}_${interval}`;
}

/** The Plan and interval a Price stands for, or `null` for any other Price. */
export function planOfLookupKey(
  lookupKey: string | null,
): { plan: PaidPlan; interval: BillingInterval } | null {
  const match = /^vink_(starter|team|business)_(monthly|annual)$/.exec(lookupKey ?? "");
  if (!match) return null;
  return { plan: match[1] as PaidPlan, interval: match[2] as BillingInterval };
}

/** Pages per month on a paid Plan, billed monthly or annually alike. */
export function allowanceOf(plan: PaidPlan) {
  return plans.find((p) => p.id === plan)!.pages;
}
