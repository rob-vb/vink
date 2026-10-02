import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { invitePath } from "@/lib/invite-path";
import { SignUpForm } from "./sign-up-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.titles");
  return { title: t("signUp") };
}

export default async function SignUpPage({ searchParams }: PageProps<"/app/sign-up">) {
  const { next } = await searchParams;
  return <SignUpForm next={invitePath(next)} />;
}
