import { ConvexError } from "convex/values";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { api } from "@/convex/_generated/api";
import { fetchAuthQuery, isAuthenticated } from "@/lib/auth-server";

/** The caller's Organisation and role; a 404 when they have no Membership. */
export const getOrganisation = cache(async (slug: string) => {
  if (!(await isAuthenticated())) {
    redirect("/sign-in");
  }
  try {
    return await fetchAuthQuery(api.organisations.home, {
      organisationSlug: slug,
    });
  } catch (error) {
    if (error instanceof ConvexError && error.data === "Forbidden") {
      notFound();
    }
    throw error;
  }
});

/** Admin-only pages look the same as missing ones to a Member. */
export async function requireAdmin(slug: string) {
  const organisation = await getOrganisation(slug);
  if (organisation.role !== "admin") {
    notFound();
  }
  return organisation;
}
