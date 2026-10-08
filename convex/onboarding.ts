import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, type MutationCtx, type QueryCtx } from "./_generated/server";
import { escapeHtml, sendEmail } from "./email";
import { orgMutation, orgQuery, userMutation } from "./lib/functions";
import { initialItems } from "./items";

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

    const slug = await uniqueSlug(ctx);
    const organisationId = await ctx.db.insert("organisations", {
      name,
      slug,
      createdBy: ctx.userId,
      items: await initialItems(ctx, ctx.userId),
      onboarding: {},
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
 * Tells Vink about every new Organisation, to spot abuse and follow up. Sent to
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

/** The facts the setup steps are read from. */
async function factsOf(ctx: QueryCtx, organisationId: Id<"organisations">) {
  const organisation = (await ctx.db.get(organisationId))!;
  const [form, integration, document] = await Promise.all([
    ctx.db
      .query("forms")
      .withIndex("by_organisationId", (q) => q.eq("organisationId", organisationId))
      .first(),
    ctx.db
      .query("integrations")
      .withIndex("by_organisationId", (q) => q.eq("organisationId", organisationId))
      .first(),
    ctx.db
      .query("documents")
      .withIndex("by_organisationId_and_state", (q) => q.eq("organisationId", organisationId))
      .first(),
  ]);
  return {
    onboarding: organisation.onboarding,
    hasForm: form !== null,
    hasIntegration: integration !== null,
    hasDocument: document !== null,
  };
}

/**
 * Where the Organisation is in the setup. Each step is read from a fact where a
 * fact exists: a Form, an Integration, a Document. Only "System skipped" and
 * "Input seen" are stored (`organisations.onboarding`), so a refresh, or another
 * Admin, sees the same step.
 *
 * - `setup`: the guided setup shows instead of Documents (Admins only).
 * - `step`: 1 Form, 2 System, 3 Input; `null` when the setup is over.
 * - `systemNotice`: Documents shows "No system connected yet".
 * - `needsStart`: an Organisation from before the setup with no Form; the page
 *   calls `start` once so its steps are tracked from then on.
 */
export const state = orgQuery({
  args: {},
  handler: async (ctx) => {
    const facts = await factsOf(ctx, ctx.organisationId);
    const over = { setup: false, step: null, systemNotice: false, needsStart: false };
    // Members never run the setup; they have no say in Forms or Integrations.
    if (ctx.role !== "admin") return over;

    const { onboarding } = facts;
    if (onboarding === undefined) {
      // Older Organisations count as set up, unless they never made a Form.
      return facts.hasForm ? over : { ...over, setup: true, step: 1 as const, needsStart: true };
    }

    const systemDone = facts.hasIntegration || onboarding.systemSkippedAt !== undefined;
    const inputDone = onboarding.inputDoneAt !== undefined || facts.hasDocument;
    // No Form: step 1, unless the setup is over and the Forms were deleted since.
    if (!facts.hasForm) return inputDone ? over : { ...over, setup: true, step: 1 as const };
    if (!systemDone) return { ...over, setup: true, step: 2 as const };
    if (!inputDone) return { ...over, setup: true, step: 3 as const };
    return { ...over, systemNotice: !facts.hasIntegration };
  },
});

/** Starts tracking the setup of an Organisation from before it. Safe to repeat. */
export const start = orgMutation({
  role: "admin",
  args: {},
  handler: async (ctx) => {
    const organisation = (await ctx.db.get(ctx.organisationId))!;
    if (organisation.onboarding === undefined) {
      await ctx.db.patch(ctx.organisationId, { onboarding: {} });
    }
  },
});

/** The System step: "not now". Documents then shows a notice until an Integration exists. */
export const skipSystem = orgMutation({
  role: "admin",
  args: {},
  handler: async (ctx) => {
    const organisation = (await ctx.db.get(ctx.organisationId))!;
    const onboarding = organisation.onboarding ?? {};
    if (onboarding.systemSkippedAt !== undefined) return;
    await ctx.db.patch(ctx.organisationId, {
      onboarding: { ...onboarding, systemSkippedAt: Date.now() },
    });
  },
});

/** The Input step: the Admin has seen how documents come in. Ends the setup. */
export const finishInput = orgMutation({
  role: "admin",
  args: {},
  handler: async (ctx) => {
    if (!(await factsOf(ctx, ctx.organisationId)).hasForm) {
      throw new ConvexError("Make a Form first");
    }
    const organisation = (await ctx.db.get(ctx.organisationId))!;
    const onboarding = organisation.onboarding ?? {};
    if (onboarding.inputDoneAt !== undefined) return;
    await ctx.db.patch(ctx.organisationId, {
      onboarding: { ...onboarding, inputDoneAt: Date.now() },
    });
  },
});

const SLUG_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** A random 8-character id for the Organisation URL; it never shows the name. */
export async function uniqueSlug(ctx: MutationCtx) {
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    const slug = Array.from(bytes, (b) => SLUG_ALPHABET[b % SLUG_ALPHABET.length]).join("");
    const taken = await ctx.db
      .query("organisations")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!taken) {
      return slug;
    }
  }
}
