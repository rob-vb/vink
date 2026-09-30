import type { Metadata } from "next";
import { requireAdmin } from "../organisation";
import { IntegrationsList } from "./integrations-list";

export const metadata: Metadata = { title: "Integrations · Vink" };

export default async function IntegrationsPage({ params }: PageProps<"/app/o/[slug]/integrations">) {
  const { slug } = await params;
  await requireAdmin(slug);
  return <IntegrationsList organisationSlug={slug} />;
}
