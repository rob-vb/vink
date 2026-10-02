import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { invitePath } from "@/lib/invite-path";
import { SignInForm } from "./sign-in-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.titles");
  return { title: t("signIn") };
}

export default async function SignInPage({ searchParams }: PageProps<"/app/sign-in">) {
  const { error, next } = await searchParams;
  return <SignInForm linkFailed={error === "link"} next={invitePath(next)} />;
}
