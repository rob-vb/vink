import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { legalSections, LegalHeader } from "@/components/marketing/legal-page";
import { TocLayout } from "@/components/marketing/toc";
import { isLocale, routing, type Locale } from "@/i18n/routing";
import { pageMetadata } from "@/lib/seo";
import { STRIPE_PRIVACY } from "@/lib/site";

function localeOf(value: string): Locale {
  return isLocale(value) ? value : routing.defaultLocale;
}

export async function generateMetadata({ params }: PageProps<"/[locale]/privacy">): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata({ locale: localeOf(locale), path: "/privacy", ns: "legal", key: "privacy.meta" });
}

// Rich-text tags in legal.privacy: the Terms sections it points to, and other parties' pages.
const links = {
  terms: "/terms",
  retention: "/terms#retention",
  subprocessors: "/terms#subprocessors",
  access: "/terms#access",
  transit: "/terms#transit",
  stripe: STRIPE_PRIVACY,
  google: "https://developers.google.com/terms/api-services-user-data-policy",
  ap: "https://www.autoriteitpersoonsgegevens.nl",
};

export default async function PrivacyPage({ params }: PageProps<"/[locale]/privacy">) {
  const locale = localeOf((await params).locale);
  const t = await getTranslations({ locale, namespace: "legal.privacy" });
  const { items, nodes } = await legalSections(locale, "privacy", links);
  return (
    <main>
      <LegalHeader locale={locale} doc="privacy" />
      <TocLayout label={t("toc")} items={items}>
        {nodes}
      </TocLayout>
      <div className="h-16 sm:h-24" />
    </main>
  );
}
