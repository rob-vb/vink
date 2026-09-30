import { defineRouting } from "next-intl/routing";

// English lives at `/`, Dutch at `/nl`. No browser-language redirect, and the
// language switcher writes its own year-long NEXT_LOCALE cookie (see
// components/marketing/language-switcher.tsx), so next-intl's cookie is off.
export const routing = defineRouting({
  locales: ["en", "nl"],
  defaultLocale: "en",
  localePrefix: "as-needed",
  localeDetection: false,
  localeCookie: false,
  alternateLinks: false,
});

export type Locale = (typeof routing.locales)[number];

export function isLocale(value: unknown): value is Locale {
  return routing.locales.includes(value as Locale);
}
