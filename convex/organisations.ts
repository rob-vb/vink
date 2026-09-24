import { v } from "convex/values";
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
