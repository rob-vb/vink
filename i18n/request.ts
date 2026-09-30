import { getRequestConfig } from "next-intl/server";
import { locale as rootLocale } from "next/root-params";
import { isLocale, routing } from "./routing";

// Reads the locale from the marketing root layout's [locale] segment, so pages
// stay static. The app has no locale segment and falls back to English.
export default getRequestConfig(async () => {
  const candidate = await rootLocale();
  const locale = isLocale(candidate) ? candidate : routing.defaultLocale;
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
