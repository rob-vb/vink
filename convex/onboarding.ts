import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, type MutationCtx } from "./_generated/server";
import { sendEmail } from "./email";
import { userMutation } from "./lib/functions";
import { initialPages } from "./pages";

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
    const organisationId = await ctx.db.insert("organisations", {
      name,
      slug,
      createdBy: ctx.userId,
      pages: await initialPages(ctx, ctx.userId),
    });
    await ctx.db.insert("memberships", {
      organisationId,
      userId: ctx.userId,
      email: ctx.email,
      role: "admin",
    });
    await ctx.scheduler.runAfter(0, internal.onboarding.notifyNewOrganisation, {
      name,
      email: ctx.email,
    });
    return { slug };
  },
});

/**
 * Tells Rob about every new Organisation, to spot abuse and follow up. Sent to
 * SIGNUP_NOTIFY_TO; nothing is sent when it isn't set.
 */
export const notifyNewOrganisation = internalAction({
  args: { name: v.string(), email: v.string() },
  handler: async (_ctx, { name, email }) => {
    const to = process.env.SIGNUP_NOTIFY_TO;
    if (!to) return;
    const domain = email.split("@")[1] ?? "";
    await sendEmail({
      to,
      subject: `New Organisation: ${name}`,
      html: `<p>${escapeHtml(name)} was just created by ${escapeHtml(email)}.</p><p>Email domain: <strong>${escapeHtml(domain)}</strong></p>`,
    });
  },
});

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

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
