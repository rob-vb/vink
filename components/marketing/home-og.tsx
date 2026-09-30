import { ogCard, ogImageMetadata, ogLocale, ogText } from "./og-card";

// Home's card, reused by pages without their own (Contact, Privacy, Terms).
// A page's own `openGraph` metadata replaces the inherited images, so each of
// those pages has an opengraph-image file that renders this card.
export function homeImageMetadata(params: unknown) {
  return ogImageMetadata(params, "home");
}

export async function homeImage(params: unknown) {
  const { title, locale } = await ogText(await ogLocale(params), "home");
  return ogCard({ title, locale });
}
