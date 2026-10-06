// Sets up Vink's Stripe catalog in one Stripe environment (a sandbox, or live):
// a Product per Plan with a monthly and an annual Price, the Top-up, the
// Customer Portal and the webhook endpoint. Safe to run again: it only adds
// what is missing, and a changed price in lib/plans.ts becomes a new Price
// that takes over the lookup key (existing Subscriptions keep their old one).
//
//   STRIPE_SECRET_KEY=sk_… npx tsx scripts/stripe-setup.ts \
//     --tax-code txcd_… --webhook-url https://<deployment>.convex.site/stripe/webhook
//
// The tax code must be one Managed Payments accepts (docs.stripe.com/payments/
// managed-payments/eligibility#eligible-tax-codes). Prices are excl. VAT.
//
// It prints STRIPE_PORTAL_CONFIGURATION and, for a new endpoint,
// STRIPE_WEBHOOK_SECRET: set both on the matching Convex deployment.
import { parseArgs } from "node:util";
import Stripe from "stripe";
import {
  planLookupKey,
  TOP_UP_LOOKUP_KEY,
  TOP_UP_PAGES,
  type BillingInterval,
} from "../convex/lib/billing";
import { plans } from "../lib/plans";

const TOP_UP_CENTS = 1000;
const SITE = "https://vink.page";
// What the webhook in convex/billing.ts handles.
const WEBHOOK_EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "invoice.paid",
  "invoice.payment_failed",
];

const { values } = parseArgs({
  options: { "tax-code": { type: "string" }, "webhook-url": { type: "string" } },
});
const taxCode = values["tax-code"];
const webhookUrl = values["webhook-url"];
if (!process.env.STRIPE_SECRET_KEY || !taxCode || !webhookUrl) {
  console.error("Needs STRIPE_SECRET_KEY, --tax-code and --webhook-url; see the top of this file.");
  process.exit(1);
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function product(key: string, name: string, description: string) {
  const found = await stripe.products.search({ query: `metadata['vink']:'${key}'` });
  if (found.data[0]) {
    const existing = found.data[0];
    if (existing.tax_code !== taxCode) await stripe.products.update(existing.id, { tax_code: taxCode });
    return existing.id;
  }
  const created = await stripe.products.create({
    name,
    description,
    tax_code: taxCode,
    metadata: { vink: key },
  });
  console.log(`Product ${name}: ${created.id}`);
  return created.id;
}

async function price(
  productId: string,
  lookupKey: string,
  cents: number,
  interval: BillingInterval | null,
) {
  const recurring = interval && { interval: interval === "monthly" ? "month" : "year" } as const;
  const { data } = await stripe.prices.list({ lookup_keys: [lookupKey], active: true });
  const existing = data[0];
  if (
    existing &&
    existing.product === productId &&
    existing.unit_amount === cents &&
    existing.recurring?.interval === recurring?.interval
  ) {
    return existing.id;
  }
  const created = await stripe.prices.create({
    product: productId,
    currency: "eur",
    unit_amount: cents,
    tax_behavior: "exclusive",
    lookup_key: lookupKey,
    transfer_lookup_key: true,
    ...(recurring && { recurring }),
  });
  console.log(`Price ${lookupKey}: ${created.id}`);
  return created.id;
}

const planProducts: Stripe.BillingPortal.ConfigurationCreateParams.Features.SubscriptionUpdate.Product[] = [];
for (const plan of plans) {
  const productId = await product(plan.id, `Vink ${plan.name}`, `${plan.pages} pagina's per maand`);
  planProducts.push({
    product: productId,
    prices: [
      await price(productId, planLookupKey(plan.id, "monthly"), plan.monthly * 100, "monthly"),
      await price(productId, planLookupKey(plan.id, "annual"), plan.annualMonthly * 12 * 100, "annual"),
    ],
  });
}
const topUpProduct = await product(
  "topup",
  "Vink Top-up",
  `${TOP_UP_PAGES} extra pagina's, tot het einde van de periode`,
);
await price(topUpProduct, TOP_UP_LOOKUP_KEY, TOP_UP_CENTS, null);

// The Customer Portal: change Plan (a smaller or shorter one from the next
// period), cancel at the period end, pay, update details and see invoices.
const portalFeatures: Stripe.BillingPortal.ConfigurationCreateParams.Features = {
  // No tax_id: Managed Payments subscriptions can't carry the Customer's tax IDs.
  customer_update: { enabled: true, allowed_updates: ["name", "email", "address"] },
  invoice_history: { enabled: true },
  payment_method_update: { enabled: true },
  subscription_cancel: {
    enabled: true,
    mode: "at_period_end",
    cancellation_reason: {
      enabled: true,
      options: ["too_expensive", "missing_features", "switched_service", "unused", "other"],
    },
  },
  subscription_update: {
    enabled: true,
    default_allowed_updates: ["price"],
    products: planProducts,
    proration_behavior: "create_prorations",
    schedule_at_period_end: {
      conditions: [{ type: "decreasing_item_amount" }, { type: "shortening_interval" }],
    },
  },
};
const businessProfile = {
  privacy_policy_url: `${SITE}/privacy`,
  terms_of_service_url: `${SITE}/terms`,
};
const portals = await stripe.billingPortal.configurations.list({ active: true, limit: 100 });
const ours = portals.data.find((configuration) => configuration.metadata?.vink === "portal");
const portal = ours
  ? await stripe.billingPortal.configurations.update(ours.id, {
      features: portalFeatures,
      business_profile: businessProfile,
    })
  : await stripe.billingPortal.configurations.create({
      features: portalFeatures,
      business_profile: businessProfile,
      metadata: { vink: "portal" },
    });

const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
const endpoint = endpoints.data.find((e) => e.url === webhookUrl);
let webhookSecret: string | undefined;
if (endpoint) {
  await stripe.webhookEndpoints.update(endpoint.id, { enabled_events: WEBHOOK_EVENTS });
} else {
  const created = await stripe.webhookEndpoints.create({
    url: webhookUrl,
    enabled_events: WEBHOOK_EVENTS,
    // The version the SDK in convex/lib/stripe.ts types its events with.
    api_version: Stripe.API_VERSION as Stripe.WebhookEndpointCreateParams.ApiVersion,
    description: "Vink: Plans and Top-ups (convex/billing.ts)",
  });
  webhookSecret = created.secret;
}

console.log(`\nSet on the Convex deployment:`);
console.log(`STRIPE_PORTAL_CONFIGURATION=${portal.id}`);
console.log(
  webhookSecret
    ? `STRIPE_WEBHOOK_SECRET=${webhookSecret}`
    : `(STRIPE_WEBHOOK_SECRET unchanged: the endpoint for ${webhookUrl} already existed)`,
);
