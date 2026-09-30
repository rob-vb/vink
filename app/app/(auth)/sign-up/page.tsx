import type { Metadata } from "next";
import { invitePath } from "@/lib/invite-path";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: "Sign up · Vink" };

export default async function SignUpPage({ searchParams }: PageProps<"/app/sign-up">) {
  const { next } = await searchParams;
  return <SignUpForm next={invitePath(next)} />;
}
