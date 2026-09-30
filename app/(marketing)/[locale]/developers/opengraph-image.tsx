import { ogCard, ogImageMetadata, ogLocale, ogText } from "@/components/marketing/og-card";

export function generateImageMetadata({ params }: { params: unknown }) {
  return ogImageMetadata(params, "developers");
}

export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const { title, locale } = await ogText(await ogLocale(params), "developers");
  return ogCard({ title, locale, eyebrow: "Developers" });
}
