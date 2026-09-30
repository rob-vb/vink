// Plans and Pages: how many Pages an Organisation may still have read, and
// charging them when Vink accepts a PDF. Rob sets Plans by hand until billing
// exists: the internal functions below run from the Convex dashboard or CLI.
import { ConvexError, v, type Infer } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { orgQuery } from "./lib/functions";
import { planName } from "./schema";

export const FREE_PAGES = 20;

type Pages = NonNullable<Doc<"organisations">["pages"]>;

// Organisations from before Plans: nothing they rely on may break.
const legacy: Pages = {
  plan: "internal_unlimited",
  allowance: 0,
  allowanceUsed: 0,
  periodEndsAt: null,
  topUp: 0,
  free: 0,
  used: 0,
};

function pagesOf(organisation: Doc<"organisations">): Pages {
  return organisation.pages ?? legacy;
}

function isUnlimited(pages: Pages) {
  return pages.plan === "internal_unlimited";
}

function remainingOf(pages: Pages) {
  return pages.free + Math.max(0, pages.allowance - pages.allowanceUsed) + pages.topUp;
}

/**
 * A new Organisation's Pages: no Plan, and 20 Free Pages when it is the first
 * Organisation its creator made.
 */
export async function initialPages(ctx: MutationCtx, createdBy: string): Promise<Pages> {
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
    free: earlier ? 0 : FREE_PAGES,
    used: 0,
  };
}

/**
 * Charges a PDF's Pages when Vink accepts it: Free Pages first, then the Plan's
 * allowance, then Top-ups. A PDF that doesn't fit is refused whole.
 */
export async function chargePages(
  ctx: MutationCtx,
  organisationId: Id<"organisations">,
  needed: number,
) {
  const organisation = (await ctx.db.get(organisationId))!;
  const pages = pagesOf(organisation);
  if (isUnlimited(pages)) return;
  const remaining = remainingOf(pages);
  if (needed > remaining) {
    throw new ConvexError({
      code: "out_of_pages",
      message: `You have ${remaining} ${remaining === 1 ? "page" : "pages"} left; this PDF has ${needed}.`,
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
  const fromFree = take(pages.free);
  const fromAllowance = take(Math.max(0, pages.allowance - pages.allowanceUsed));
  const fromTopUp = take(pages.topUp);
  await ctx.db.patch(organisationId, {
    pages: {
      ...pages,
      free: pages.free - fromFree,
      allowanceUsed: pages.allowanceUsed + fromAllowance,
      topUp: pages.topUp - fromTopUp,
      used: pages.used + needed,
    },
  });
}

/** What the app shows: the Pages left, when they reset, and the 80% warning. */
export const usage = orgQuery({
  args: {},
  handler: async (ctx) => {
    const pages = pagesOf((await ctx.db.get(ctx.organisationId))!);
    const unlimited = isUnlimited(pages);
    const remaining = remainingOf(pages);
    const total = pages.used + remaining;
    return {
      plan: pages.plan,
      unlimited,
      remaining: unlimited ? null : remaining,
      used: pages.used,
      freePages: pages.free,
      allowance: pages.allowance,
      allowanceLeft: Math.max(0, pages.allowance - pages.allowanceUsed),
      topUpPages: pages.topUp,
      resetsAt: pages.periodEndsAt,
      warning: !unlimited && total > 0 && pages.used / total >= 0.8,
    };
  },
});

async function ownPages(ctx: MutationCtx, organisationId: Id<"organisations">) {
  const organisation = await ctx.db.get(organisationId);
  if (organisation === null) throw new ConvexError("Organisation not found");
  return pagesOf(organisation);
}

/**
 * Rob: puts an Organisation on a Plan with its Pages per period and the date
 * the current period ends. The allowance starts afresh.
 *   npx convex run --prod pages:setPlan '{"organisationId":"…","plan":"team","allowance":1000,"periodEndsAt":1767225600000}'
 */
export const setPlan = internalMutation({
  args: {
    organisationId: v.id("organisations"),
    plan: v.union(planName, v.null()),
    allowance: v.number(),
    periodEndsAt: v.union(v.number(), v.null()),
  },
  handler: async (ctx, { organisationId, plan, allowance, periodEndsAt }) => {
    const pages = await ownPages(ctx, organisationId);
    await ctx.db.patch(organisationId, {
      pages: { ...pages, plan, allowance, allowanceUsed: 0, periodEndsAt, used: 0 },
    });
  },
});

/** Rob: adds Top-up Pages, valid until the end of the current period. */
export const addTopUp = internalMutation({
  args: { organisationId: v.id("organisations"), pages: v.number() },
  handler: async (ctx, { organisationId, pages: added }) => {
    const pages = await ownPages(ctx, organisationId);
    await ctx.db.patch(organisationId, { pages: { ...pages, topUp: pages.topUp + added } });
  },
});

/** Rob: sets the Free Pages balance, e.g. to 0 against abuse. */
export const setFreePages = internalMutation({
  args: { organisationId: v.id("organisations"), freePages: v.number() },
  handler: async (ctx, { organisationId, freePages }) => {
    const pages = await ownPages(ctx, organisationId);
    await ctx.db.patch(organisationId, { pages: { ...pages, free: freePages } });
  },
});

function nextPeriodEnd(periodEndsAt: number, now: number) {
  let end = new Date(periodEndsAt);
  while (end.getTime() <= now) {
    end = new Date(end);
    end.setUTCMonth(end.getUTCMonth() + 1);
  }
  return end.getTime();
}

/**
 * Scheduled: every period that has ended starts the next one. The allowance
 * renews, and unused Pages and Top-ups expire (no roll-over).
 */
export const advancePeriods = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const ended = await ctx.db
      .query("organisations")
      .withIndex("by_periodEndsAt", (q) =>
        q.gte("pages.periodEndsAt", 0).lte("pages.periodEndsAt", now),
      )
      .take(500);
    for (const organisation of ended) {
      const pages = pagesOf(organisation);
      await ctx.db.patch(organisation._id, {
        pages: {
          ...pages,
          allowanceUsed: 0,
          topUp: 0,
          used: 0,
          periodEndsAt: nextPeriodEnd(pages.periodEndsAt!, now),
        },
      });
    }
  },
});

/**
 * Once, when Plans ship: every existing Organisation (Rob's, the prod test
 * account's, the Claude bridge's) goes on the internal unlimited Plan.
 *   npx convex run --prod pages:migrateExistingToUnlimited
 */
export const migrateExistingToUnlimited = internalMutation({
  args: {},
  handler: async (ctx) => {
    let migrated = 0;
    for await (const organisation of ctx.db.query("organisations")) {
      if (organisation.pages !== undefined) continue;
      await ctx.db.patch(organisation._id, { pages: legacy });
      migrated++;
    }
    return { migrated };
  },
});

export type PlanName = Infer<typeof planName>;
