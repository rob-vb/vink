import { ogCard, ogImageMetadata, ogLocale, ogText } from "@/components/marketing/og-card";

export function generateImageMetadata({ params }: { params: unknown }) {
  return ogImageMetadata(params, "security");
}

export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const { title, locale } = await ogText(await ogLocale(params), "security");
  return ogCard({ title, locale, eyebrow: locale === "nl" ? "Beveiliging en privacy" : "Security & privacy" });
}
