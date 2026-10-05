import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/legal-page";
import { isLocale, routing, type Locale } from "@/i18n/routing";
import { pageMetadata } from "@/lib/seo";

function localeOf(value: string): Locale {
  return isLocale(value) ? value : routing.defaultLocale;
}

// Placeholder until the legal text arrives: kept out of the index.
export async function generateMetadata({ params }: PageProps<"/[locale]/privacy">): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata({ locale: localeOf(locale), path: "/privacy", ns: "legal", key: "privacy.meta", noindex: true });
}

export default async function PrivacyPage({ params }: PageProps<"/[locale]/privacy">) {
  const locale = localeOf((await params).locale);
  return (
    <LegalPage
      locale={locale}
      doc="privacy"
      points={["security", "contact", "analytics", "cookies", "questions"]}
      links={{ terms: "/terms", subprocessors: "/terms#subprocessors", contact: "/contact" }}
    />
  );
}
