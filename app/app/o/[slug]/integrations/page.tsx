import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireAdmin } from "../organisation";
import { IntegrationsList } from "./integrations-list";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("appIntegrations");
  return { title: t("metaTitle") };
}

export default async function IntegrationsPage({ params }: PageProps<"/app/o/[slug]/integrations">) {
  const { slug } = await params;
  await requireAdmin(slug);
  return <IntegrationsList organisationSlug={slug} />;
}
