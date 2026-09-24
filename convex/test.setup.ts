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

/** Call as a signed-in user, with no Organisation yet. Their email is `<userId>@example.com`. */
export function asUser(t: Backend, userId: string) {
  return t.withIdentity({ subject: userId, email: `${userId}@example.com` });
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
 * Gives a user a Membership in an existing Organisation, skipping the
 * Invitation (see invitations.test.ts for that path).
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
      email: `${userId}@example.com`,
      role,
    });
  });
  return asUser(t, userId);
}

/**
 * Stands in for R2 (see lib/pdfStore.ts): objects live in `objects`, and an
 * upload URL is the object's key behind a fake host. Install it in a test file
 * with `vi.mock("./lib/pdfStore", () => ({ pdfStore: fakePdfStore }))`.
 */
export const fakePdfStore = {
  objects: new Map<string, Uint8Array>(),
  async uploadUrl(key: string) {
    return `https://r2.test/upload/${key}`;
  },
  async read(key: string) {
    return fakePdfStore.objects.get(key) ?? null;
  },
  async remove(_ctx: unknown, key: string) {
    fakePdfStore.objects.delete(key);
  },
  async viewUrl(key: string, expiresInSeconds: number) {
    return `https://r2.test/view/${key}?expires=${expiresInSeconds}`;
  },
};

/** What the browser does with an upload URL: PUT the bytes there. */
export function putToUploadUrl(url: string, bytes: Uint8Array) {
  fakePdfStore.objects.set(url.replace("https://r2.test/upload/", ""), bytes);
}
