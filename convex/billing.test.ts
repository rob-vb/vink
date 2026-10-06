import Stripe from "stripe";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { addMembership, asUser, newBackend, signUp } from "./test.setup";

// A fake Stripe: what billing.ts asks of it, and what it was asked. Webhooks
// go through the real signature check (lib/stripe.ts), signed with SECRET.
const fake = vi.hoisted(() => {
  const state = {
    customers: [] as { id: string; params: Record<string, unknown> }[],
    sessions: [] as { id: string; url: string; status: string; params: Record<string, unknown> }[],
    subscriptions: [] as Record<string, unknown>[],
    lineItems: new Map<string, { price: { lookup_key: string }; quantity: number }[]>(),
    portals: [] as Record<string, unknown>[],
    cancelled: [] as string[],
    taxIdsDeleted: [] as string[],
    voided: [] as string[],
  };
  const client = {
    customers: {
      create: async (params: Record<string, unknown>) => {
        const customer = { id: `cus_${state.customers.length + 1}`, params };
        state.customers.push(customer);
        return customer;
      },
      deleteTaxId: async (customer: string, id: string) => {
        state.taxIdsDeleted.push(`${customer}/${id}`);
        return { id, deleted: true };
      },
    },
    prices: {
      list: async ({ lookup_keys }: { lookup_keys: string[] }) => ({
        data: [{ id: `price_${lookup_keys[0]}` }],
      }),
    },
    checkout: {
      sessions: {
        create: async (params: Record<string, unknown>) => {
          const id = `cs_${state.sessions.length + 1}`;
          const session = { id, url: "https://checkout.stripe.test", status: "open", params };
          state.sessions.push(session);
          return session;
        },
        list: async ({ customer, status }: { customer: string; status: string }) => ({
          data: state.sessions
            .filter((s) => s.params.customer === customer && s.status === status)
            .map((s) => ({ id: s.id, mode: s.params.mode })),
        }),
        expire: async (id: string) => {
          state.sessions.find((s) => s.id === id)!.status = "expired";
          return { id, status: "expired" };
        },
        listLineItems: async (id: string) => ({ data: state.lineItems.get(id) ?? [] }),
      },
    },
    billingPortal: {
      sessions: {
        create: async (params: Record<string, unknown>) => {
          state.portals.push(params);
          return { url: "https://billing.stripe.test" };
        },
      },
    },
    subscriptions: {
      list: async ({ customer }: { customer: string }) => ({
        data: state.subscriptions.filter((s) => s.customer === customer),
      }),
      cancel: async (id: string) => {
        if (state.cancelled.includes(id)) throw new Error("This subscription is already canceled");
        state.cancelled.push(id);
        return { id, status: "canceled", latest_invoice: { id: "in_1", status: "open" } };
      },
      retrieve: async (id: string) => ({
        id,
        status: state.cancelled.includes(id) ? "canceled" : "active",
        latest_invoice: { id: "in_1", status: state.voided.includes("in_1") ? "void" : "open" },
      }),
    },
    invoices: {
      voidInvoice: async (id: string) => {
        state.voided.push(id);
        return { id, status: "void" };
      },
    },
  };
  return { state, client };
});

vi.mock("./lib/stripe", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./lib/stripe")>()),
  stripe: () => fake.client,
}));

type Backend = ReturnType<typeof newBackend>;

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-10-06T09:00:00Z").getTime();
const SECRET = "whsec_test_secret";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("SITE_URL", "https://vink.page");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", SECRET);
  vi.stubEnv("STRIPE_PAYMENT_METHOD_CONFIGURATION", "pmc_vink");
  vi.stubEnv("STRIPE_PORTAL_CONFIGURATION", "bpc_vink");
  fake.state.customers = [];
  fake.state.sessions = [];
  fake.state.subscriptions = [];
  fake.state.lineItems.clear();
  fake.state.portals = [];
  fake.state.cancelled = [];
  fake.state.taxIdsDeleted = [];
  fake.state.voided = [];
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function freshSignUp(t: Backend) {
  return await signUp(t, "ann", "Kantoor Noord", { plan: null });
}

function usage(t: Backend, slug: string) {
  return asUser(t, "ann").query(api.pages.usage, { organisationSlug: slug });
}

function subscription(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub_1",
    customer: "cus_1",
    status: "active",
    cancel_at: null,
    cancel_at_period_end: false,
    billing_cycle_anchor: NOW / 1000,
    latest_invoice: { id: "in_1", billing_reason: "subscription_create", status: "paid" },
    items: {
      data: [{ price: { id: "price_x", lookup_key: "vink_team_monthly" }, current_period_end: (NOW + 31 * DAY) / 1000 }],
    },
    ...overrides,
  };
}

