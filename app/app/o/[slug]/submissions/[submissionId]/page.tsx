import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { Id } from "@/convex/_generated/dataModel";
import { getOrganisation } from "../../organisation";
import { ReviewScreen } from "./review-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("appSubmissions.review");
  return { title: t("metaTitle") };
}

export default async function SubmissionPage({
  params,
}: PageProps<"/app/o/[slug]/submissions/[submissionId]">) {
  const { slug, submissionId } = await params;
  // Checks the Membership before anything renders.
  const organisation = await getOrganisation(slug);

  return (
    <ReviewScreen
      organisationSlug={slug}
      submissionId={submissionId as Id<"submissions">}
      isAdmin={organisation.role === "admin"}
    />
  );
}
