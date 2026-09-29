import type { Metadata } from "next";
import type { Id } from "@/convex/_generated/dataModel";
import { requireAdmin } from "../../../organisation";
import { ProposalScreen } from "./proposal-screen";

export const metadata: Metadata = { title: "Proposed Fields · Vink" };

export default async function ProposalPage({
  params,
}: PageProps<"/o/[slug]/forms/proposals/[proposalId]">) {
  const { slug, proposalId } = await params;
  await requireAdmin(slug);
  return <ProposalScreen organisationSlug={slug} proposalId={proposalId as Id<"formProposals">} />;
}
