import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireAdmin } from "../organisation";
import { FormsList } from "./forms-list";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("appForms.list");
  return { title: t("metaTitle") };
}

export default async function FormsPage({ params }: PageProps<"/app/o/[slug]/forms">) {
  const { slug } = await params;
  await requireAdmin(slug);
  return <FormsList organisationSlug={slug} />;
}
