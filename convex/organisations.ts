import { ConvexError, v } from "convex/values";
import { orgMutation, orgQuery, userQuery } from "./lib/functions";

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

export const settings = orgQuery({
  role: "admin",
  args: {},
  handler: async (ctx) => {
    const organisation = (await ctx.db.get(ctx.organisationId))!;
    return {
      name: organisation.name,
      retentionDays: organisation.retentionDays ?? DEFAULT_RETENTION_DAYS,
    };
  },
});

export const updateRetention = orgMutation({
  role: "admin",
  args: { retentionDays: v.number() },
  handler: async (ctx, { retentionDays }) => {
    if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650) {
      throw new ConvexError("Keep data from 1 to 3650 days");
    }
    await ctx.db.patch(ctx.organisationId, { retentionDays });
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