/** Signs like Stripe and hands the event to the webhook action. */
async function deliver(t: Backend, type: string, object: Record<string, unknown>, secret = SECRET) {
  const payload = JSON.stringify({ id: `evt_${Math.random()}`, object: "event", type, data: { object } });
  return await t.action(internal.billing.webhook, {
    payload,
    signature: Stripe.webhooks.generateTestHeaderString({ payload, secret }),
  });
}

async function subscribe(t: Backend, slug: string, overrides: Record<string, unknown> = {}) {
  await asUser(t, "ann").action(api.billing.checkout, {
    organisationSlug: slug,
    plan: "team",
    interval: "monthly",
    locale: "nl",
  });
  fake.state.subscriptions = [subscription(overrides)];
  await deliver(t, "customer.subscription.created", fake.state.subscriptions[0]);
}

/** A Subscription in Stripe changed: the webhook says so. */
async function change(t: Backend, overrides: Record<string, unknown>, type = "customer.subscription.updated") {
  fake.state.subscriptions = [subscription(overrides)];
  await deliver(t, type, fake.state.subscriptions[0]);
}

// What Stripe Tax needs on every Checkout: Vink is the seller.
const taxed = {
  customer: "cus_1",
  automatic_tax: { enabled: true },
  tax_id_collection: { enabled: true },
  billing_address_collection: "required",
  customer_update: { name: "auto", address: "auto" },
  payment_method_configuration: "pmc_vink",
};

test("Checkout makes one Stripe Customer per Organisation and sells the Plan with Stripe Tax", async () => {
  const t = newBackend();
  const { user, slug } = await freshSignUp(t);

  const url = await user.action(api.billing.checkout, {
    organisationSlug: slug,
    plan: "team",
    interval: "annual",
    locale: "nl",
  });
  await user.action(api.billing.checkout, {
    organisationSlug: slug,
    plan: "starter",
    interval: "monthly",
    locale: "nl",
  });

  expect(url).toBe("https://checkout.stripe.test");
  expect(fake.state.customers).toHaveLength(1);
  expect(fake.state.customers[0].params).toMatchObject({ name: "Kantoor Noord", email: "ann@example.com" });
  expect(fake.state.sessions[0].params).toMatchObject({
    mode: "subscription",
    line_items: [{ price: "price_vink_team_annual", quantity: 1 }],
    ...taxed,
    locale: "nl",
    success_url: `https://vink.page/app/o/${slug}/settings?billing=subscribed`,
    cancel_url: `https://vink.page/app/o/${slug}/settings?billing=cancelled`,
  });
  // Payment methods come from the Payment Method Configuration; no Managed Payments.
  expect(fake.state.sessions[0].params).not.toHaveProperty("payment_method_types");
  expect(fake.state.sessions[0].params).not.toHaveProperty("managed_payments");
});

test("a new Plan Checkout closes one still open in another tab, so only one can be paid", async () => {
  const t = newBackend();
  const { user, slug } = await freshSignUp(t);
  const plan = { organisationSlug: slug, interval: "monthly", locale: "nl" } as const;

  await user.action(api.billing.checkout, { ...plan, plan: "team" });
  await user.action(api.billing.checkout, { ...plan, plan: "business" });

  expect(fake.state.sessions.map((s) => s.status)).toEqual(["expired", "open"]);
});

test("only Admins can open Checkout or the Customer Portal", async () => {
  const t = newBackend();
  const { slug } = await freshSignUp(t);
  await addMembership(t, "bob", slug, "member");
  const bob = asUser(t, "bob");

  await expect(
    bob.action(api.billing.checkout, { organisationSlug: slug, plan: "team", interval: "monthly", locale: "en" }),
  ).rejects.toThrow(ConvexError);
  await expect(bob.action(api.billing.portal, { organisationSlug: slug, locale: "en" })).rejects.toThrow(
    ConvexError,
  );
  expect(fake.state.sessions).toHaveLength(0);
});

test("a new Subscription puts the Organisation on its Plan, with a monthly Pages period", async () => {
  const t = newBackend();
  const { slug } = await freshSignUp(t);

  await subscribe(t, slug);

  expect(await usage(t, slug)).toMatchObject({
    plan: "team",
    allowance: 1000,
    allowanceLeft: 1000,
    freePages: 20,
    remaining: 1020,
    resetsAt: new Date("2026-11-06T09:00:00Z").getTime(),
    subscription: { interval: "monthly", endsAt: null },
    hasBillingCustomer: true,
  });
});

