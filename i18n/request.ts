import { getRequestConfig } from "next-intl/server";
import { locale as rootLocale } from "next/root-params";
import { isLocale, routing, type Locale } from "./routing";

// One message file per page or area, so each can be edited on its own.
// Every file's content sits under its own namespace: messages/en/home.json → t("home.…").
export const namespaces = [
  "common",
  "home",
  "features",
  "demo",
  "pricing",
  "developers",
  "security",
  "contact",
  "legal",
  "cookies",
] as const;

export async function loadMessages(locale: Locale) {
  const entries = await Promise.all(
    namespaces.map(async (ns) => [ns, (await import(`../messages/${locale}/${ns}.json`)).default]),
  );
  return Object.fromEntries(entries);
}

// Reads the locale from the marketing root layout's [locale] segment, so pages
// stay static. The app has no locale segment and falls back to English.
export default getRequestConfig(async () => {
  const candidate = await rootLocale();
  const locale = isLocale(candidate) ? candidate : routing.defaultLocale;
  return { locale, messages: await loadMessages(locale) };
});
