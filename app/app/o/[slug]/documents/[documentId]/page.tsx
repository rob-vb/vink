import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { Id } from "@/convex/_generated/dataModel";
import { getOrganisation } from "../../organisation";
import { ReviewScreen } from "./review-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("appDocuments.review");
  return { title: t("metaTitle") };
}

export default async function DocumentPage({
  params,
}: PageProps<"/app/o/[slug]/documents/[documentId]">) {
  const { slug, documentId } = await params;
  // Checks the Membership before anything renders.
  const organisation = await getOrganisation(slug);

  return (
    <ReviewScreen
      organisationSlug={slug}
      documentId={documentId as Id<"documents">}
      isAdmin={organisation.role === "admin"}
    />
  );
}