test("a Subscription waiting for its first bank payment gives the Plan only once paid", async () => {
  const t = newBackend();
  const { slug } = await freshSignUp(t);

  await subscribe(t, slug, { status: "incomplete" });
  expect(await usage(t, slug)).toMatchObject({ plan: null, subscription: null });

  await change(t, { status: "active" });
  expect(await usage(t, slug)).toMatchObject({ plan: "team", allowance: 1000 });
});

test("a first bank payment that bounces takes the Plan back and cancels the Subscription", async () => {
  const t = newBackend();
  const { slug } = await freshSignUp(t);

  // SEPA Direct Debit: active while the first payment is on its way.
  await subscribe(t, slug, { latest_invoice: { billing_reason: "subscription_create", status: "open" } });
  expect(await usage(t, slug)).toMatchObject({ plan: "team" });

  // It bounced: Stripe voids the invoice, the Subscription stays active.
  fake.state.subscriptions = [subscription({ latest_invoice: { billing_reason: "subscription_create", status: "void" } })];
  await deliver(t, "invoice.voided", { id: "in_1", customer: "cus_1" });

  expect(await usage(t, slug)).toMatchObject({ plan: null, subscription: null });
  expect(fake.state.cancelled).toEqual(["sub_1"]);
});

test("a Plan whose first bank payment fails at Checkout is cancelled", async () => {
  const t = newBackend();
  const { slug } = await freshSignUp(t);
  await subscribe(t, slug, { latest_invoice: { billing_reason: "subscription_create", status: "open" } });

  fake.state.subscriptions = [subscription({ status: "canceled" })];
  await deliver(t, "checkout.session.async_payment_failed", {
    id: "cs_1",
    mode: "subscription",
    payment_status: "unpaid",
    customer: "cus_1",
    subscription: "sub_1",
  });
  // The webhook of the cancel itself, or a second try: nothing more happens.
  await deliver(t, "checkout.session.async_payment_failed", {
    id: "cs_1",
    mode: "subscription",
    payment_status: "unpaid",
    customer: "cus_1",
    subscription: "sub_1",
  });

  expect(fake.state.cancelled).toEqual(["sub_1"]);
  // Its first invoice can't be paid any more.
  expect(fake.state.voided).toEqual(["in_1"]);
  expect(await usage(t, slug)).toMatchObject({ plan: null, subscription: null });
});

test("a later renewal that is not paid yet keeps the Plan", async () => {
  const t = newBackend();
  const { slug } = await freshSignUp(t);
  await subscribe(t, slug);

  await change(t, { latest_invoice: { billing_reason: "subscription_cycle", status: "open" } });

  expect(await usage(t, slug)).toMatchObject({ plan: "team" });
  expect(fake.state.cancelled).toEqual([]);
});

test("an annual Subscription still renews its Pages every month", async () => {
  const t = newBackend();
  const { slug } = await freshSignUp(t);

  await subscribe(t, slug, {
    items: { data: [{ price: { lookup_key: "vink_starter_annual" }, current_period_end: (NOW + 365 * DAY) / 1000 }] },
  });

  expect(await usage(t, slug)).toMatchObject({
    plan: "starter",
    allowance: 300,
    resetsAt: new Date("2026-11-06T09:00:00Z").getTime(),
    subscription: { interval: "annual" },
  });
});

test("the same webhook twice changes nothing more", async () => {
  const t = newBackend();
  const { slug } = await freshSignUp(t);
  await subscribe(t, slug);
  await t.run(async (ctx) => {
    const organisation = (await ctx.db.query("organisations").first())!;
    await ctx.db.patch(organisation._id, { pages: { ...organisation.pages!, allowanceUsed: 400, used: 400 } });
  });

  await deliver(t, "customer.subscription.updated", fake.state.subscriptions[0]);
  await deliver(t, "invoice.paid", { id: "in_1", customer: "cus_1" });

  expect(await usage(t, slug)).toMatchObject({ plan: "team", allowanceLeft: 600 });
});

test("a change of Plan keeps the period and the Pages used", async () => {
  const t = newBackend();
  const { slug } = await freshSignUp(t);
  await subscribe(t, slug);
  await t.run(async (ctx) => {
    const organisation = (await ctx.db.query("organisations").first())!;
    await ctx.db.patch(organisation._id, { pages: { ...organisation.pages!, allowanceUsed: 900, used: 900 } });
  });
  const before = await usage(t, slug);

  await change(t, { items: { data: [{ price: { lookup_key: "vink_business_monthly" }, current_period_end: 0 }] } });

  expect(await usage(t, slug)).toMatchObject({
    plan: "business",
    allowance: 3000,
    allowanceLeft: 2100,
    resetsAt: before.resetsAt,
  });
});

