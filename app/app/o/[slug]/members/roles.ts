import { ConvexError } from "convex/values";

export type Role = "admin" | "member";

export const roles: { value: Role; label: string }[] = [
  { value: "member", label: "Member" },
  { value: "admin", label: "Admin" },
];

const problems: Record<string, string> = {
  LastAdmin: "An Organisation needs at least one Admin.",
  AlreadyMember: "That address already has a Membership here.",
  InvalidEmail: "Enter a valid email address.",
  MembershipNotFound: "That Membership no longer exists.",
  InvitationNotFound: "That Invitation no longer exists.",
};

export function describeProblem(error: unknown, fallback: string) {
  if (error instanceof ConvexError) {
    return problems[String(error.data)] ?? String(error.data);
  }
  return fallback;
}
