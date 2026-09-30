import { homeImage, homeImageMetadata } from "@/components/marketing/home-og";

// Home's card. Contact, Privacy and Terms render the same card.
export function generateImageMetadata({ params }: { params: unknown }) {
  return homeImageMetadata(params);
}

export default function Image({ params }: { params: Promise<{ locale: string }> }) {
  return homeImage(params);
}
