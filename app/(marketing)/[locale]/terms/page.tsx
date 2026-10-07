import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { inlineLink, legalSections, LegalHeader, Points } from "@/components/marketing/legal-page";
import { DocSection, TocLayout } from "@/components/marketing/toc";
import { Link } from "@/i18n/navigation";
import { isLocale, routing, type Locale } from "@/i18n/routing";
import { pageMetadata } from "@/lib/seo";
import { SECURITY_EMAIL, STRIPE_PRIVACY } from "@/lib/site";

function localeOf(value: string): Locale {
  return isLocale(value) ? value : routing.defaultLocale;
}

export async function generateMetadata({ params }: PageProps<"/[locale]/terms">): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata({ locale: localeOf(locale), path: "/terms", ns: "legal", key: "terms.meta" });
}

// Rich-text tags in legal.terms: the data sections below, and other pages.
const termsLinks = {
  pricing: "/pricing",
  report: "#report",
  retention: "#retention",
  subprocessors: "#subprocessors",
  access: "#access",
  transit: "#transit",
};

// The data and security sections after the terms: only statements ticket 13 lists as true may appear here.
const sections = [
  { id: "where", key: "where" },
  { id: "retention", key: "retention" },
  { id: "subprocessors", key: "subprocessors" },
  { id: "access", key: "access" },
  { id: "transit", key: "transit" },
  { id: "not-yet", key: "notYet" },
  { id: "report", key: "report" },
] as const;

const subprocessors = [
  { key: "hetzner", name: "Hetzner" },
  { key: "cloudflare", name: "Cloudflare" },
  { key: "convex", name: "Convex" },
  { key: "r2", name: "Cloudflare R2" },
  { key: "vertex", name: "Google Cloud Vertex AI" },
  { key: "typesafe", name: "TypeSafe (Jev)" },
  { key: "resend", name: "Resend" },
  { key: "email", name: "Cloudflare Email Routing and Workers" },
  { key: "stripe", name: "Stripe" },
] as const;

// TypeSafe's own terms, linked from the "may keep logs" clause. We don't ask
// TypeSafe for zero retention (decided 2026-10-07), so the clause stays.
const TYPESAFE_TERMS = "https://typesafe.ai/legal/mca";

// What a row's <link> points to: the party's own terms or privacy policy.
const rowLinks: Partial<Record<(typeof subprocessors)[number]["key"], string>> = {
  typesafe: TYPESAFE_TERMS,
  stripe: STRIPE_PRIVACY,
};

export default async function TermsPage({ params }: PageProps<"/[locale]/terms">) {
  const locale = localeOf((await params).locale);
  const t = await getTranslations({ locale, namespace: "security" });
  const terms = await legalSections(locale, "terms", termsLinks);
  const b = (chunks: ReactNode) => <b>{chunks}</b>;
  const link = (href: string) =>
    function LinkTag(chunks: ReactNode) {
      return (
        <Link href={href} className={inlineLink}>
          {chunks}
        </Link>
      );
    };

  return (
    <main>
      <LegalHeader locale={locale} doc="terms" />

      <TocLayout
        label={t("toc.label")}
        items={[...terms.items, ...sections.map((s) => ({ id: s.id, label: t(`toc.${s.key}`) }))]}
      >
        {terms.nodes}

        <DocSection id="where" title={t("where.title")}>
          <Points items={(["app", "database", "pdfs", "reading"] as const).map((key) => t.rich(`where.${key}`, { b }))} />
          <p>
            {t.rich("where.us", {
              link: (chunks) => (
                <a href="#subprocessors" className={inlineLink}>
                  {chunks}
                </a>
              ),
            })}
          </p>
        </DocSection>

        <DocSection id="retention" title={t("retention.title")}>
          <Points
            items={(["default", "neverApproved", "rejected", "proposals", "what", "kept"] as const).map((key) =>
              t.rich(`retention.${key}`, { b }),
            )}
          />
          <p>{t("retention.now")}</p>
          <p>{t("retention.account")}</p>
        </DocSection>

        <DocSection id="subprocessors" title={t("subprocessors.title")}>
          <p>{t("subprocessors.intro")}</p>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <caption className="sr-only">{t("subprocessors.title")}</caption>
              <thead className="bg-muted/60 text-foreground">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-semibold">{t("subprocessors.name")}</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">{t("subprocessors.purpose")}</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">{t("subprocessors.region")}</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">{t("subprocessors.data")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {subprocessors.map((row) => (
                  <tr key={row.key}>
                    <th scope="row" className="px-4 py-3 align-top font-medium text-foreground">{row.name}</th>
                    <td className="px-4 py-3 align-top">{t(`subprocessors.rows.${row.key}.purpose`)}</td>
                    <td className="px-4 py-3 align-top whitespace-nowrap">{t(`subprocessors.rows.${row.key}.region`)}</td>
                    <td className="px-4 py-3 align-top">
                      {t.rich(`subprocessors.rows.${row.key}.data`, {
                        link: (chunks) => (
                          <a href={rowLinks[row.key]} className={inlineLink} rel="noopener noreferrer">
                            {chunks}
                          </a>
                        ),
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>{t("subprocessors.transfers")}</p>
        </DocSection>

        <DocSection id="access" title={t("access.title")}>
          <p>{t("access.isolation")}</p>
          <p>{t("access.roles")}</p>
          <Points
            items={(["members", "forms", "integrations", "retention", "delete"] as const).map((key) =>
              t(`access.admin.${key}`),
            )}
          />
          <p>{t("access.autoSend")}</p>
          <p>{t("access.signIn")}</p>
        </DocSection>

        <DocSection id="transit" title={t("transit.title")}>
          <Points
            items={(["https", "links", "endpoints", "secrets", "rest", "signed", "testSend"] as const).map((key) =>
              t.rich(`transit.${key}`, { link: link("/developers#verify-signature") }),
            )}
          />
        </DocSection>

        <DocSection id="not-yet" title={t("notYet.title")}>
          <Points items={(["certs", "twoFactor", "dpa"] as const).map((key) => t(`notYet.${key}`))} />
        </DocSection>

        <DocSection id="report" title={t("report.title")}>
          <p>
            {t.rich("report.body", {
              email: () => (
                <a href={`mailto:${SECURITY_EMAIL}`} className={`${inlineLink} font-mono`}>
                  {SECURITY_EMAIL}
                </a>
              ),
              securityTxt: (chunks) => (
                <a href="/.well-known/security.txt" className={`${inlineLink} font-mono`}>
                  {chunks}
                </a>
              ),
            })}
          </p>
          <p>{t.rich("report.other", { link: link("/contact") })}</p>
        </DocSection>
      </TocLayout>
      <div className="h-16 sm:h-24" />
    </main>
  );
}
