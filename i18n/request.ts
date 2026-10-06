import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { locale as rootLocale } from "next/root-params";
import { LOCALE_COOKIE } from "./remember";
import { isLocale, routing, type Locale } from "./routing";

// One message file per page or area, so each can be edited on its own.
// Every file's content sits under its own namespace: messages/en/home.json → t("home.…").
export const marketingNamespaces = [
  "common",
  "home",
  "features",
  "demo",
  "pricing",
  "developers",
  "developersApi",
  "security",
  "contact",
  "legal",
  "cookies",
] as const;

// The app's own files, never sent to the marketing site and the other way round.
export const appNamespaces = [
  "app",
  "appDocuments",
  "appForms",
  "appMembers",
  "appIntegrations",
  "appSettings",
] as const;

type Namespace = (typeof marketingNamespaces)[number] | (typeof appNamespaces)[number];

export async function loadMessages(locale: Locale, namespaces: readonly Namespace[] = marketingNamespaces) {
  const entries = await Promise.all(
    namespaces.map(async (ns) => [ns, (await import(`../messages/${locale}/${ns}.json`)).default]),
  );
  return Object.fromEntries(entries);
}

// The marketing site's locale comes from its root layout's [locale] segment
// (or an explicit locale), so its pages stay static. The app has no locale
// segment: it reads the language the visitor picked from NEXT_LOCALE, which
// both language switchers write, and is Dutch until they pick.
export default getRequestConfig(async ({ locale: explicit }) => {
  const candidate = explicit ?? (await rootLocale());
  if (isLocale(candidate)) {
    return { locale: candidate, messages: await loadMessages(candidate, marketingNamespaces) };
  }
  const picked = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(picked) ? picked : routing.defaultLocale;
  return { locale, messages: await loadMessages(locale, appNamespaces) };
});
