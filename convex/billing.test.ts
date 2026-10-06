import { createHmac } from "node:crypto";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { addMembership, asUser, newBackend, signUp } from "./test.setup";

// A fake Polar: what billing.ts asks of it, and what it was asked. Webhooks
// go through the real signature check (lib/polar.ts), signed with SECRET.
const fake = vi.hoisted(() => {
  const state = {
    checkouts: [] as Record<string, unknown>[],
    subscriptions: [] as Record<string, unknown>[],
    portals: [] as Record<string, unknown>[],
  };
  const client = {
    products: {
      list: async ({ metadata }: { metadata: { vink_key: string } }) => ({
        items: [{ id: `prod_${metadata.vink_key}` }],
      }),
    },
    checkouts: {
      create: async (params: Record<string, unknown>) => {
        state.checkouts.push(params);
        return { id: `co_${state.checkouts.length}`, url: "https://sandbox.polar.test/checkout" };
      },
    },
    customerSessions: {
      create: async (params: Record<string, unknown>) => {
        state.portals.push(params);
        return { customer_portal_url: "https://sandbox.polar.test/portal" };
      },
    },
    subscriptions: {
      list: async ({ customer_id }: { customer_id: string }) => ({
        items: state.subscriptions.filter((s) => s.customer_id === customer_id),
      }),
    },
  };
  return { state, client };
});

vi.mock("./lib/polar", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./lib/polar")>()),
  polar: () => fake.client,
}));

type Backend = ReturnType<typeof newBackend>;

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-10-06T09:00:00Z").getTime();
const SECRET = `whsec_${Buffer.from("a test secret of thirty-two bytes").toString("base64")}`;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("SITE_URL", "https://vink.page");
  vi.stubEnv("POLAR_WEBHOOK_SECRET", SECRET);
  fake.state.checkouts = [];
  fake.state.subscriptions = [];
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

async function organisationId(t: Backend) {
  return await t.run(async (ctx) => (await ctx.db.query("organisations").first())!._id);
}

function customer(externalId: string) {
  return { id: "cust_1", external_id: externalId };
}

async function subscription(t: Backend, overrides: Record<string, unknown> = {}) {
  return {
    id: "sub_1",
    customer_id: "cust_1",
    customer: customer(await organisationId(t)),
    status: "active",
    cancel_at_period_end: false,
    ends_at: null,
    started_at: new Date(NOW).toISOString(),
    current_period_start: new Date(NOW).toISOString(),
    current_period_end: new Date(NOW + 31 * DAY).toISOString(),
    product_id: "prod_vink_team_monthly",
    product: { metadata: { vink_key: "vink_team_monthly" } },
    ...overrides,
  };
}

/** Signs like Polar (Standard Webhooks) and hands the event to the webhook action. */
async function deliver(t: Backend, type: string, data: Record<string, unknown>, secret = SECRET) {
  const payload = JSON.stringify({ type, timestamp: new Date(NOW).toISOString(), data });
  const id = `msg_${Math.random()}`;
  const timestamp = String(Math.floor(NOW / 1000));
  const key = Buffer.from(secret.slice("whsec_".length), "base64");
  const signature = createHmac("sha256", key).update(`${id}.${timestamp}.${payload}`).digest("base64");
  return await t.action(internal.billing.webhook, {
    payload,
    headers: { id, timestamp, signature: `v1,${signature}` },
  });
}

async function subscribe(t: Backend, slug: string, overrides: Record<string, unknown> = {}) {
  await asUser(t, "ann").action(api.billing.checkout, {
    organisationSlug: slug,
    plan: "team",
    interval: "monthly",
    locale: "nl",
  });
  fake.state.subscriptions = [await subscription(t, overrides)];
  await deliver(t, "subscription.created", fake.state.subscriptions[0]);
}

/** A Subscription in Polar changed: the webhook says so. */
async function change(t: Backend, overrides: Record<string, unknown>) {
  fake.state.subscriptions = [await subscription(t, overrides)];
  await deliver(t, "subscription.updated", fake.state.subscriptions[0]);
}

async function topUpOrder(t: Backend, overrides: Record<string, unknown> = {}) {
  return {
    id: "ord_1",
    status: "paid",
    units: 3,
    customer: customer(await organisationId(t)),
    product: { metadata: { vink_key: "vink_topup_100" } },
    ...overrides,
  };
}

