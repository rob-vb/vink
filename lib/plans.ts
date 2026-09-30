// The public Plans (CONTEXT.md, Plan): one place for names, Pages and prices.
// The pricing cards, the Home pricing row, the Pricing JSON-LD Offers and
// llms.txt all read this, so a price change is one edit. Prices are EUR,
// excl. VAT; annual billing is 20% off and shown as its monthly equivalent.

export type PlanId = "starter" | "team" | "business";

export type Plan = {
  id: PlanId;
  name: string;
  /** Pages per month. */
  pages: number;
  /** EUR per month, billed monthly. */
  monthly: number;
  /** EUR per month, billed annually. */
  annualMonthly: number;
  highlighted: boolean;
};

export const plans: Plan[] = [
  { id: "starter", name: "Starter", pages: 300, monthly: 49, annualMonthly: 39, highlighted: false },
  { id: "team", name: "Team", pages: 1000, monthly: 89, annualMonthly: 71, highlighted: true },
  { id: "business", name: "Business", pages: 3000, monthly: 199, annualMonthly: 159, highlighted: false },
];

/** More than the largest Plan: from this price per month, billed annually. */
export const custom = { name: "Custom", fromPages: 3000, fromMonthly: 500 } as const;

export const FREE_PAGES = 20;
export const ANNUAL_DISCOUNT = 0.2;
export const CURRENCY = "EUR";

/** EUR per year for annual billing. */
export function annualTotal(plan: Plan) {
  return plan.annualMonthly * 12;
}

/** EUR per Page at full use, for the chosen billing. */
export function perPage(plan: Plan, billing: "monthly" | "annual") {
  return (billing === "annual" ? plan.annualMonthly : plan.monthly) / plan.pages;
}

export function formatEuro(amount: number, locale: string, fractionDigits = 0) {
  return new Intl.NumberFormat(locale === "nl" ? "nl-NL" : "en-IE", {
    style: "currency",
    currency: CURRENCY,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(amount);
}

export function formatNumber(value: number, locale: string) {
  return new Intl.NumberFormat(locale === "nl" ? "nl-NL" : "en-GB").format(value);
}
