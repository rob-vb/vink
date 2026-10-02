import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireAdmin } from "../organisation";
import { OrganisationSettings } from "./organisation-settings";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("appSettings");
  return { title: t("metaTitle") };
}

export default async function SettingsPage({ params }: PageProps<"/app/o/[slug]/settings">) {
  const { slug } = await params;
  await requireAdmin(slug);
  return <OrganisationSettings organisationSlug={slug} />;
}