test("a cancelled Subscription runs to its end, then the Organisation is back on Free Pages", async () => {
  const t = newBackend();
  const { slug } = await freshSignUp(t);
  await subscribe(t, slug);
  const endsAt = NOW + 31 * DAY;

  // Cancelled in the Portal: still active, until the period ends.
  await change(t, { cancel_at: endsAt / 1000, cancel_at_period_end: true });
  expect(await usage(t, slug)).toMatchObject({ plan: "team", subscription: { endsAt } });

  await change(t, { status: "canceled" }, "customer.subscription.deleted");
  expect(await usage(t, slug)).toMatchObject({
    plan: null,
    allowance: 0,
    topUpPages: 0,
    freePages: 20,
    remaining: 20,
    resetsAt: null,
    subscription: null,
  });
});

test("a failed renewal keeps the Plan while Stripe retries; unpaid ends it", async () => {
  const t = newBackend();
  const { slug } = await freshSignUp(t);
  await subscribe(t, slug);

  await change(t, { status: "past_due" });
  expect(await usage(t, slug)).toMatchObject({ plan: "team" });

  await change(t, { status: "unpaid" });
  expect(await usage(t, slug)).toMatchObject({ plan: null, subscription: null });
});

test("a paid Top-up adds its Pages once, however often Stripe sends it", async () => {
  const t = newBackend();
  const { user, slug } = await freshSignUp(t);
  await subscribe(t, slug);

  await user.action(api.billing.topUp, { organisationSlug: slug, locale: "nl" });
  expect(fake.state.sessions[1].params).toMatchObject({
    mode: "payment",
    line_items: [
      {
        price: "price_vink_topup_100",
        quantity: 1,
        adjustable_quantity: { enabled: true, minimum: 1, maximum: 10 },
      },
    ],
    invoice_creation: { enabled: true },
    ...taxed,
    success_url: `https://vink.page/app/o/${slug}/settings?billing=topped-up`,
  });
  expect(fake.state.sessions[1].params).not.toHaveProperty("payment_method_types");

  fake.state.lineItems.set("cs_2", [{ price: { lookup_key: "vink_topup_100" }, quantity: 3 }]);
  const session = { id: "cs_2", mode: "payment", payment_status: "paid", customer: "cus_1" };
  await deliver(t, "checkout.session.completed", session);
  await deliver(t, "checkout.session.completed", session);

  expect(await usage(t, slug)).toMatchObject({ topUpPages: 300, remaining: 1320 });
});

test("a Top-up paid by bank later is added when the payment succeeds", async () => {
  const t = newBackend();
  const { slug } = await freshSignUp(t);
  await subscribe(t, slug);
  fake.state.lineItems.set("cs_9", [{ price: { lookup_key: "vink_topup_100" }, quantity: 1 }]);

  await deliver(t, "checkout.session.completed", { id: "cs_9", mode: "payment", payment_status: "unpaid", customer: "cus_1" });
  expect(await usage(t, slug)).toMatchObject({ topUpPages: 0 });

  await deliver(t, "checkout.session.async_payment_succeeded", {
    id: "cs_9",
    mode: "payment",
    payment_status: "paid",
    customer: "cus_1",
  });
  expect(await usage(t, slug)).toMatchObject({ topUpPages: 100 });
});

test("a paid Checkout without Top-ups adds no Pages", async () => {
  const t = newBackend();
  const { slug } = await freshSignUp(t);
  await subscribe(t, slug);
  fake.state.lineItems.set("cs_5", [{ price: { lookup_key: "something_else" }, quantity: 2 }]);

  await deliver(t, "checkout.session.completed", { id: "cs_5", mode: "payment", payment_status: "paid", customer: "cus_1" });

  expect(await usage(t, slug)).toMatchObject({ topUpPages: 0 });
});

test("Top-ups need a Plan", async () => {
  const t = newBackend();
  const { user, slug } = await freshSignUp(t);

  await expect(user.action(api.billing.topUp, { organisationSlug: slug, locale: "nl" })).rejects.toThrow(
    ConvexError,
  );
});

test("the Customer Portal needs a Stripe Customer first", async () => {
  const t = newBackend();
  const { user, slug } = await freshSignUp(t);

  await expect(user.action(api.billing.portal, { organisationSlug: slug, locale: "nl" })).rejects.toThrow(
    ConvexError,
  );
});

