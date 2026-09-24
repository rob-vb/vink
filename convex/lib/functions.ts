// The only way to define a public Convex function in this app. Raw `query`,
// `mutation` and `action` exports are banned by lint (see ADR 0001).
import {
  customAction,
  customCtx,
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
  action,
  internalQuery,
  mutation,
  query,
  type QueryCtx,
} from "../_generated/server";

async function requireIdentity(ctx: { auth: QueryCtx["auth"] }) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    throw new ConvexError("Unauthenticated");
  }
  return identity;
}

async function requireUserId(ctx: { auth: QueryCtx["auth"] }) {
  return (await requireIdentity(ctx)).subject;
}

async function requireUser(ctx: { auth: QueryCtx["auth"] }) {
  const identity = await requireIdentity(ctx);
  return { userId: identity.subject, email: identity.email?.toLowerCase() ?? "" };
}

/** Signed in, outside any Organisation. Injects `userId` and a lower-case `email`. */
export const userQuery = customQuery(query, customCtx(requireUser));

export const userMutation = customMutation(mutation, customCtx(requireUser));

type Role = Doc<"memberships">["role"];

/** Pass `role: "admin"` in a function definition to make it Admin-only. */
type RoleRequirement = { role?: Extract<Role, "admin"> };

async function resolveMembership(
  ctx: QueryCtx,
  organisationSlug: string,
  { role }: RoleRequirement,
) {
  const userId = await requireUserId(ctx);
  const organisation = await ctx.db
    .query("organisations")
    .withIndex("by_slug", (q) => q.eq("slug", organisationSlug))
    .unique();
  const membership =
    organisation &&
    (await ctx.db
      .query("memberships")
      .withIndex("by_organisationId_and_userId", (q) =>
        q.eq("organisationId", organisation._id).eq("userId", userId),
      )
      .unique());
  // An unknown slug and someone else's Organisation look the same to the caller.
  if (!organisation || !membership) {
    throw new ConvexError("Forbidden");
  }
  if (role === "admin" && membership.role !== "admin") {
    throw new ConvexError("Forbidden");
  }
  return {
    ctx: { userId, organisationId: organisation._id, role: membership.role },
    args: {},
  };
}

const organisationArgs = { organisationSlug: v.string() };

/**
 * Signed in and holding a Membership in the Organisation named by
 * `organisationSlug`. Injects `organisationId`; the handler never sees the slug.
 */
export const orgQuery = customQuery(query, {
  args: organisationArgs,
  input: (ctx, { organisationSlug }, required: RoleRequirement) =>
    resolveMembership(ctx, organisationSlug, required),
});

export const orgMutation = customMutation(mutation, {
  args: organisationArgs,
  input: (ctx, { organisationSlug }, required: RoleRequirement) =>
    resolveMembership(ctx, organisationSlug, required),
});

type MembershipCtx = { userId: string; organisationId: Id<"organisations">; role: Role };

/** For `orgAction`, which has no `ctx.db` of its own. */
export const membership = internalQuery({
  args: { organisationSlug: v.string(), role: v.optional(v.literal("admin")) },
  handler: async (ctx, { organisationSlug, role }): Promise<MembershipCtx> =>
    (await resolveMembership(ctx, organisationSlug, { role })).ctx,
});

/**
 * Like `orgQuery`, for actions. The Membership is checked once, at the start;
 * pass `ctx.organisationId` to any internal function the action runs.
 */
export const orgAction = customAction(action, {
  args: organisationArgs,
  input: async (
    ctx,
    { organisationSlug },
    { role }: RoleRequirement,
  ): Promise<{ ctx: MembershipCtx; args: Record<string, never> }> => ({
    ctx: await ctx.runQuery(internal.lib.functions.membership, {
      organisationSlug,
      role,
    }),
    args: {},
  }),
});
