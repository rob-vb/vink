// Plans and Items: how many Items an Organisation may still have read, and
// charging them when Vink accepts a PDF. Stripe sets the paid Plans (billing.ts);
// Custom Plans we set by hand with the internal functions below, from the
// Convex dashboard or CLI.
import { ConvexError, v, type Infer } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, type MutationCtx } from "./_generated/server";
import { orgQuery } from "./lib/functions";
import { planName } from "./schema";

export const FREE_ITEMS = 20;

type Items = NonNullable<Doc<"organisations">["items"]>;

// Organisations from before Plans: nothing they rely on may break.
const legacy: Items = {
  plan: "internal_unlimited",
  allowance: 0,
  allowanceUsed: 0,
  periodEndsAt: null,
  topUp: 0,
  free: 0,
  used: 0,
};

// The Page → Item rename (ADR 0010) is widen → backfill → narrow. Until the
// narrow step, an Organisation may still hold its state under the old name
// `pages`: read `items ?? pages`, and write through `itemsPatch`, which moves
// the state to `items` and clears `pages`.
// TODO(narrow, after `items:backfillItems` ran on dev AND prod): read only
// `organisation.items`, and make `itemsPatch` plain `{ items }`.
export function itemsOf(organisation: Doc<"organisations">): Items {
  return organisation.items ?? organisation.pages ?? legacy;
}

/** The patch that stores an Organisation's Items under their new name and drops the old field. */
export function itemsPatch(items: Items) {
  return { items, pages: undefined };
}

function isUnlimited(items: Items) {
  return items.plan === "internal_unlimited";
}

function allowanceLeft(items: Items) {
  return Math.max(0, items.allowance - items.allowanceUsed);
}

function remainingOf(items: Items) {
  return items.free + allowanceLeft(items) + items.topUp;
}

/**
 * A new Organisation's Items: no Plan, and 20 Free Items when it is the first
 * Organisation its creator made.
 */
export async function initialItems(ctx: MutationCtx, createdBy: string): Promise<Items> {
  const earlier = await ctx.db
    .query("organisations")
    .withIndex("by_createdBy", (q) => q.eq("createdBy", createdBy))
    .first();
  return {
    plan: null,
    allowance: 0,
    allowanceUsed: 0,
    periodEndsAt: null,
    topUp: 0,
    free: earlier ? 0 : FREE_ITEMS,
    used: 0,
  };
}

/**
 * Charges a PDF's Items when Vink accepts it: Free Items first, then the Plan's
 * allowance, then Top-ups. A PDF that doesn't fit is refused whole.
 */
export async function chargeItems(
  ctx: MutationCtx,
  organisationId: Id<"organisations">,
  needed: number,
  /** What is refused in the message: "this PDF needs 8". */
  what = "PDF",
) {
  const organisation = (await ctx.db.get(organisationId))!;
  const items = itemsOf(organisation);
  if (isUnlimited(items)) return;
  const remaining = remainingOf(items);
  if (needed > remaining) {
    throw new ConvexError({
      code: "out_of_items",
      message: `You have ${remaining} ${remaining === 1 ? "item" : "items"} left; this ${what} needs ${needed}.`,
      remaining,
      needed,
    });
  }
  let left = needed;
  const take = (available: number) => {
    const taken = Math.min(available, left);
    left -= taken;
    return taken;
  };
  const fromFree = take(items.free);
  const fromAllowance = take(allowanceLeft(items));
  const fromTopUp = take(items.topUp);
  await ctx.db.patch(
    organisationId,
    itemsPatch({
      ...items,
      free: items.free - fromFree,
      allowanceUsed: items.allowanceUsed + fromAllowance,
      topUp: items.topUp - fromTopUp,
      used: items.used + needed,
    }),
  );
}

/** What the app shows: the Items left, when they reset, and the 80% warning. */
export const usage = orgQuery({
  args: {},
  handler: async (ctx) => {
    const organisation = (await ctx.db.get(ctx.organisationId))!;
    const items = itemsOf(organisation);
    const unlimited = isUnlimited(items);
    const remaining = remainingOf(items);
    const total = items.used + remaining;
    return {
      plan: items.plan,
      unlimited,
      remaining: unlimited ? null : remaining,
      used: items.used,
      freeItems: items.free,
      allowance: items.allowance,
      allowanceLeft: allowanceLeft(items),
      topUpItems: items.topUp,
      resetsAt: items.periodEndsAt,
      warning: !unlimited && total > 0 && items.used / total >= 0.8,
      // Paid through Stripe (billing.ts): the Customer Portal can manage it.
      subscription: organisation.subscription
        ? { interval: organisation.subscription.interval, endsAt: organisation.subscription.endsAt }
        : null,
      hasBillingCustomer: organisation.stripeCustomerId !== undefined,
    };
  },
});

