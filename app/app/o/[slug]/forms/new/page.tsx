import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireAdmin } from "../../organisation";
import { NewForm } from "./new-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("appForms.new");
  return { title: t("metaTitle") };
}

export default async function NewFormPage({
  params,
  searchParams,
}: PageProps<"/app/o/[slug]/forms/new">) {
  const { slug } = await params;
  const { blank } = await searchParams;
  await requireAdmin(slug);
  return <NewForm organisationSlug={slug} startBlank={blank === "1"} />;
}
