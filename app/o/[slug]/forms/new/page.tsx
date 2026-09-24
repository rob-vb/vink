import type { Metadata } from "next";
import { requireAdmin } from "../../organisation";
import { FormEditor } from "../form-editor";

export const metadata: Metadata = { title: "New Form · DocuHelper" };

export default async function NewFormPage({ params }: PageProps<"/o/[slug]/forms/new">) {
  const { slug } = await params;
  await requireAdmin(slug);
  return (
    <FormEditor
      organisationSlug={slug}
      initial={{ name: "", description: "", fields: [] }}
    />
  );
}
