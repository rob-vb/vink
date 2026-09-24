import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import { userMutation } from "./lib/functions";

/**
 * The last step of sign-up: the new user becomes Admin of a new Organisation.
 * A user who already has a Membership gets that Organisation back instead.
 */
export const createOrganisation = userMutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const existing = await ctx.db
      .query("memberships")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .first();
    if (existing) {
      const organisation = (await ctx.db.get(existing.organisationId))!;
      return { slug: organisation.slug };
    }

    const slug = await uniqueSlug(ctx, name);
    const organisationId = await ctx.db.insert("organisations", { name, slug });
    await ctx.db.insert("memberships", {
      organisationId,
      userId: ctx.userId,
      email: ctx.email,
      role: "admin",
    });
    return { slug };
  },
});

async function uniqueSlug(ctx: MutationCtx, name: string) {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "organisation";
  for (let n = 1; ; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    const taken = await ctx.db
      .query("organisations")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!taken) {
      return slug;
    }
  }
}
