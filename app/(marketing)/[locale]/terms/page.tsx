import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/legal-page";
import { isLocale, routing, type Locale } from "@/i18n/routing";
import { pageMetadata } from "@/lib/seo";

function localeOf(value: string): Locale {
  return isLocale(value) ? value : routing.defaultLocale;
}

// Placeholder until the legal text arrives: kept out of the index.
export async function generateMetadata({ params }: PageProps<"/[locale]/terms">): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata({ locale: localeOf(locale), path: "/terms", ns: "legal", key: "terms.meta", noindex: true });
}

export default async function TermsPage({ params }: PageProps<"/[locale]/terms">) {
  const locale = localeOf((await params).locale);
  return (
    <LegalPage
      locale={locale}
      doc="terms"
      points={["plans", "custom", "questions"]}
      links={{ pricing: "/pricing", contact: "/contact" }}
    />
  );
}
