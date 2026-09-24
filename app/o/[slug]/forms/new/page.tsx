import type { Metadata } from "next";
import { requireAdmin } from "../../organisation";
import { NewForm } from "./new-form";

export const metadata: Metadata = { title: "New Form · DocuHelper" };

export default async function NewFormPage({
  params,
  searchParams,
}: PageProps<"/o/[slug]/forms/new">) {
  const { slug } = await params;
  const { blank } = await searchParams;
  await requireAdmin(slug);
  return <NewForm organisationSlug={slug} startBlank={blank === "1"} />;
}
