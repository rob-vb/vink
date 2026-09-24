import type { Metadata } from "next";
import { requireAdmin } from "../organisation";
import { FormsList } from "./forms-list";

export const metadata: Metadata = { title: "Forms · DocuHelper" };

export default async function FormsPage({ params }: PageProps<"/o/[slug]/forms">) {
  const { slug } = await params;
  await requireAdmin(slug);
  return <FormsList organisationSlug={slug} />;
}
