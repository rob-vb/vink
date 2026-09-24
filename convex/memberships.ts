import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { authComponent } from "./auth";
import { orgMutation, orgQuery } from "./lib/functions";
import { role } from "./schema";

/** The Members of the Organisation and the Invitations still open. */
export const list = orgQuery({
  role: "admin",
  args: {},
  handler: async (ctx) => {
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_organisationId_and_userId", (q) =>
        q.eq("organisationId", ctx.organisationId),
      )
      .take(500);
    const invitations = await ctx.db
      .query("invitations")
      .withIndex("by_organisationId_and_email", (q) => q.eq("organisationId", ctx.organisationId))
      .take(500);
    const now = Date.now();
    return {
      members: memberships
        .sort((a, b) => a._creationTime - b._creationTime)
        .map((membership) => ({
          membershipId: membership._id,
          email: membership.email ?? "",
          role: membership.role,
          isYou: membership.userId === ctx.userId,
        })),
      invitations: invitations
        .filter((invitation) => invitation.acceptedAt === undefined && invitation.expiresAt >= now)
        .map((invitation) => ({
          invitationId: invitation._id,
          email: invitation.email,
          role: invitation.role,
          expiresAt: invitation.expiresAt,
        })),
    };
  },
});

export const changeRole = orgMutation({
  role: "admin",
  args: { membershipId: v.id("memberships"), role },
  handler: async (ctx, { membershipId, role }) => {
    const membership = await membershipIn(ctx, ctx.organisationId, membershipId);
    if (role === "member" && (await isLastAdmin(ctx, membership))) {
      throw new ConvexError("LastAdmin");
    }
    await ctx.db.patch(membershipId, { role });
  },
});

export const remove = orgMutation({
  role: "admin",
  args: { membershipId: v.id("memberships") },
  handler: async (ctx, { membershipId }) => {
    const membership = await membershipIn(ctx, ctx.organisationId, membershipId);
    if (await isLastAdmin(ctx, membership)) {
      throw new ConvexError("LastAdmin");
    }
    await ctx.db.delete(membershipId);
  },
});

async function membershipIn(
  ctx: MutationCtx,
  organisationId: Id<"organisations">,
  membershipId: Id<"memberships">,
) {
  const membership = await ctx.db.get(membershipId);
  if (!membership || membership.organisationId !== organisationId) {
    throw new ConvexError("MembershipNotFound");
  }
  return membership;
}

/** Every Organisation keeps at least one Admin. */
async function isLastAdmin(ctx: MutationCtx, membership: Doc<"memberships">) {
  if (membership.role !== "admin") {
    return false;
  }
  const memberships = await ctx.db
    .query("memberships")
    .withIndex("by_organisationId_and_userId", (q) =>
      q.eq("organisationId", membership.organisationId),
    )
    .take(500);
  return memberships.filter((other) => other.role === "admin").length === 1;
}

/**
 * One-off: copies each user's email onto Memberships made before ticket 19.
 * Run once per deployment: `npx convex run memberships:backfillEmails`.
 */
export const backfillEmails = internalMutation({
  args: {},
  handler: async (ctx) => {
    const memberships = await ctx.db.query("memberships").take(1000);
    let filled = 0;
    for (const membership of memberships) {
      if (membership.email !== undefined) continue;
      const user = await authComponent.getAnyUserById(ctx, membership.userId);
      if (user) {
        await ctx.db.patch(membership._id, { email: user.email.toLowerCase() });
        filled++;
      }
    }
    return { filled };
  },
});