async function ownItems(ctx: MutationCtx, organisationId: Id<"organisations">) {
  const organisation = await ctx.db.get(organisationId);
  if (organisation === null) throw new ConvexError("Organisation not found");
  return itemsOf(organisation);
}

/**
 * Admin: puts an Organisation on a Plan with its Items per period and the date
 * the current period ends. The allowance starts afresh.
 *   npx convex run --prod items:setPlan '{"organisationId":"…","plan":"team","allowance":1000,"periodEndsAt":1767225600000}'
 */
export const setPlan = internalMutation({
  args: {
    organisationId: v.id("organisations"),
    plan: v.union(planName, v.null()),
    allowance: v.number(),
    periodEndsAt: v.union(v.number(), v.null()),
  },
  handler: async (ctx, { organisationId, plan, allowance, periodEndsAt }) => {
    const items = await ownItems(ctx, organisationId);
    const anchorDay = periodEndsAt === null ? undefined : new Date(periodEndsAt).getUTCDate();
    await ctx.db.patch(
      organisationId,
      itemsPatch({ ...items, plan, allowance, allowanceUsed: 0, periodEndsAt, anchorDay, used: 0 }),
    );
  },
});

/** Admin: adds Top-up Items, valid until the end of the current period. */
export const addTopUp = internalMutation({
  args: { organisationId: v.id("organisations"), items: v.number() },
  handler: async (ctx, { organisationId, items: added }) => {
    const items = await ownItems(ctx, organisationId);
    await ctx.db.patch(organisationId, itemsPatch({ ...items, topUp: items.topUp + added }));
  },
});

/** Admin: sets the Free Items balance, e.g. to 0 against abuse. */
export const setFreeItems = internalMutation({
  args: { organisationId: v.id("organisations"), freeItems: v.number() },
  handler: async (ctx, { organisationId, freeItems }) => {
    const items = await ownItems(ctx, organisationId);
    await ctx.db.patch(organisationId, itemsPatch({ ...items, free: freeItems }));
  },
});

/** The first period end after `now`, a month at a time, on the anchor day or the month's last day. */
export function nextPeriodEnd(periodEndsAt: number, now: number, anchorDay: number) {
  const end = new Date(periodEndsAt);
  while (end.getTime() <= now) {
    const year = end.getUTCFullYear();
    const month = end.getUTCMonth() + 1;
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    end.setUTCDate(1);
    end.setUTCFullYear(year, month, Math.min(anchorDay, lastDay));
  }
  return end.getTime();
}

/**
 * Scheduled: every period that has ended starts the next one. The allowance
 * renews, and unused Items and Top-ups expire (no roll-over).
 */
export const advancePeriods = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const ended = await ctx.db
      .query("organisations")
      .withIndex("by_itemsPeriodEndsAt", (q) =>
        q.gte("items.periodEndsAt", 0).lte("items.periodEndsAt", now),
      )
      .take(500);
    // TODO(narrow): drop this second read with the `pages` field. Until the
    // backfill ran, Organisations still under the old name sit in the old index.
    const endedUnderOldName = await ctx.db
      .query("organisations")
      .withIndex("by_periodEndsAt", (q) =>
        q.gte("pages.periodEndsAt", 0).lte("pages.periodEndsAt", now),
      )
      .take(500);
    for (const organisation of [...ended, ...endedUnderOldName]) {
      const items = itemsOf(organisation);
      if (items.periodEndsAt === null || items.periodEndsAt > now) continue;
      await ctx.db.patch(
        organisation._id,
        itemsPatch({
          ...items,
          allowanceUsed: 0,
          topUp: 0,
          used: 0,
          periodEndsAt: nextPeriodEnd(
            items.periodEndsAt,
            now,
            items.anchorDay ?? new Date(items.periodEndsAt).getUTCDate(),
          ),
        }),
      );
    }
  },
});

/**
 * Once, when Plans ship: every existing Organisation (Vink's own, the prod test
 * account's, the Claude bridge's) goes on the internal unlimited Plan.
 *   npx convex run --prod items:migrateExistingToUnlimited
 */
