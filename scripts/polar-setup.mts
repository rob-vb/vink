// Sets up Vink's Polar catalog in one Polar environment (the sandbox, or
// production): a Product per Plan and interval, the Top-up, and the webhook
// endpoint. Safe to run again: Products are found by their `vink_key`
// metadata, a changed price in lib/plans.ts replaces the Product's price
// (existing Subscriptions keep theirs), and the endpoint is found by URL.
//
//   POLAR_ACCESS_TOKEN=polar_oat_… npx tsx scripts/polar-setup.mts \
//     --server sandbox --webhook-url https://<deployment>.convex.site/polar/webhook
//
// The token needs products:read/write and webhooks:read/write. Prices are EUR
// excl. VAT, so the organisation's default payment currency must be EUR.
//
// For a new endpoint it prints POLAR_WEBHOOK_SECRET: set it, with
// POLAR_ACCESS_TOKEN and POLAR_SERVER, on the matching Convex deployment.
import { parseArgs } from "node:util";
import { createPolar, type models } from "@polar-sh/sdk/2026-10";
import {
  planKey,
  PRODUCT_KEY,
  TOP_UP_CENTS,
  TOP_UP_KEY,
  TOP_UP_PAGES,
  type BillingInterval,
} from "../convex/lib/billing";
import { plans } from "../lib/plans";

// What the webhook in convex/billing.ts handles. `subscription.updated` also
// comes with every cancel, renewal, failed payment and revoke.
const WEBHOOK_EVENTS = ["subscription.created", "subscription.updated", "order.paid"] as const;

const { values } = parseArgs({
  options: { server: { type: "string" }, "webhook-url": { type: "string" } },
});
const server = values.server;
const webhookUrl = values["webhook-url"];
if (!process.env.POLAR_ACCESS_TOKEN || (server !== "sandbox" && server !== "production") || !webhookUrl) {
  console.error("Needs POLAR_ACCESS_TOKEN, --server sandbox|production and --webhook-url; see the top of this file.");
  process.exit(1);
}

const polar = createPolar({ accessToken: process.env.POLAR_ACCESS_TOKEN, environment: server });

type Price = models.ProductPriceFixedCreate | models.ProductPriceUnitBasedCreate;

const fixed = (cents: number): Price => ({
  amount_type: "fixed",
  price_currency: "eur",
  tax_behavior: "exclusive",
  price_amount: cents,
});

const topUpPrice: Price = {
  amount_type: "unit_based",
  price_currency: "eur",
  tax_behavior: "exclusive",
  tiers: { type: "volume", tiers: [{ unit_amount: TOP_UP_CENTS }] },
  minimum_units: 1,
  unit_label: {
    nl: { "=1": "Top-up", other: "Top-ups" },
    en: { "=1": "Top-up", other: "Top-ups" },
  },
};

/** Whether the Product's live price already is `wanted`. */
function samePrice(
  prices: { amount_type: string; is_archived: boolean; price_currency: string; price_amount?: number; tiers?: unknown }[],
  wanted: Price,
) {
  const live = prices.filter((p) => !p.is_archived && p.price_currency === "eur");
  if (live.length !== 1 || live[0].amount_type !== wanted.amount_type) return false;
  return wanted.amount_type === "fixed"
    ? live[0].price_amount === wanted.price_amount
    : JSON.stringify((live[0].tiers as { tiers: { unit_amount: unknown }[] }).tiers.map((t) => Number(t.unit_amount))) ===
        JSON.stringify(wanted.tiers.tiers.map((t) => t.unit_amount));
}

async function product(
  key: string,
  name: string,
  description: string,
  interval: BillingInterval | null,
  price: Price,
) {
  const { items } = await polar.products.list({ metadata: { [PRODUCT_KEY]: key }, is_archived: false, limit: 1 });
  const existing = items[0];
  if (existing) {
    if (samePrice(existing.prices as Parameters<typeof samePrice>[0], price)) return existing.id;
    await polar.products.update(existing.id, { name, description, prices: [price] });
    console.log(`Product ${name}: new price`);
    return existing.id;
  }
  const metadata = { [PRODUCT_KEY]: key };
  const created = interval
    ? await polar.products.create({
        name,
        description,
        metadata,
        recurring_interval: interval === "monthly" ? "month" : "year",
        prices: [price],
      })
    : await polar.products.create({ name, description, metadata, prices: [price] });
  console.log(`Product ${name}: ${created.id}`);
  return created.id;
}

for (const plan of plans) {
  const description = `${plan.pages} pagina's per maand`;
  await product(planKey(plan.id, "monthly"), `Vink ${plan.name} (maandelijks)`, description, "monthly", fixed(plan.monthly * 100));
  await product(
    planKey(plan.id, "annual"),
    `Vink ${plan.name} (jaarlijks)`,
    description,
    "annual",
    fixed(plan.annualMonthly * 12 * 100),
  );
}
await product(
  TOP_UP_KEY,
  "Vink Top-up",
  `${TOP_UP_PAGES} extra pagina's per Top-up, tot het einde van de periode`,
  null,
  topUpPrice,
);

const { items: endpoints } = await polar.webhooks.listWebhookEndpoints({ limit: 100 });
const endpoint = endpoints.find((e) => e.url === webhookUrl);
let webhookSecret: string | undefined;
if (endpoint) {
  await polar.webhooks.updateWebhookEndpoint(endpoint.id, { events: [...WEBHOOK_EVENTS], format: "raw" });
} else {
  const created = await polar.webhooks.createWebhookEndpoint({
    url: webhookUrl,
    name: "Vink: Plans and Top-ups (convex/billing.ts)",
    // The version convex/lib/polar.ts types its events with.
    api_version: "2026-10",
    format: "raw",
    events: [...WEBHOOK_EVENTS],
  });
  webhookSecret = created.secret;
}

console.log(`\nSet on the Convex deployment:`);
console.log(`POLAR_SERVER=${server}`);
console.log(
  webhookSecret
    ? `POLAR_WEBHOOK_SECRET=${webhookSecret}`
    : `(POLAR_WEBHOOK_SECRET unchanged: the endpoint for ${webhookUrl} already existed)`,
);
