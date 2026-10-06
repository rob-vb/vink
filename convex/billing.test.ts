import { ConvexError } from "convex/values";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { addMembership, asUser, newBackend, signUp } from "./test.setup";

// A fake Stripe: what billing.ts asks of it, and what it was asked.
const fake = vi.hoisted(() => {
  const state = {
    customers: [] as { id: string; params: Record<string, unknown> }[],
    sessions: [] as { id: string; url: string; params: Record<string, unknown> }[],
    subscriptions: [] as Record<string, unknown>[],
    lineItems: new Map<string, { price: { lookup_key: string }; quantity: number }[]>(),
    portals: [] as Record<string, unknown>[],
  };
  const client = {
    customers: {
      create: async (params: Record<string, unknown>) => {
        const customer = { id: `cus_${state.customers.length + 1}`, params };
        state.customers.push(customer);
        return customer;
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
          const session = { id: `cs_${state.sessions.length + 1}`, url: "https://checkout.stripe.test", params };
          state.sessions.push(session);
          return session;
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
    },
  };
  return {
    state,
    client,
    // The "signature" is the event itself, or "bad".
    webhookEvent: async (payload: string, signature: string) => {
      if (signature === "bad") throw new Error("No signatures found matching the expected signature");
      return JSON.parse(payload);
    },
  };
});

vi.mock("./lib/stripe", () => ({ stripe: () => fake.client, webhookEvent: fake.webhookEvent }));

type Backend = ReturnType<typeof newBackend>;

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-10-06T09:00:00Z").getTime();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("SITE_URL", "https://vink.page");
  fake.state.customers = [];
  fake.state.sessions = [];
  fake.state.subscriptions = [];
  fake.state.lineItems.clear();
  fake.state.portals = [];
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
    items: {
      data: [{ price: { id: "price_x", lookup_key: "vink_team_monthly" }, current_period_end: (NOW + 31 * DAY) / 1000 }],
    },
    ...overrides,
  };
}

async function deliver(t: Backend, type: string, object: Record<string, unknown>) {
  return await t.action(internal.billing.webhook, {
    payload: JSON.stringify({ type, data: { object } }),
    signature: "t=1,v1=ok",
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

test("Checkout makes one Stripe Customer per Organisation and sells the Plan through Managed Payments", async () => {
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
    customer: "cus_1",
    line_items: [{ price: "price_vink_team_annual", quantity: 1 }],
    managed_payments: { enabled: true },
    success_url: `https://vink.page/app/o/${slug}/settings?billing=subscribed`,
  });
  // Stripe is the merchant of record: these would make Checkout refuse the session.
  for (const unsupported of [
    "payment_method_types",
    "automatic_tax",
    "tax_id_collection",
    "customer_update",
    "invoice_creation",
  ]) {
    expect(fake.state.sessions[0].params).not.toHaveProperty(unsupported);
  }
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
  });
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

  fake.state.subscriptions = [
    subscription({ items: { data: [{ price: { lookup_key: "vink_business_monthly" }, current_period_end: 0 }] } }),
  ];
  await deliver(t, "customer.subscription.updated", fake.state.subscriptions[0]);

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

  fake.state.subscriptions = [subscription({ cancel_at: endsAt / 1000, cancel_at_period_end: true })];
  await deliver(t, "customer.subscription.updated", fake.state.subscriptions[0]);
  expect(await usage(t, slug)).toMatchObject({ plan: "team", subscription: { endsAt } });

  fake.state.subscriptions = [subscription({ status: "canceled" })];
  await deliver(t, "customer.subscription.deleted", fake.state.subscriptions[0]);
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

test("a paid Top-up adds its Pages once, however often Stripe sends it", async () => {
  const t = newBackend();
  const { user, slug } = await freshSignUp(t);
  await subscribe(t, slug);

  await user.action(api.billing.topUp, { organisationSlug: slug, locale: "nl" });
  expect(fake.state.sessions[1].params).toMatchObject({
    mode: "payment",
    customer: "cus_1",
    line_items: [{ price: "price_vink_topup_100", quantity: 1 }],
    managed_payments: { enabled: true },
  });
  expect(fake.state.sessions[1].params).not.toHaveProperty("invoice_creation");

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

test("Top-ups need a Plan", async () => {
  const t = newBackend();
  const { user, slug } = await freshSignUp(t);

  await expect(user.action(api.billing.topUp, { organisationSlug: slug, locale: "nl" })).rejects.toThrow(
    ConvexError,
  );
});

test("an Organisation that already pays gets no second Subscription", async () => {
  const t = newBackend();
  const { user, slug } = await freshSignUp(t);
  await subscribe(t, slug);

  await expect(
    user.action(api.billing.checkout, { organisationSlug: slug, plan: "business", interval: "monthly", locale: "nl" }),
  ).rejects.toThrow(ConvexError);
  expect(await user.action(api.billing.portal, { organisationSlug: slug, locale: "nl" })).toBe(
    "https://billing.stripe.test",
  );
  expect(fake.state.portals[0]).toMatchObject({
    customer: "cus_1",
    return_url: `https://vink.page/app/o/${slug}/settings?billing=portal`,
  });
});

test("a webhook with a bad signature is refused", async () => {
  const t = newBackend();

  const handled = await t.action(internal.billing.webhook, { payload: "{}", signature: "bad" });

  expect(handled).toBe(false);
});
