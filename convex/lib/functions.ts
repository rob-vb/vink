// The only way to define a public Convex function in this app. Raw `query`,
// `mutation` and `action` exports are banned by lint (see ADR 0001).
import {
  customCtx,
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import { ConvexError, v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import {
  mutation,
  query,
  type QueryCtx,
} from "../_generated/server";

async function requireUserId(ctx: { auth: QueryCtx["auth"] }) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    throw new ConvexError("Unauthenticated");
  }
  return identity.subject;
}

/** Signed in, outside any Organisation. */
export const userQuery = customQuery(
  query,
  customCtx(async (ctx) => ({ userId: await requireUserId(ctx) })),
);

export const userMutation = customMutation(
  mutation,
  customCtx(async (ctx) => ({ userId: await requireUserId(ctx) })),
);

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
