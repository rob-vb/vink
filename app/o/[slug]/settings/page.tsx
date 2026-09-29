import type { Metadata } from "next";
import { requireAdmin } from "../organisation";
import { OrganisationSettings } from "./organisation-settings";

export const metadata: Metadata = { title: "Settings · Vink" };

export default async function SettingsPage({ params }: PageProps<"/o/[slug]/settings">) {
  const { slug } = await params;
  await requireAdmin(slug);
  return <OrganisationSettings organisationSlug={slug} />;
}
