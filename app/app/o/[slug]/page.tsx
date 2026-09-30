import type { Metadata } from "next";
import { DocumentList } from "./documents/document-list";
import { getOrganisation } from "./organisation";

export const metadata: Metadata = { title: "Documents · Vink" };

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
