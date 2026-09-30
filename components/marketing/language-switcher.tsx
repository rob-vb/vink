"use client";

import { useLocale } from "next-intl";
import { usePathname } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";

// No browser-language detection anywhere: the visitor picks, and the choice
// is kept in NEXT_LOCALE for a year (the app may read it later).
function remember(locale: Locale) {
  document.cookie = `NEXT_LOCALE=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

function hrefFor(locale: Locale, pathname: string) {
  if (locale === routing.defaultLocale) return pathname;
  return pathname === "/" ? `/${locale}` : `/${locale}${pathname}`;
}

/** EN / NL, linking to the same page in the other language. */
export function LanguageSwitcher({
  labels,
  label,
  long = false,
  className,
}: {
  labels: Record<Locale, string>;
  label: string;
  /** "English · Nederlands" in the footer, "EN · NL" in the nav. */
  long?: boolean;
  className?: string;
}) {
  const current = useLocale() as Locale;
  const pathname = usePathname();
  return (
    <nav aria-label={label} className={cn("flex items-center gap-1 text-sm", className)}>
      {routing.locales.map((locale) => {
        const active = locale === current;
        return (
          <a
            key={locale}
            href={hrefFor(locale, pathname)}
            hrefLang={locale}
            lang={locale}
            aria-current={active ? "true" : undefined}
            title={labels[locale]}
            onClick={(event) => {
              remember(locale);
              if (window.location.hash) {
                event.preventDefault();
                window.location.assign(hrefFor(locale, pathname) + window.location.hash);
              }
            }}
            className={cn(
              "rounded-md px-1.5 py-1 transition-colors",
              active ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {long ? labels[locale] : locale.toUpperCase()}
          </a>
        );
      })}
    </nav>
  );
}
