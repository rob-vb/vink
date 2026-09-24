/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

export const modules = import.meta.glob([
  "./**/*.{ts,js}",
  "!./**/*.test.ts",
  "!./**/*.d.ts",
]);

export function newBackend() {
  return convexTest(schema, modules);
}

type Backend = ReturnType<typeof newBackend>;

/** Call as a signed-in user, with no Organisation yet. */
export function asUser(t: Backend, userId: string) {
  return t.withIdentity({ subject: userId });
}

/** A user signs up and gets their own Organisation; returns them and its slug. */
export async function signUp(t: Backend, userId: string, organisationName: string) {
  const user = asUser(t, userId);
  const { slug } = await user.mutation(api.onboarding.createOrganisation, {
    name: organisationName,
  });
  return { user, slug };
}

/**
 * Gives a user a Membership in an existing Organisation. A stand-in until
 * Invitations exist (ticket 19).
 */
export async function addMembership(
  t: Backend,
  userId: string,
  organisationSlug: string,
  role: "admin" | "member",
) {
  await t.run(async (ctx) => {
    const organisation = await ctx.db
      .query("organisations")
      .withIndex("by_slug", (q) => q.eq("slug", organisationSlug))
      .unique();
    await ctx.db.insert("memberships", {
      organisationId: organisation!._id,
      userId,
      role,
    });
  });
  return asUser(t, userId);
}
