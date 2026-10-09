import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ExtractingList } from "./extracting-list";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("appSubmissions.extracting");
  return { title: t("metaTitle") };
}

export default async function ExtractingPage({
  params,
}: PageProps<"/app/o/[slug]/submissions/extracting">) {
  const { slug } = await params;
  return <ExtractingList organisationSlug={slug} />;
}
