import { isLocale, routing } from "@/i18n/routing";

/**
 * The 30-second product film, one per language, in public/video. Rendered and
 * compressed outside the repo (the Remotion project on the data volume).
 */
export function demoVideo(locale: string) {
  const lang = isLocale(locale) ? locale : routing.defaultLocale;
  return {
    src: `/video/vink-demo-${lang}.mp4`,
    poster: `/video/vink-demo-${lang}.jpg`,
  };
}
