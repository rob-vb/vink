import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { routing, type Locale } from "@/i18n/routing";
import { absoluteUrl } from "@/lib/site";

/** A marketing page's public path in a locale: Dutch unprefixed, English under /en. */
export function localePath(locale: Locale, path: string) {
  if (locale === routing.defaultLocale) return path;
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}

export function localeUrl(locale: Locale, path: string) {
  return absoluteUrl(localePath(locale, path));
}

/** hreflang for one page: en, nl and x-default (the unprefixed default), all from SITE_URL. */
export function languageAlternates(path: string) {
  return {
    en: localeUrl("en", path),
    nl: localeUrl("nl", path),
    "x-default": localeUrl(routing.defaultLocale, path),
  };
}

const ogLocale = { en: "en_GB", nl: "nl_NL" } as const;

type Namespace = "home" | "features" | "pricing" | "developers" | "developersApi" | "contact" | "legal";

/**
 * Every marketing page's metadata: localized title and description from the
 * page's `meta` messages, its own canonical, en/nl/x-default alternates and
 * the Open Graph basics. OG images come from the `opengraph-image` files.
 */
export async function pageMetadata({
  locale,
  path,
  ns,
  key = "meta",
  absoluteTitle = false,
  noindex = false,
}: {
  locale: Locale;
  path: string;
  ns: Namespace;
  /** Where the title and description live inside the namespace. */
  key?: string;
  /** Home: the title template only applies to child segments. */
  absoluteTitle?: boolean;
  noindex?: boolean;
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: ns });
  const title = t(`${key}.title` as never) as string;
  const description = t(`${key}.description` as never) as string;
  const url = localeUrl(locale, path);
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: url, languages: languageAlternates(path) },
    openGraph: {
      type: "website",
      siteName: "Vink",
      url,
      title: absoluteTitle ? title : `${title} · Vink`,
      description,
      locale: ogLocale[locale],
      alternateLocale: routing.locales.filter((l) => l !== locale).map((l) => ogLocale[l]),
    },
    ...(noindex ? { robots: { index: false, follow: true } } : {}),
  };
}
