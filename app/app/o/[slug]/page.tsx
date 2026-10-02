import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DocumentList } from "./documents/document-list";
import { getOrganisation } from "./organisation";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.titles");
  return { title: t("documents") };
}

export default async function OrganisationHome({ params }: PageProps<"/app/o/[slug]">) {
  const { slug } = await params;
  const organisation = await getOrganisation(slug);

  return (
    <DocumentList
      organisationSlug={slug}
      organisationName={organisation.name}
      isAdmin={organisation.role === "admin"}
    />
  );
}
