// What Vink sells through Polar. Each Product carries its key in metadata
// (`vink_key`), so the code needs no Product IDs per environment:
// scripts/polar-setup.mts makes the same keys in the sandbox and in production.
// Pages and prices come from lib/plans.ts.
import { plans } from "../../lib/plans";

export type PaidPlan = "starter" | "team" | "business";
export type BillingInterval = "monthly" | "annual";

/** The Product metadata key that names what a Product is. */
export const PRODUCT_KEY = "vink_key";

/** One Top-up: 100 Pages for €10, until the end of the period. */
export const TOP_UP_PAGES = 100;
export const TOP_UP_CENTS = 1000;
export const TOP_UP_KEY = "vink_topup_100";
/** At most this many Top-ups in one Checkout. */
export const TOP_UP_MAX_QUANTITY = 10;

/** Subscription statuses in which the Organisation keeps its Plan. */
const LIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

export function isLive(status: string) {
  return LIVE_STATUSES.has(status);
}

export function planKey(plan: PaidPlan, interval: BillingInterval) {
  return `vink_${plan}_${interval}`;
}

/** The Plan and interval a Product stands for, or `null` for any other Product. */
export function planOfKey(key: unknown): { plan: PaidPlan; interval: BillingInterval } | null {
  const match = /^vink_(starter|team|business)_(monthly|annual)$/.exec(
    typeof key === "string" ? key : "",
  );
  if (!match) return null;
  return { plan: match[1] as PaidPlan, interval: match[2] as BillingInterval };
}

/** Pages per month on a paid Plan, billed monthly or annually alike. */
export function allowanceOf(plan: PaidPlan) {
  return plans.find((p) => p.id === plan)!.pages;
}