export const migrateExistingToUnlimited = internalMutation({
  args: {},
  handler: async (ctx) => {
    let migrated = 0;
    for await (const organisation of ctx.db.query("organisations")) {
      if (organisation.items !== undefined || organisation.pages !== undefined) continue;
      await ctx.db.patch(organisation._id, itemsPatch(legacy));
      migrated++;
    }
    return { migrated };
  },
});

/** Rows one backfill page reads. Far under a mutation's limits (~16k reads, ~8k writes). */
const BACKFILL_PAGE_SIZE = 500;

const BACKFILL_TABLES = ["organisations", "topUpPayments", "intakeAddresses"] as const;

type BackfillPage = { filled: number; continueCursor: string; isDone: boolean };

/**
 * The Page → Item rename (ADR 0010), backfill step: copies every field that
 * still has its old name to the new one and clears the old one. Idempotent, so
 * run it as often as you like; it changes no totals (allowance, used, free).
 * Run once per deployment, after the code that reads `items ?? pages` is
 * deployed. One command walks the three tables to the end, one page per
 * mutation (a single mutation over a big table would roll back whole):
 *   npx convex run items:backfillItems          (dev)
 *   npx convex run --prod items:backfillItems   (prod)
 * Returns the total it filled per table. The check is a full second run: it
 * must return zeros everywhere. If a run stops half way, run it again: pages
 * already done find nothing to fill.
 *
 * TODO(narrow): once it ran on dev AND prod (a second run says 0 everywhere),
 * remove `organisations.pages` with its `by_periodEndsAt` index,
 * `topUpPayments.pages` and `intakeAddresses.outOfPagesAlertAt` from
 * schema.ts, the fallbacks in this file and intake.ts, and these two functions.
 */
export const backfillItems = internalAction({
  args: { numItems: v.optional(v.number()) },
  handler: async (
    ctx,
    { numItems },
  ): Promise<{ organisations: number; topUpPayments: number; intakeAddresses: number }> => {
    const filled = { organisations: 0, topUpPayments: 0, intakeAddresses: 0 };
    for (const table of BACKFILL_TABLES) {
      let cursor: string | null = null;
      for (;;) {
        const page: BackfillPage = await ctx.runMutation(internal.items.backfillItemsPage, {
          table,
          cursor,
          numItems,
        });
        filled[table] += page.filled;
        if (page.isDone) break;
        cursor = page.continueCursor;
      }
    }
    return filled;
  },
});

/** One page of `backfillItems`: patches only the rows on it that still hold a field under its old name. */
export const backfillItemsPage = internalMutation({
  args: {
    table: v.union(v.literal("organisations"), v.literal("topUpPayments"), v.literal("intakeAddresses")),
    cursor: v.optional(v.union(v.string(), v.null())),
    numItems: v.optional(v.number()),
  },
  handler: async (ctx, { table, cursor, numItems }): Promise<BackfillPage> => {
    const paginationOpts = { cursor: cursor ?? null, numItems: numItems ?? BACKFILL_PAGE_SIZE };
    let filled = 0;
    if (table === "organisations") {
      const { page, continueCursor, isDone } = await ctx.db.query("organisations").paginate(paginationOpts);
      for (const organisation of page) {
        if (organisation.pages === undefined) continue;
        // `items` wins if both are somehow set: it is the newer write.
        await ctx.db.patch(organisation._id, itemsPatch(organisation.items ?? organisation.pages));
        filled++;
      }
      return { filled, continueCursor, isDone };
    }
    if (table === "topUpPayments") {
      const { page, continueCursor, isDone } = await ctx.db.query("topUpPayments").paginate(paginationOpts);
      for (const payment of page) {
        if (payment.pages === undefined) continue;
        await ctx.db.patch(payment._id, { items: payment.items ?? payment.pages, pages: undefined });
        filled++;
      }
      return { filled, continueCursor, isDone };
    }
    const { page, continueCursor, isDone } = await ctx.db.query("intakeAddresses").paginate(paginationOpts);
    for (const intake of page) {
      if (intake.outOfPagesAlertAt === undefined) continue;
      await ctx.db.patch(intake._id, {
        outOfItemsAlertAt: intake.outOfItemsAlertAt ?? intake.outOfPagesAlertAt,
        outOfPagesAlertAt: undefined,
      });
      filled++;
    }
    return { filled, continueCursor, isDone };
  },
});

export type PlanName = Infer<typeof planName>;
