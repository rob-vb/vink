import type { Metadata } from "next";
import { ExtractingList } from "./extracting-list";

export const metadata: Metadata = { title: "Extracting · DocuHelper" };

export default async function ExtractingPage({
  params,
}: PageProps<"/o/[slug]/documents/extracting">) {
  const { slug } = await params;
  return <ExtractingList organisationSlug={slug} />;
}
