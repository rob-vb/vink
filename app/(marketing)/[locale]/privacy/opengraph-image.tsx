import { homeImage, homeImageMetadata } from "@/components/marketing/home-og";

export function generateImageMetadata({ params }: { params: unknown }) {
  return homeImageMetadata(params);
}

export default function Image({ params }: { params: Promise<{ locale: string }> }) {
  return homeImage(params);
}
