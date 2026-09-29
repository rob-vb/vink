import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, type QueryCtx } from "./_generated/server";
import { sendEmail } from "./email";
import { orgMutation, userMutation, userQuery } from "./lib/functions";
import { role } from "./schema";

const VALID_FOR_MS = 7 * 24 * 60 * 60 * 1000;

export const invite = orgMutation({
  role: "admin",
  args: { email: v.string(), role },
  handler: async (ctx, args) => {
    const email = normaliseEmail(args.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ConvexError("InvalidEmail");
    }
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_organisationId_and_userId", (q) =>
        q.eq("organisationId", ctx.organisationId),
      )
      .take(500);
    if (memberships.some((membership) => membership.email === email)) {
      throw new ConvexError("AlreadyMember");
    }

    // A new Invitation replaces any open one, so only the latest link works.
    const earlier = await ctx.db
      .query("invitations")
      .withIndex("by_organisationId_and_email", (q) =>
        q.eq("organisationId", ctx.organisationId).eq("email", email),
      )
      .take(100);
    for (const invitation of earlier) {
      if (invitation.acceptedAt === undefined) {
        await ctx.db.delete(invitation._id);
      }
    }

    const token = newToken();
    await ctx.db.insert("invitations", {
      organisationId: ctx.organisationId,
      email,
      role: args.role,
      tokenHash: await hash(token),
      expiresAt: Date.now() + VALID_FOR_MS,
      invitedBy: ctx.userId,
    });
    const organisation = (await ctx.db.get(ctx.organisationId))!;
    await ctx.scheduler.runAfter(0, internal.invitations.send, {
      email,
      organisationName: organisation.name,
      token,
    });
  },
});

export const revoke = orgMutation({
  role: "admin",
  args: { invitationId: v.id("invitations") },
  handler: async (ctx, { invitationId }) => {
    const invitation = await ctx.db.get(invitationId);
    if (
      !invitation ||
      invitation.organisationId !== ctx.organisationId ||
      invitation.acceptedAt !== undefined
    ) {
      throw new ConvexError("InvitationNotFound");
    }
    await ctx.db.delete(invitationId);
  },
});

export const send = internalAction({
  args: { email: v.string(), organisationName: v.string(), token: v.string() },
  handler: async (_ctx, { email, organisationName, token }) => {
    const url = `${process.env.SITE_URL}/invite/${token}`;
    await sendEmail({
      to: email,
      subject: `You're invited to ${organisationName} on Vink`,
      html: `<p>You're invited to join <strong>${escapeHtml(organisationName)}</strong> on Vink.</p><p><a href="${url}">Accept the invitation</a></p><p>This link expires in 7 days.</p>`,
    });
  },
});

/** What the accept page shows for a link, for the signed-in user. */
export const preview = userQuery({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const { status, invitation } = await check(ctx, token);
    if (!invitation) {
      return { status };
    }
    const organisation = (await ctx.db.get(invitation.organisationId))!;
    const inviter = await ctx.db
      .query("memberships")
      .withIndex("by_organisationId_and_userId", (q) =>
        q.eq("organisationId", invitation.organisationId).eq("userId", invitation.invitedBy),
      )
      .unique();
    return {
      status,
      organisationName: organisation.name,
      organisationSlug: organisation.slug,
      role: invitation.role,
      email: invitation.email,
      invitedBy: inviter?.email ?? null,
    };
  },
});

const refusals = {
  notFound: "InvitationNotFound",
  used: "InvitationUsed",
  expired: "InvitationExpired",
  anotherEmail: "InvitationForAnotherEmail",
} as const;

export const accept = userMutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const { status, invitation } = await check(ctx, token);
    if (status !== "open") {
      throw new ConvexError(refusals[status]);
    }
    await ctx.db.insert("memberships", {
      organisationId: invitation.organisationId,
      userId: ctx.userId,
      email: ctx.email,
      role: invitation.role,
    });
    await ctx.db.patch(invitation._id, { acceptedAt: Date.now() });
    const organisation = (await ctx.db.get(invitation.organisationId))!;
    return { slug: organisation.slug };
  },
});

async function check(ctx: QueryCtx & { email: string }, token: string) {
  const tokenHash = await hash(token);
  const invitation = await ctx.db
    .query("invitations")
    .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
    .unique();
  if (!invitation) {
    return { status: "notFound" as const, invitation: null };
  }
  const status =
    invitation.acceptedAt !== undefined
      ? ("used" as const)
      : invitation.expiresAt < Date.now()
        ? ("expired" as const)
        : ctx.email !== invitation.email
          ? ("anotherEmail" as const)
          : ("open" as const);
  return { status, invitation };
}

function normaliseEmail(email: string) {
  return email.trim().toLowerCase();
}

function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function hash(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
