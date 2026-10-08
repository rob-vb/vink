import { ArrowRight, FileText, ShieldCheck, Users, Webhook } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ClosingCard, Faq } from "@/components/marketing/blocks";
import { JsonLd } from "@/components/marketing/json-ld";
import { PricingCards } from "@/components/marketing/pricing-cards";
import { Container, SectionHeading } from "@/components/marketing/section";
import { Link } from "@/i18n/navigation";
import { isLocale, routing, type Locale } from "@/i18n/routing";
import { CURRENCY, custom, formatEuro, plans } from "@/lib/plans";
import { localeUrl, pageMetadata } from "@/lib/seo";

function localeOf(value: string): Locale {
  return isLocale(value) ? value : routing.defaultLocale;
}

export async function generateMetadata({ params }: PageProps<"/[locale]/pricing">): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata({ locale: localeOf(locale), path: "/pricing", ns: "pricing" });
}

const inlineLink = "font-medium text-foreground underline underline-offset-3";

export default async function PricingPage({ params }: PageProps<"/[locale]/pricing">) {
  const locale = localeOf((await params).locale);
  const t = await getTranslations({ locale, namespace: "pricing" });

  const includes = [
    { key: "users", icon: Users },
    { key: "forms", icon: FileText },
    { key: "review", icon: ShieldCheck },
    { key: "integrations", icon: Webhook },
  ] as const;

  const faqKeys = ["users", "page", "runOut", "rollover", "vat", "cancel", "intake"] as const;
  const faqItems = faqKeys.map((key) => ({
    id: key,
    question: t(`faq.${key}.q`),
    answer: t.rich(`faq.${key}.a`, {
      link: (chunks) => (
        <Link href="/contact" className={inlineLink}>
          {chunks}
        </Link>
      ),
    }),
  }));
  const half = Math.ceil(faqItems.length / 2);

  return (
    <main>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "Vink",
          applicationCategory: "BusinessApplication",
          operatingSystem: "Web",
          url: localeUrl(locale, "/"),
          description: t("jsonld.description"),
          offers: plans.map((plan) => ({
            "@type": "Offer",
            name: plan.name,
            price: plan.monthly.toFixed(2),
            priceCurrency: CURRENCY,
            description: t("jsonld.offer", { count: plan.items }),
            url: localeUrl(locale, "/pricing"),
            priceSpecification: {
              "@type": "UnitPriceSpecification",
              price: plan.monthly.toFixed(2),
              priceCurrency: CURRENCY,
              valueAddedTaxIncluded: false,
              unitText: "MONTH",
              referenceQuantity: { "@type": "QuantitativeValue", value: 1, unitCode: "MON" },
            },
          })),
        }}
      />

      <section className="pt-14 pb-10 sm:pt-20">
        <Container className="flex flex-col items-center gap-10">
          <SectionHeading
            as="h1"
            eyebrow={t("header.eyebrow")}
            title={t("header.title")}
            subtitle={t("header.subtitle")}
            center
            className="max-w-3xl"
          />
          <PricingCards />
          <p className="text-center text-muted-foreground">{t("free")}</p>
        </Container>
      </section>

      <section className="pb-16 sm:pb-24">
        <Container>
          <div className="flex flex-col gap-6 rounded-2xl border bg-panel p-7 sm:p-9 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <h2 className="text-lg font-semibold">{custom.name}</h2>
              <p className="mt-1 text-2xl font-semibold tracking-tight text-balance">{t("custom.title")}</p>
              <p className="mt-2 text-muted-foreground">
                {t("custom.body", { price: formatEuro(custom.fromMonthly, locale) })}
              </p>
              <ul className="mt-4 flex flex-wrap gap-2">
                {(["volume", "invoice", "terms", "sla"] as const).map((key) => (
                  <li key={key}>
                    <Badge variant="outline" className="h-7 bg-card px-3 text-sm font-normal">
                      {t(`custom.chips.${key}`)}
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
            <Link href="/contact" className={buttonVariants({ size: "lg", className: "h-10 shrink-0 self-start px-5 lg:self-center" })}>
              {t("custom.cta")}
              <ArrowRight />
            </Link>
          </div>
        </Container>
      </section>

      <section className="border-y bg-panel/60 py-16 sm:py-24">
        <Container>
          <SectionHeading title={t("includes.title")} className="mb-10" />
          <ul className="grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
            {includes.map(({ key, icon: Icon }) => (
              <li key={key} className="flex gap-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg border bg-card">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span>
                  <span className="block font-semibold">{t(`includes.${key}.title`)}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">{t(`includes.${key}.body`)}</span>
                </span>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <section className="pt-16 pb-8 sm:pt-24">
        <Container>
          <h2 className="mb-8 text-3xl font-semibold tracking-tight">{t("faq.title")}</h2>
          <div className="grid gap-x-12 md:grid-cols-2">
            <Faq items={faqItems.slice(0, half)} />
            <Faq items={faqItems.slice(half)} defaultOpen={null} className="border-t-0 md:border-t" />
          </div>
        </Container>
      </section>

      <ClosingCard location="pricing" />
    </main>
  );
}
