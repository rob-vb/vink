import { defineRouting } from "next-intl/routing";

// Dutch lives at `/`, English at `/en`. No browser-language redirect, and the
// language switchers write their own year-long NEXT_LOCALE cookie (see
// i18n/remember.ts), so next-intl's cookie is off. The app has no prefix and
// reads that cookie instead (i18n/request.ts).
export const routing = defineRouting({
  // This order is the language switcher's order.
  locales: ["nl", "en"],
  defaultLocale: "nl",
  localePrefix: "as-needed",
  localeDetection: false,
  localeCookie: false,
  alternateLinks: false,
});

export type Locale = (typeof routing.locales)[number];

export function isLocale(value: unknown): value is Locale {
  return routing.locales.includes(value as Locale);
}
