"use node";
// Billing through Stripe: Checkout for a Plan or a Top-up, the Customer Portal
// to change or cancel, and the webhook that turns Stripe's state into the
// Organisation's Plan (billingState.ts). Vink is the seller; Stripe Tax works
// out the VAT. Custom Plans stay by hand (items.ts). See ADR 0007.
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
  TOP_UP_ITEMS,
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
  let customer: Stripe.Customer;
  try {
    // The idempotency key makes two quick clicks one Customer.
    customer = await stripe().customers.create(
      {
        name: organisation.name,
        email: identity?.email ?? undefined,
        metadata: { organisationId },
      },
      { idempotencyKey: `customer-${organisationId}` },
    );
  } catch (error) {
    // Another Admin, at the same moment, with another email: theirs counts.
    if ((error as { type?: string }).type !== "StripeIdempotencyError") throw error;
    const again = await ctx.runQuery(internal.billingState.organisation, { organisationId });
    if (again.stripeCustomerId) return again.stripeCustomerId;
    throw new ConvexError("busy");
  }
  return await ctx.runMutation(internal.billingState.setStripeCustomer, {
    organisationId,
    customerId: customer.id,
  });
}

async function priceId(lookupKey: string) {
  const prices = await stripe().prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
  const price = prices.data[0];
  if (!price) throw new Error(`No active Stripe Price ${lookupKey}; run scripts/stripe-setup.mts`);
  return price.id;
}

// What every Checkout shares. Vink sells to businesses and is the seller:
// Stripe Tax adds the VAT for the billing address, and an EU VAT number from
// another country makes it reverse charge (see the tax ID webhook below). Checkout saves the name, address and VAT number on
// the Customer, so renewals and the next Top-up are taxed the same. The
// payment methods come from the Payment Method Configuration that
// scripts/stripe-setup.mts makes, never from a list here.
function checkoutFor(customer: string, slug: string, locale: string, outcome: string) {
  return {
    customer,
    automatic_tax: { enabled: true },
    tax_id_collection: { enabled: true },
    billing_address_collection: "required",
    customer_update: { name: "auto", address: "auto" },
    payment_method_configuration: process.env.STRIPE_PAYMENT_METHOD_CONFIGURATION || undefined,
    locale: locale as Stripe.Checkout.SessionCreateParams.Locale,
    success_url: settingsUrl(slug, outcome),
    cancel_url: settingsUrl(slug, "cancelled"),
  } satisfies Partial<Stripe.Checkout.SessionCreateParams>;
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
    const customer = await customerFor(ctx, ctx.organisationId, organisation);
    // One Plan Checkout at a time: one left open in another tab would make a
    // second Subscription.
    const open = await stripe().checkout.sessions.list({ customer, status: "open", limit: 100 });
    for (const session of open.data.filter((s) => s.mode === "subscription")) {
      await stripe().checkout.sessions.expire(session.id);
    }
    const session = await stripe().checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: await priceId(planLookupKey(plan, interval)), quantity: 1 }],
      ...checkoutFor(customer, organisation.slug, locale, "subscribed"),
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
      line_items: [
        {
          price: await priceId(TOP_UP_LOOKUP_KEY),
          quantity: 1,
          adjustable_quantity: { enabled: true, minimum: 1, maximum: TOP_UP_MAX_QUANTITY },
        },
      ],
      // A Plan's invoices come with the Subscription; a Top-up needs its own.
      invoice_creation: { enabled: true },
      ...checkoutFor(customer, organisation.slug, locale, "topped-up"),
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

// A first payment by SEPA Direct Debit takes days, and the Subscription is
// active meanwhile, so the Plan starts at once. If that payment bounces,
// Stripe voids the first invoice but leaves the Subscription active.
function firstPaymentFailed(subscription: Stripe.Subscription) {
  const invoice = subscription.latest_invoice;
  return (
    typeof invoice === "object" &&
    invoice !== null &&
    invoice.billing_reason === "subscription_create" &&
    invoice.status === "void"
  );
}

/**
 * Cancels a Subscription that was never paid, and voids its first invoice so
 * nobody can pay it for nothing; fine if another webhook already did.
 */
