import type { Locale } from "./routing";

export const LOCALE_COOKIE = "NEXT_LOCALE";

/**
 * Keeps the visitor's language choice for a year, on the whole domain path:
 * the marketing switcher writes it, the app reads it (see i18n/request.ts).
 * Browser only.
 */
export function rememberLocale(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`;
}
