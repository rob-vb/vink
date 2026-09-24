import type { Metadata } from "next";
import { invitePath } from "@/lib/invite-path";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in · DocuHelper" };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const { error, next } = await searchParams;
  return <SignInForm linkFailed={error === "link"} next={invitePath(next)} />;
}
