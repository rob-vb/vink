import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { VinkLogo } from "./brand";
import { AccountLink, StartFreeLink } from "./cta-links";
import { LanguageSwitcher } from "./language-switcher";
import { MobileNav } from "./mobile-nav";
import { ThemeToggle } from "./theme-toggle";

export const navItems = [
  { href: "/features", key: "features" },
  { href: "/pricing", key: "pricing" },
  { href: "/developers", key: "developers" },
] as const;

export function SiteHeader() {
  const t = useTranslations("common");
  const labels = { en: t("languages.en"), nl: t("languages.nl") };
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur-md supports-backdrop-filter:bg-background/75">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:shadow"
      >
        {t("nav.skip")}
      </a>
      <div className="mx-auto flex h-15 max-w-6xl items-center gap-6 px-4 sm:px-6 lg:px-8">
        <Link href="/" aria-label={t("nav.home")} className="shrink-0 text-navy">
          <VinkLogo className="h-5.5 w-auto" title="Vink" />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 text-sm md:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-2.5 py-1.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              {t(`nav.${item.key}`)}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <LanguageSwitcher labels={labels} label={t("nav.language")} className="hidden sm:flex" />
          <ThemeToggle label={t("nav.theme")} />
          <AccountLink
            location="nav"
            logIn={t("nav.logIn")}
            openApp={t("nav.openApp")}
            className="hidden rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground md:inline-flex"
          />
          <StartFreeLink location="nav" className={buttonVariants({ size: "lg", className: "px-3.5" })}>
            {t("nav.startFree")}
          </StartFreeLink>
          <MobileNav
            labels={{
              menu: t("nav.menu"),
              openMenu: t("nav.openMenu"),
              logIn: t("nav.logIn"),
              openApp: t("nav.openApp"),
              startFree: t("nav.startFree"),
              language: t("nav.language"),
              items: navItems.map((item) => ({ href: item.href, label: t(`nav.${item.key}`) })),
              languages: labels,
            }}
          />
        </div>
      </div>
    </header>
  );
}