test("Checkout sells the Plan to the Organisation, as a business, through Polar", async () => {
  const t = newBackend();
  const { user, slug } = await freshSignUp(t);

  const url = await user.action(api.billing.checkout, {
    organisationSlug: slug,
    plan: "team",
    interval: "annual",
    locale: "nl",
  });

  expect(url).toBe("https://sandbox.polar.test/checkout");
  expect(fake.state.checkouts[0]).toEqual({
    products: ["prod_vink_team_annual"],
    // Polar makes the Customer at the first Checkout and finds it again by this.
    external_customer_id: await organisationId(t),
    customer_email: "ann@example.com",
    customer_billing_name: "Kantoor Noord",
    is_business_customer: true,
    allow_discount_codes: false,
    locale: "nl",
    success_url: `https://vink.page/app/o/${slug}/settings?billing=subscribed`,
    return_url: `https://vink.page/app/o/${slug}/settings?billing=cancelled`,
  });
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
  expect(fake.state.checkouts).toHaveLength(0);
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

test("an annual Subscription still renews its Pages every month", async () => {
  const t = newBackend();
  const { slug } = await freshSignUp(t);

  await subscribe(t, slug, {
    product: { metadata: { vink_key: "vink_starter_annual" } },
    current_period_end: new Date(NOW + 365 * DAY).toISOString(),
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

  await deliver(t, "subscription.updated", fake.state.subscriptions[0]);

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

  await change(t, { product: { metadata: { vink_key: "vink_business_monthly" } } });

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
  await change(t, { cancel_at_period_end: true, ends_at: new Date(endsAt).toISOString() });
  expect(await usage(t, slug)).toMatchObject({ plan: "team", subscription: { endsAt } });

  // The period ended: Polar revokes it.
  await change(t, { status: "canceled", ended_at: new Date(endsAt).toISOString() });
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

test("a failed renewal keeps the Plan while Polar retries; unpaid ends it", async () => {
  const t = newBackend();
  const { slug } = await freshSignUp(t);
  await subscribe(t, slug);

  await change(t, { status: "past_due" });
  expect(await usage(t, slug)).toMatchObject({ plan: "team" });

  await change(t, { status: "unpaid" });
  expect(await usage(t, slug)).toMatchObject({ plan: null, subscription: null });
});

test("a paid Top-up adds its Pages once, however often Polar sends it", async () => {
  const t = newBackend();
  const { user, slug } = await freshSignUp(t);
  await subscribe(t, slug);

  await user.action(api.billing.topUp, { organisationSlug: slug, locale: "nl" });
  expect(fake.state.checkouts[1]).toMatchObject({
    products: ["prod_vink_topup_100"],
    min_units: 1,
    max_units: 10,
    external_customer_id: await organisationId(t),
    success_url: `https://vink.page/app/o/${slug}/settings?billing=topped-up`,
  });

  const order = await topUpOrder(t);
  await deliver(t, "order.paid", order);
  await deliver(t, "order.paid", order);

  expect(await usage(t, slug)).toMatchObject({ topUpPages: 300, remaining: 1320 });
});

test("a paid Plan Order is no Top-up", async () => {
  const t = newBackend();
  const { slug } = await freshSignUp(t);
  await subscribe(t, slug);

  await deliver(t, "order.paid", await topUpOrder(t, { units: null, product: { metadata: { vink_key: "vink_team_monthly" } } }));

  expect(await usage(t, slug)).toMatchObject({ topUpPages: 0 });
});

test("Top-ups need a Plan", async () => {
  const t = newBackend();
  const { user, slug } = await freshSignUp(t);

  await expect(user.action(api.billing.topUp, { organisationSlug: slug, locale: "nl" })).rejects.toThrow(
    ConvexError,
  );
});

test("the Customer Portal needs a Polar Customer first", async () => {
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
    "https://sandbox.polar.test/portal",
  );
  expect(fake.state.portals[0]).toEqual({
    external_customer_id: await organisationId(t),
    return_url: `https://vink.page/app/o/${slug}/settings?billing=portal`,
  });
});

test("a Customer that is no Organisation changes nothing", async () => {
  const t = newBackend();
  const { slug } = await freshSignUp(t);

  fake.state.subscriptions = [{ ...(await subscription(t)), customer: { id: "cust_1", external_id: null } }];
  await deliver(t, "subscription.created", fake.state.subscriptions[0]);

  expect(await usage(t, slug)).toMatchObject({ plan: null, hasBillingCustomer: false });
});

test("a webhook with a bad signature is refused", async () => {
  const t = newBackend();
  const { slug } = await freshSignUp(t);
  fake.state.subscriptions = [await subscription(t)];

  const wrong = `whsec_${Buffer.from("another secret, not the real one").toString("base64")}`;
  expect(await deliver(t, "subscription.created", fake.state.subscriptions[0], wrong)).toBe(false);
  expect(await usage(t, slug)).toMatchObject({ plan: null });
});

test("a signed event Vink doesn't know is taken and ignored", async () => {
  const t = newBackend();

  expect(await deliver(t, "something.new", {})).toBe(true);
});
