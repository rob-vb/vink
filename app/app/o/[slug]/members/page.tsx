import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireAdmin } from "../organisation";
import { MembersList } from "./members-list";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.titles");
  return { title: t("members") };
}

export default async function MembersPage({ params }: PageProps<"/app/o/[slug]/members">) {
  const { slug } = await params;
  await requireAdmin(slug);
  return <MembersList organisationSlug={slug} />;
}
