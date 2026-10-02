"use client";

import { ConvexError } from "convex/values";
import { useTranslations } from "next-intl";
import { useErrorText } from "../../../error-text";

export type Role = "admin" | "member";

const roleValues: Role[] = ["member", "admin"];

/** The roles to pick from, in the app's language. */
export function useRoles(): { value: Role; label: string }[] {
  const t = useTranslations("app.roles");
  return roleValues.map((value) => ({ value, label: t(value) }));
}

const problems = [
  "LastAdmin",
  "AlreadyMember",
  "InvalidEmail",
  "MembershipNotFound",
  "InvitationNotFound",
] as const;

/** Memberships' own error codes in words; other errors as useErrorText shows them. */
export function useDescribeProblem() {
  const t = useTranslations("appMembers.problems");
  const errorText = useErrorText();
  return (error: unknown, fallback: string) => {
    const code = error instanceof ConvexError ? error.data : null;
    return (problems as readonly unknown[]).includes(code) ? t(code as (typeof problems)[number]) : errorText(error, fallback);
  };
}
