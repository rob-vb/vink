import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { VinkLogo } from "./brand";
import { CookieSettingsButton } from "./consent-banner";
import { LogInLink } from "./cta-links";
import { LanguageSwitcher } from "./language-switcher";

const linkClass = "text-muted-foreground transition-colors hover:text-foreground";

export function SiteFooter() {
  const t = useTranslations("common");
  // Static pages are built once; the year is the build's year.
  const year = new Date().getFullYear();
  const columns = [
    {
      title: t("footer.product"),
      links: [
        { href: "/features", label: t("footer.features") },
        { href: "/pricing", label: t("footer.pricing") },
        { href: "/developers", label: t("footer.developers") },
        { href: "/security", label: t("footer.security") },
      ],
    },
    {
      title: t("footer.company"),
      links: [
        { href: "/contact", label: t("footer.contact") },
        { href: "/developers#integration-service", label: t("footer.integration") },
      ],
    },
    {
      title: t("footer.legal"),
      links: [
        { href: "/privacy", label: t("footer.privacy") },
        { href: "/terms", label: t("footer.terms") },
        { href: "/security#subprocessors", label: t("footer.subprocessors") },
      ],
    },
  ];
  return (
    <footer className="mt-auto border-t bg-panel/60">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[2fr_repeat(3,1fr)] lg:px-8">
        <div className="max-w-xs">
          <VinkLogo className="h-5.5 w-auto text-navy" />
          <p className="mt-4 text-sm text-muted-foreground">{t("footer.tagline")}</p>
        </div>
        {columns.map((column) => (
          <div key={column.title}>
            <h2 className="text-sm font-semibold">{column.title}</h2>
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className={linkClass}>
                    {link.label}
                  </Link>
                </li>
              ))}
              {column.title === t("footer.company") && (
                <li>
                  <LogInLink location="footer" className={linkClass}>
                    {t("footer.logIn")}
                  </LogInLink>
                </li>
              )}
              {column.title === t("footer.legal") && (
                <li>
                  <CookieSettingsButton>{t("footer.cookieSettings")}</CookieSettingsButton>
                </li>
              )}
            </ul>
          </div>
        ))}
      </div>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 border-t px-4 py-5 text-sm text-muted-foreground sm:px-6 lg:px-8">
        <p>{t("footer.rights", { year })}</p>
        <LanguageSwitcher
          labels={{ en: t("languages.en"), nl: t("languages.nl") }}
          label={t("footer.language")}
          long
          className="-mx-1.5"
        />
      </div>
    </footer>
  );
}
