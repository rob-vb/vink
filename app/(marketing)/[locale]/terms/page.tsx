import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Container } from "@/components/marketing/section";
import { DocSection, TocLayout } from "@/components/marketing/toc";
import { Link } from "@/i18n/navigation";
import { isLocale, routing, type Locale } from "@/i18n/routing";
import { pageMetadata } from "@/lib/seo";
import { POLAR_PRIVACY, SECURITY_EMAIL, STRIPE_PRIVACY } from "@/lib/site";

function localeOf(value: string): Locale {
  return isLocale(value) ? value : routing.defaultLocale;
}

// Placeholder until the legal text arrives: kept out of the index.
export async function generateMetadata({ params }: PageProps<"/[locale]/terms">): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata({ locale: localeOf(locale), path: "/terms", ns: "legal", key: "terms.meta", noindex: true });
}

// The data and security sections: only statements ticket 13 lists as true may appear here.
const sections = [
  { id: "plans", key: "plans" },
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
  { key: "convex", name: "Convex" },
  { key: "r2", name: "Cloudflare R2" },
  { key: "vertex", name: "Google Cloud Vertex AI" },
  { key: "typesafe", name: "TypeSafe (Jev)" },
  { key: "resend", name: "Resend" },
  { key: "email", name: "Cloudflare Email Routing and Workers" },
  { key: "polar", name: "Polar" },
  { key: "stripe", name: "Stripe" },
] as const;

// TypeSafe's own terms, linked from the "may keep logs" clause. Drop that
// clause (and this link) if TypeSafe grants zero retention before launch.
const TYPESAFE_TERMS = "https://typesafe.ai/legal/mca";

// What a row's <link> points to: the party's own terms or privacy policy.
const rowLinks: Partial<Record<(typeof subprocessors)[number]["key"], string>> = {
  typesafe: TYPESAFE_TERMS,
  polar: POLAR_PRIVACY,
  stripe: STRIPE_PRIVACY,
};

const inlineLink = "font-medium text-foreground underline underline-offset-3";

function Points({ items }: { items: ReactNode[] }) {
  return (
    <ul className="flex list-disc flex-col gap-2.5 pl-5 marker:text-muted-foreground/60">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export default async function TermsPage({ params }: PageProps<"/[locale]/terms">) {
  const locale = localeOf((await params).locale);
  const t = await getTranslations({ locale, namespace: "security" });
  const legal = await getTranslations({ locale, namespace: "legal.terms" });
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
      <section className="pt-14 pb-12 sm:pt-20 sm:pb-16">
        <Container>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{legal("title")}</h1>
          <p className="mt-4 max-w-[60ch] text-muted-foreground">{legal("pending")}</p>
        </Container>
      </section>

      <TocLayout
        label={t("toc.label")}
        items={sections.map((s) => ({ id: s.id, label: s.key === "plans" ? legal("plansTitle") : t(`toc.${s.key}`) }))}
      >
        <DocSection id="plans" title={legal("plansTitle")}>
          <Points
            items={(["plans", "custom", "questions"] as const).map((key) =>
              legal.rich(`points.${key}`, { pricing: link("/pricing"), contact: link("/contact") }),
            )}
          />
        </DocSection>

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
