// Sets up Vink's Stripe account in one environment (a sandbox, or live): a
// Product per Plan with a monthly and an annual Price, the Top-up, the payment
// methods, the Customer Portal and the webhook endpoint. Safe to run again: it
// only changes what differs, and a changed price in lib/plans.ts becomes a new
// Price that takes over the lookup key (existing Subscriptions keep theirs).
//
//   STRIPE_SECRET_KEY=rk_… npx tsx scripts/stripe-setup.mts \
//     --webhook-url https://<deployment>.convex.site/stripe/webhook
//
// Vink is the seller and Stripe Tax works out the VAT, so prices are excl. VAT
// and every Product carries the SaaS tax code. Stripe Tax itself (head office
// address, registrations) is set up in the Dashboard; this script only checks
// it, because without an active registration Stripe Tax collects no VAT at all.
//
// It prints STRIPE_PAYMENT_METHOD_CONFIGURATION, STRIPE_PORTAL_CONFIGURATION
// and, for a new endpoint, STRIPE_WEBHOOK_SECRET: set them, with
// STRIPE_SECRET_KEY, on the matching Convex deployment.
import { parseArgs } from "node:util";
import Stripe from "stripe";
import {
  planLookupKey,
  TOP_UP_CENTS,
  TOP_UP_LOOKUP_KEY,
  TOP_UP_ITEMS,
  type BillingInterval,
} from "../convex/lib/billing";
import { plans } from "../lib/plans";

const SITE = "https://vink.page";
// Software as a service, for business use.
const TAX_CODE = "txcd_10103001";
// The payment methods Checkout may offer; Stripe shows each only where it
// fits (currency, country, one-time or recurring). Every other one is off.
const PAYMENT_METHODS = ["card", "apple_pay", "google_pay", "ideal", "sepa_debit", "bancontact"];
const PAYMENT_METHOD_CONFIGURATION_NAME = "Vink";
// What the webhook in convex/billing.ts handles.
const WEBHOOK_EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "invoice.paid",
  "invoice.payment_failed",
  "invoice.voided",
  "customer.tax_id.created",
  "customer.tax_id.updated",
];