test("an Organisation that already pays gets no second Subscription, but the Portal", async () => {
  const t = newBackend();
  const { user, slug } = await freshSignUp(t);
  await subscribe(t, slug);

  await expect(
    user.action(api.billing.checkout, { organisationSlug: slug, plan: "business", interval: "monthly", locale: "nl" }),
  ).rejects.toThrow(ConvexError);
  expect(await user.action(api.billing.portal, { organisationSlug: slug, locale: "nl" })).toBe(
    "https://billing.stripe.test",
  );
  expect(fake.state.portals[0]).toEqual({
    customer: "cus_1",
    locale: "nl",
    return_url: `https://vink.page/app/o/${slug}/settings?billing=portal`,
    configuration: "bpc_vink",
  });
});

test("a Customer that is no Organisation changes nothing", async () => {
  const t = newBackend();
  const { slug } = await freshSignUp(t);

  fake.state.subscriptions = [subscription({ customer: "cus_9" })];
  expect(await deliver(t, "customer.subscription.created", fake.state.subscriptions[0])).toBe(true);

  expect(await usage(t, slug)).toMatchObject({ plan: null, hasBillingCustomer: false });
});

test("a Subscription that is no Plan (made in the Dashboard) is taken and ignored", async () => {
  const t = newBackend();
  const { slug } = await freshSignUp(t);
  await subscribe(t, slug);

  fake.state.subscriptions = [
    subscription({ id: "sub_custom", items: { data: [{ price: { id: "price_custom", lookup_key: null }, current_period_end: 0 }] } }),
    ...fake.state.subscriptions,
  ];
  expect(await deliver(t, "customer.subscription.created", fake.state.subscriptions[0])).toBe(true);

  expect(await usage(t, slug)).toMatchObject({ plan: "team" });
});

test("an older read of Stripe never overwrites a newer one", async () => {
  const t = newBackend();
  const { slug } = await freshSignUp(t);
  await subscribe(t, slug);

  // A webhook that read Stripe before the cancel, finishing after it.
  await t.mutation(internal.billingState.applySubscription, { customerId: "cus_1", listedAt: NOW + 2, subscription: null });
  await t.mutation(internal.billingState.applySubscription, {
    customerId: "cus_1",
    listedAt: NOW + 1,
    subscription: { id: "sub_1", status: "active", plan: "team", interval: "monthly", endsAt: null, anchor: NOW },
  });

  expect(await usage(t, slug)).toMatchObject({ plan: null, subscription: null });
});

test("a VAT number VIES calls unverified is removed; a verified one stays", async () => {
  const t = newBackend();

  const taxId = (id: string, status: string) => ({
    id,
    object: "tax_id",
    customer: "cus_1",
    type: "eu_vat",
    value: "DE111111111",
    verification: { status },
  });
  await deliver(t, "customer.tax_id.created", taxId("txi_1", "pending"));
  await deliver(t, "customer.tax_id.updated", taxId("txi_1", "verified"));
  await deliver(t, "customer.tax_id.updated", taxId("txi_2", "unverified"));

  expect(fake.state.taxIdsDeleted).toEqual(["cus_1/txi_2"]);
});

test("a Top-up from a Customer that is no Organisation is taken and ignored", async () => {
  const t = newBackend();
  const { slug } = await freshSignUp(t);
  await subscribe(t, slug);
  fake.state.lineItems.set("cs_7", [{ price: { lookup_key: "vink_topup_100" }, quantity: 1 }]);

  const stranger = { id: "cs_7", mode: "payment", payment_status: "paid", customer: "cus_9" };
  expect(await deliver(t, "checkout.session.completed", stranger)).toBe(true);

  expect(await usage(t, slug)).toMatchObject({ topUpPages: 0 });
});

test("a webhook with a bad signature is refused", async () => {
  const t = newBackend();
  const { slug } = await freshSignUp(t);
  fake.state.subscriptions = [subscription()];

  expect(await deliver(t, "customer.subscription.created", fake.state.subscriptions[0], "whsec_wrong")).toBe(false);
  expect(await usage(t, slug)).toMatchObject({ plan: null });
});

test("a signed event Vink doesn't handle is taken and ignored", async () => {
  const t = newBackend();

  expect(await deliver(t, "customer.created", { id: "cus_1" })).toBe(true);
});

test("the webhook route answers 200 when signed, 400 when not", async () => {
  const t = newBackend();
  const payload = JSON.stringify({ id: "evt_1", object: "event", type: "customer.created", data: { object: {} } });
  const post = (headers: Record<string, string>) =>
    t.fetch("/stripe/webhook", { method: "POST", body: payload, headers });

  expect((await post({ "stripe-signature": Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET }) })).status).toBe(200);
  expect((await post({ "stripe-signature": "t=1,v1=forged" })).status).toBe(400);
  expect((await post({})).status).toBe(400);
});
