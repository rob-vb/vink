import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { Id } from "@/convex/_generated/dataModel";
import { requireAdmin } from "../../../organisation";
import { ProposalScreen } from "./proposal-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("appForms.proposal");
  return { title: t("metaTitle") };
}

export default async function ProposalPage({
  params,
}: PageProps<"/app/o/[slug]/forms/proposals/[proposalId]">) {
  const { slug, proposalId } = await params;
  await requireAdmin(slug);
  return <ProposalScreen organisationSlug={slug} proposalId={proposalId as Id<"formProposals">} />;
}
