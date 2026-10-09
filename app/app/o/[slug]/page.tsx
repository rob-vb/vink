import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SubmissionList } from "./submissions/submission-list";
import { getOrganisation } from "./organisation";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.titles");
  return { title: t("submissions") };
}

export default async function OrganisationHome({ params }: PageProps<"/app/o/[slug]">) {
  const { slug } = await params;
  const organisation = await getOrganisation(slug);

  return (
    <SubmissionList
      organisationSlug={slug}
      organisationName={organisation.name}
      isAdmin={organisation.role === "admin"}
    />
  );
}
