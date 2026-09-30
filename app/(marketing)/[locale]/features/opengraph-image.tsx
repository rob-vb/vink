import { ogCard, ogImageMetadata, ogLocale, ogText } from "@/components/marketing/og-card";

// The Features page body is built separately; its card text lives in
// common.json (og.features) so this file doesn't depend on features.json.
export function generateImageMetadata({ params }: { params: unknown }) {
  return ogImageMetadata(params, "common", "og.features");
}

export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const { title, locale } = await ogText(await ogLocale(params), "common", "og.features");
  return ogCard({ title, locale, eyebrow: locale === "nl" ? "Functies" : "Features" });
}