async function cancelUnpaid(subscriptionId: string) {
  let subscription: Stripe.Subscription;
  try {
    subscription = await stripe().subscriptions.cancel(subscriptionId, { expand: ["latest_invoice"] });
  } catch (error) {
    subscription = await stripe().subscriptions.retrieve(subscriptionId, { expand: ["latest_invoice"] });
    if (subscription.status !== "canceled") throw error;
  }
  const invoice = subscription.latest_invoice;
  if (typeof invoice === "object" && invoice?.status === "open") await stripe().invoices.voidInvoice(invoice.id!);
}

/** Hands the Customer's current Subscription, if any still runs, to billingState. */
async function syncCustomer(ctx: ActionCtx, customerId: string) {
  const listedAt = Date.now();
  const { data } = await stripe().subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 10,
    expand: ["data.latest_invoice"],
  });
  // Vink's Plans only: a Subscription made in the Dashboard (for a Custom
  // Plan, say) is no business of this webhook.
  const plans = data.flatMap((subscription) => {
    const item = subscription.items.data[0];
    const bought = item ? planOfLookupKey(item.price.lookup_key) : null;
    return item && bought && isLive(subscription.status) ? [{ subscription, item, bought }] : [];
  });
  for (const { subscription } of plans.filter((p) => firstPaymentFailed(p.subscription))) {
    await cancelUnpaid(subscription.id);
  }
  const live = plans.filter((p) => !firstPaymentFailed(p.subscription));
  if (live.length > 1) {
    console.error(
      `Stripe Customer ${customerId} pays for ${live.length} Plans: ${live.map((p) => p.subscription.id).join(", ")}`,
    );
  }
  // Stripe lists the newest first.
  const current = live[0];
  await ctx.runMutation(internal.billingState.applySubscription, {
    customerId,
    listedAt,
    subscription: current
      ? {
          id: current.subscription.id,
          status: current.subscription.status,
          plan: current.bought.plan,
          interval: current.bought.interval,
          endsAt:
            current.subscription.cancel_at !== null
              ? current.subscription.cancel_at * 1000
              : current.subscription.cancel_at_period_end
                ? current.item.current_period_end * 1000
                : null,
          anchor: current.subscription.billing_cycle_anchor * 1000,
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
    items: quantity * TOP_UP_ITEMS,
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
      case "checkout.session.async_payment_failed": {
        // A Plan's first bank payment bounced: the Subscription never ran.
        const session = event.data.object;
        if (session.mode === "subscription" && session.subscription) {
          await cancelUnpaid(idOf(session.subscription));
        }
        if (session.customer) await syncCustomer(ctx, idOf(session.customer));
        break;
      }
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object;
        if (session.customer === null) break;
        if (session.mode === "subscription") await syncCustomer(ctx, idOf(session.customer));
        // A bank payment (SEPA Direct Debit) can complete unpaid and succeed later.
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
      case "invoice.voided":
        // Stripe retries a failed payment and emails the customer; the
        // Subscription's status (past_due, then cancelled) carries the outcome.
        if (event.data.object.customer) await syncCustomer(ctx, idOf(event.data.object.customer));
        break;
      case "customer.tax_id.created":
      case "customer.tax_id.updated": {
        // Stripe Tax reverse-charges any well-formed EU VAT number; VIES checks
        // it afterwards. A number VIES calls unverified is removed, so later
        // invoices carry VAT; the ones already sent need a look by hand.
        const taxId = event.data.object;
        if (taxId.verification?.status !== "unverified" || !taxId.customer) break;
        const customerId = idOf(taxId.customer);
        try {
          await stripe().customers.deleteTaxId(customerId, taxId.id);
        } catch (error) {
          if ((error as { code?: string }).code !== "resource_missing") throw error;
        }
        console.error(
          `VAT number ${taxId.value} of Stripe Customer ${customerId} failed VIES and was removed; check its reverse-charged invoices`,
        );
        break;
      }
    }
    return true;
  },
});

/**
 * Stops every Subscription of a Customer that still runs, at once and without
 * a refund (Terms), when its Organisation is deleted. The Customer and its
 * invoices stay in Stripe: the books keep them for 7 years.
 */
export const cancelPlans = internalAction({
  args: { customerId: v.string() },
  handler: async (_ctx, { customerId }) => {
    const { data } = await stripe().subscriptions.list({ customer: customerId, status: "all", limit: 100 });
    for (const subscription of data) {
      if (subscription.status === "canceled" || subscription.status === "incomplete_expired") continue;
      await stripe().subscriptions.cancel(subscription.id);
    }
  },
});
