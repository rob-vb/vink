import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { FounderBlock } from "@/components/marketing/blocks";
import { LogInLink } from "@/components/marketing/cta-links";
import { RequestForm } from "@/components/marketing/request-form";
import { Container, SectionHeading } from "@/components/marketing/section";
import { Link } from "@/i18n/navigation";
import { isLocale, routing, type Locale } from "@/i18n/routing";
import { pageMetadata } from "@/lib/seo";
import { FOUNDER_EMAIL } from "@/lib/site";

function localeOf(value: string): Locale {
  return isLocale(value) ? value : routing.defaultLocale;
}

export async function generateMetadata({ params }: PageProps<"/[locale]/contact">): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata({ locale: localeOf(locale), path: "/contact", ns: "contact" });
}

const inlineLink = "font-medium text-foreground underline underline-offset-3";

export default async function ContactPage({ params }: PageProps<"/[locale]/contact">) {
  const locale = localeOf((await params).locale);
  const t = await getTranslations({ locale, namespace: "contact" });
  return (
    <main className="pt-14 pb-20 sm:pt-20 sm:pb-28">
      <Container>
        <SectionHeading as="h1" eyebrow={t("header.eyebrow")} title={t("header.title")} subtitle={t("header.subtitle")} />
        <div className="mt-12 grid gap-12 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:gap-16">
          <div>
            <h2 className="mb-4 text-xl font-semibold">{t("formTitle")}</h2>
            <RequestForm kind="contact" fallbackEmail={FOUNDER_EMAIL} />
            <p className="mt-4 text-sm text-muted-foreground">
              {t.rich("direct", {
                email: () => (
                  <a href={`mailto:${FOUNDER_EMAIL}`} className={`${inlineLink} font-mono`}>
                    {FOUNDER_EMAIL}
                  </a>
                ),
              })}
            </p>
          </div>
          <div className="flex flex-col gap-10">
            <FounderBlock className="rounded-2xl border bg-panel p-6 sm:p-8" />
            <div>
              <h2 className="text-base font-semibold">{t("other.title")}</h2>
              <ul className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground">
                <li>
                  {t.rich("other.integration", {
                    link: (chunks) => (
                      <Link href="/developers#integration-service" className={inlineLink}>
                        {chunks}
                      </Link>
                    ),
                  })}
                </li>
                <li>
                  {t.rich("other.security", {
                    link: (chunks) => (
                      <Link href="/security#report" className={inlineLink}>
                        {chunks}
                      </Link>
                    ),
                  })}
                </li>
                <li>
                  {t.rich("other.app", {
                    link: (chunks) => (
                      <LogInLink location="contact" className={inlineLink}>
                        {chunks}
                      </LogInLink>
                    ),
                  })}
                </li>
              </ul>
            </div>
          </div>
        </div>
      </Container>
    </main>
  );
}
