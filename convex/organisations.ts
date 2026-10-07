import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { orgMutation, orgQuery, userQuery } from "./lib/functions";
import { uniqueSlug } from "./onboarding";

/** The Organisation's slug, for an action that signs an OAuth state with it. */
export const slugOf = internalQuery({
  args: { organisationId: v.id("organisations") },
  handler: async (ctx, { organisationId }) => (await ctx.db.get(organisationId))!.slug,
});

export const home = orgQuery({
  args: {},
  handler: async (ctx) => {
    const organisation = (await ctx.db.get(ctx.organisationId))!;
    return { name: organisation.name, slug: organisation.slug, role: ctx.role };
  },
});

export const rename = orgMutation({
  role: "admin",
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    await ctx.db.patch(ctx.organisationId, { name });
  },
});

// The days a Document's data is kept after its last successful Delivery.
export const DEFAULT_RETENTION_DAYS = 30;
// The most the site promises: never kept longer than a year.
export const MAX_RETENTION_DAYS = 365;

/** An Organisation's retention in days; a value set above the maximum counts as the maximum. */
export function retentionDaysOf(organisation: Doc<"organisations">) {
  return Math.min(organisation.retentionDays ?? DEFAULT_RETENTION_DAYS, MAX_RETENTION_DAYS);
}

export const settings = orgQuery({
  role: "admin",
  args: {},
  handler: async (ctx) => {
    const organisation = (await ctx.db.get(ctx.organisationId))!;
    return {
      name: organisation.name,
      retentionDays: retentionDaysOf(organisation),
    };
  },
});

export const updateRetention = orgMutation({
  role: "admin",
  args: { retentionDays: v.number() },
  handler: async (ctx, { retentionDays }) => {
    if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > MAX_RETENTION_DAYS) {
      throw new ConvexError(`Keep data from 1 to ${MAX_RETENTION_DAYS} days`);
    }
    await ctx.db.patch(ctx.organisationId, { retentionDays });
  },
});

/**
 * One-off migration for the 365-day maximum: stores it on every Organisation
 * set above it. Run with `npx convex run organisations:clampRetention`.
 */
export const clampRetention = internalMutation({
  args: {},
  handler: async (ctx) => {
    let clamped = 0;
    for (const organisation of await ctx.db.query("organisations").take(10000)) {
      if ((organisation.retentionDays ?? 0) > MAX_RETENTION_DAYS) {
        await ctx.db.patch(organisation._id, { retentionDays: MAX_RETENTION_DAYS });
        clamped++;
      }
    }
    return { clamped };
  },
});

/**
 * One-off migration for random Organisation ids: gives every Organisation a new
 * slug, so no URL shows a name. Old links stop working. Run with
 * `npx convex run organisations:randomiseSlugs`.
 */
export const randomiseSlugs = internalMutation({
  args: {},
  handler: async (ctx) => {
    let changed = 0;
    for (const organisation of await ctx.db.query("organisations").take(10000)) {
      await ctx.db.patch(organisation._id, { slug: await uniqueSlug(ctx) });
      changed++;
    }
    return { changed };
  },
});

export const mine = userQuery({
  args: {},
  handler: async (ctx) => {
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .take(100);
    return await Promise.all(
      memberships.map(async ({ organisationId, role }) => {
        const organisation = (await ctx.db.get(organisationId))!;
        return { name: organisation.name, slug: organisation.slug, role };
      }),
    );
  },
});
