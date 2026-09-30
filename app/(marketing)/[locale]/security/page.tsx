import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { TrustRow } from "@/components/marketing/blocks";
import { VinkMark } from "@/components/marketing/brand";
import { Container, SectionHeading } from "@/components/marketing/section";
import { DocSection, TocLayout } from "@/components/marketing/toc";
import { Link } from "@/i18n/navigation";
import { isLocale, routing, type Locale } from "@/i18n/routing";
import { pageMetadata } from "@/lib/seo";
import { SECURITY_EMAIL } from "@/lib/site";

function localeOf(value: string): Locale {
  return isLocale(value) ? value : routing.defaultLocale;
}

export async function generateMetadata({ params }: PageProps<"/[locale]/security">): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata({ locale: localeOf(locale), path: "/security", ns: "security" });
}

// Only statements ticket 13 lists as true may appear here.
const sections = [
  { id: "summary", key: "summary" },
  { id: "where", key: "where" },
  { id: "retention", key: "retention" },
  { id: "subprocessors", key: "subprocessors" },
  { id: "access", key: "access" },
  { id: "transit", key: "transit" },
  { id: "not-yet", key: "notYet" },
  { id: "report", key: "report" },
] as const;

const subprocessors = [
  { key: "hetzner", name: "Hetzner", us: false },
  { key: "convex", name: "Convex", us: false },
  { key: "r2", name: "Cloudflare R2", us: false },
  { key: "vertex", name: "Google Cloud Vertex AI", us: false },
  { key: "typesafe", name: "TypeSafe (Jev)", us: true },
  { key: "resend", name: "Resend", us: true },
  { key: "email", name: "Cloudflare Email Routing and Workers", us: false },
] as const;

// TypeSafe's own terms, linked from the "may keep logs" clause. Drop that
// clause (and this link) if TypeSafe grants zero retention before launch.
const TYPESAFE_TERMS = "https://typesafe.ai/legal/mca";

const inlineLink = "font-medium text-foreground underline underline-offset-3";

function Points({ items }: { items: ReactNode[] }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5">
          <VinkMark className="mt-1.5 h-2.5 w-auto shrink-0 text-navy" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function SecurityPage({ params }: PageProps<"/[locale]/security">) {
  const locale = localeOf((await params).locale);
  const t = await getTranslations({ locale, namespace: "security" });
  const b = (chunks: ReactNode) => <b>{chunks}</b>;

  return (
    <main>
      <section className="pt-14 pb-10 sm:pt-20">
        <Container>
          <SectionHeading
            as="h1"
            eyebrow={t("header.eyebrow")}
            title={t("header.title")}
            subtitle={t("header.subtitle")}
          />
        </Container>
      </section>
      <section className="mb-14 border-y bg-panel py-5">
        <Container>
          <TrustRow className="justify-start" />
        </Container>
      </section>

      <TocLayout label={t("toc.label")} items={sections.map((s) => ({ id: s.id, label: t(`toc.${s.key}`) }))}>
        <DocSection id="summary" title={t("summary.title")}>
          <div className="rounded-xl border bg-card p-5 text-foreground">
            <Points items={(["eu", "deleted", "approval", "subprocessors"] as const).map((key) => t(`summary.${key}`))} />
          </div>
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
              <caption className="sr-only">{t("subprocessors.caption")}</caption>
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
                    <td className="px-4 py-3 align-top whitespace-nowrap">
                      <span className={row.us ? "font-medium text-foreground" : undefined}>
                        {t(`subprocessors.rows.${row.key}.region`)}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top">
                      {t.rich(`subprocessors.rows.${row.key}.data`, {
                        link: (chunks) => (
                          <a href={TYPESAFE_TERMS} className={inlineLink} rel="noopener noreferrer">
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
              t.rich(`transit.${key}`, {
                link: (chunks) => (
                  <Link href="/developers#verify-signature" className={inlineLink}>
                    {chunks}
                  </Link>
                ),
              }),
            )}
          />
        </DocSection>

        <DocSection id="not-yet" title={t("notYet.title")}>
          <div className="rounded-xl border border-dashed p-5">
            <ul className="flex flex-col gap-2 text-foreground">
              {(["certs", "twoFactor", "dpa"] as const).map((key) => (
                <li key={key}>{t(`notYet.${key}`)}</li>
              ))}
            </ul>
          </div>
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
          <p>
            {t.rich("report.other", {
              link: (chunks) => (
                <Link href="/contact" className={inlineLink}>
                  {chunks}
                </Link>
              ),
            })}
          </p>
        </DocSection>
      </TocLayout>
      <div className="h-16 sm:h-24" />
    </main>
  );
}