const { values } = parseArgs({ options: { "webhook-url": { type: "string" } } });
const webhookUrl = values["webhook-url"];
if (!process.env.STRIPE_SECRET_KEY || !webhookUrl) {
  console.error("Needs STRIPE_SECRET_KEY and --webhook-url; see the top of this file.");
  process.exit(1);
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Listed, not searched: search lags up to a minute behind, so a second run
// right after the first would make every Product again.
const activeProducts: Stripe.Product[] = [];
for await (const p of stripe.products.list({ active: true, limit: 100 })) activeProducts.push(p);

async function product(key: string, name: string, description: string) {
  const existing = activeProducts.find((p) => p.metadata.vink === key);
  if (existing) {
    if (existing.tax_code !== TAX_CODE) {
      await stripe.products.update(existing.id, { tax_code: TAX_CODE });
      console.log(`Product ${name}: tax code set`);
    }
    // Products are found by `metadata.vink`, so a renamed Product (Page → Item,
    // ADR 0010) keeps its id, its Prices and its Subscriptions.
    if (existing.name !== name || existing.description !== description) {
      await stripe.products.update(existing.id, { name, description });
      console.log(`Product ${name}: name and description set`);
    }
    return existing.id;
  }
  const created = await stripe.products.create({
    name,
    description,
    tax_code: TAX_CODE,
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
  const recurring = interval && ({ interval: interval === "monthly" ? "month" : "year" } as const);
  const { data } = await stripe.prices.list({ lookup_keys: [lookupKey], active: true });
  const existing = data[0];
  if (
    existing &&
    existing.product === productId &&
    existing.unit_amount === cents &&
    existing.tax_behavior === "exclusive" &&
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
  const productId = await product(plan.id, `Vink ${plan.name}`, `${plan.items} items per maand`);
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
  `${TOP_UP_ITEMS} extra items, tot het einde van de periode`,
);
await price(topUpProduct, TOP_UP_LOOKUP_KEY, TOP_UP_CENTS, null);

// The payment methods: ours on, every other one the configuration knows off.
const configurations = await stripe.paymentMethodConfigurations.list({ limit: 100 });
let methods =
  configurations.data.find((c) => c.name === PAYMENT_METHOD_CONFIGURATION_NAME && c.active) ??
  (await stripe.paymentMethodConfigurations.create({ name: PAYMENT_METHOD_CONFIGURATION_NAME }));
const preferences: Record<string, { display_preference: { preference: "on" | "off" } }> = {};
for (const [method, setting] of Object.entries(methods)) {
  const current = (setting as { display_preference?: { preference: string } } | null)?.display_preference;
  if (!current) continue;
  const wanted = PAYMENT_METHODS.includes(method) ? "on" : "off";
  if (current.preference !== wanted) preferences[method] = { display_preference: { preference: wanted } };
}
if (Object.keys(preferences).length > 0) {
  methods = await stripe.paymentMethodConfigurations.update(
    methods.id,
    preferences as Stripe.PaymentMethodConfigurationUpdateParams,
  );
  console.log(`Payment methods: ${Object.keys(preferences).join(", ")} changed`);
}
// Checked once they are on: a method that is off is never available.
const missing = PAYMENT_METHODS.filter(
  (method) => (methods as unknown as Record<string, { available?: boolean } | undefined>)[method]?.available !== true,
);
if (missing.length > 0) console.warn(`Not available on this account yet: ${missing.join(", ")}`);

// The Customer Portal: change Plan (a smaller or shorter one from the next
// period), cancel at the period end, pay, update details and VAT number, and
// see invoices.
const portalFeatures: Stripe.BillingPortal.ConfigurationCreateParams.Features = {
  customer_update: { enabled: true, allowed_updates: ["name", "email", "address", "tax_id"] },
  invoice_history: { enabled: true },
  payment_method_update: { enabled: true, payment_method_configuration: methods.id },
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
  await stripe.webhookEndpoints.update(endpoint.id, { enabled_events: WEBHOOK_EVENTS, disabled: false });
  if (endpoint.api_version !== Stripe.API_VERSION) {
    console.warn(`Webhook endpoint is on API ${endpoint.api_version}, the SDK on ${Stripe.API_VERSION}: make a new one`);
  }
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

// Stripe Tax: where there is no active registration it adds no VAT, silently.
// Vink sells from the Netherlands, so the Dutch one is a must. EU buyers
// without a VAT number pay Dutch VAT only under the small seller scheme, and
// their own country's VAT only with OSS; without either they pay none.
const tax = await stripe.tax.settings.retrieve();
const registrations = await stripe.tax.registrations.list({ status: "active", limit: 100 });
const schemes = registrations.data.flatMap((r) =>
  Object.values(r.country_options).map((o) => {
    const option = o as { type?: string; standard?: { place_of_supply_scheme?: string } };
    return `${r.country}:${option.standard?.place_of_supply_scheme ?? option.type}`;
  }),
);
const taxReady = tax.status === "active" && registrations.data.some((r) => r.country === "NL");

console.log(`\nSet on the Convex deployment:`);
console.log(`STRIPE_PAYMENT_METHOD_CONFIGURATION=${methods.id}`);
console.log(`STRIPE_PORTAL_CONFIGURATION=${portal.id}`);
console.log(
  webhookSecret
    ? `STRIPE_WEBHOOK_SECRET=${webhookSecret}`
    : `(STRIPE_WEBHOOK_SECRET unchanged: the endpoint for ${webhookUrl} already existed)`,
);
console.log(`\nStripe Tax: ${tax.status}; active registrations: ${schemes.join(", ") || "none"}`);
if (!schemes.some((s) => s === "NL:small_seller" || s === "NL:oss_union")) {
  console.warn("No NL small seller scheme and no OSS: EU buyers without a VAT number pay no VAT. Ask the accountant.");
}
if (!taxReady) {
  console.error("Stripe Tax is not ready (no active NL registration): Checkout would add no VAT. Set it up in the Dashboard (Tax).");
  process.exit(2);
}
