import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Fragment, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VinkMark } from "@/components/marketing/brand";
import { CodeBlock, PostBar } from "@/components/marketing/code-block";
import { RequestForm } from "@/components/marketing/request-form";
import { Screenshot } from "@/components/marketing/screenshot-frame";
import { Container, InlineCode, SectionHeading } from "@/components/marketing/section";
import { DocSection, TocLayout } from "@/components/marketing/toc";
import { Link } from "@/i18n/navigation";
import { isLocale, routing, type Locale } from "@/i18n/routing";
import { platforms, type Platform } from "@/lib/platforms";
import { PlatformLogo } from "@/components/marketing/platform-logo";
import { sampleEnvelopeJson } from "@/lib/sample-payload";
import { pageMetadata } from "@/lib/seo";
import { CONTACT_EMAIL } from "@/lib/site";
import { signatureHeaderExample, verifySnippets } from "@/lib/verify-snippets";

function localeOf(value: string): Locale {
  return isLocale(value) ? value : routing.defaultLocale;
}

export async function generateMetadata({ params }: PageProps<"/[locale]/developers">): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata({ locale: localeOf(locale), path: "/developers", ns: "developers" });
}

const sections = [
  { id: "overview", key: "overview" },
  { id: "platforms", key: "platforms" },
  { id: "envelope", key: "envelope" },
  { id: "verify-signature", key: "signature" },
  { id: "delivery", key: "delivery" },
  { id: "test-send", key: "testSend" },
  { id: "integration-service", key: "service" },
] as const;

const rich = {
  code: (chunks: ReactNode) => <InlineCode>{chunks}</InlineCode>,
  b: (chunks: ReactNode) => <b>{chunks}</b>,
};

// The webhook "how it works" block sits above the first platform that uses it.
const firstWebhook = platforms.find((p) => p.via === "webhook");

function PlatformBadges({
  platform,
  t,
}: {
  platform: Platform;
  t: Awaited<ReturnType<typeof getTranslations<"developers">>>;
}) {
  return (
    <span className="flex flex-wrap gap-1.5">
      <Badge variant="secondary">{t(platform.via === "native" ? "platforms.native" : "platforms.via")}</Badge>
      {platform.app === "soon" && <Badge variant="outline">{t("platforms.soonBadge")}</Badge>}
    </span>
  );
}

function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5">
          <VinkMark className="mt-1.5 h-2.5 w-auto shrink-0 text-navy" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function DevelopersPage({ params }: PageProps<"/[locale]/developers">) {
  const locale = localeOf((await params).locale);
  const t = await getTranslations({ locale, namespace: "developers" });
  const tc = await getTranslations({ locale, namespace: "common" });
  const copyLabels = { copy: t("code.copy"), copied: t("code.copied") };

  const envelopeKeys = ["event", "delivery_id", "test", "document", "form", "approval", "data"] as const;

  return (
    <main>
      <section className="pt-14 pb-12 sm:pt-20 sm:pb-16">
        <Container>
          <SectionHeading
            as="h1"
            eyebrow={t("header.eyebrow")}
            title={t("header.title")}
            subtitle={t("header.subtitle")}
            className="max-w-3xl"
          />
        </Container>
      </section>

      <TocLayout
        label={t("toc.label")}
        items={sections.map((s) => ({ id: s.id, label: t(`toc.${s.key}`) }))}
      >
        <DocSection id="overview" title={t("overview.title")}>
          <p>{t("overview.p1")}</p>
          <p>{t("overview.p2")}</p>
          <div className="rounded-xl border bg-card p-5 text-foreground">
            <Bullets
              items={(["method", "signed", "retries", "atLeastOnce"] as const).map((key) =>
                t.rich(`overview.facts.${key}`, rich),
              )}
            />
          </div>
          <p>{t("overview.reading")}</p>
          <p>
            {t.rich("overview.apiReference", {
              ...rich,
              link: (chunks) => (
                <Link href="/developers/api" className="font-medium text-foreground underline underline-offset-3">
                  {chunks}
                </Link>
              ),
            })}
          </p>
          <h3 className="mt-2 text-lg font-semibold text-foreground">{t("overview.inboundTitle")}</h3>
          <p>
            {t.rich("overview.inbound", {
              ...rich,
              link: (chunks) => (
                <Link href="/developers/api" className="font-mono text-[13px] font-medium text-foreground underline underline-offset-3">
                  {chunks}
                </Link>
              ),
            })}
          </p>
        </DocSection>

        <DocSection id="platforms" title={t("platforms.title")}>
          <p>{t("platforms.intro")}</p>
          <ul aria-label={t("platforms.listLabel")} className="grid gap-3 sm:grid-cols-2">
            {platforms.map((platform) => (
              <li key={platform.id}>
                <a
                  href={`#${platform.id}`}
                  className="flex h-full items-start gap-3 rounded-xl border bg-card px-4 py-3 transition-colors hover:border-foreground/30"
                >
                  <PlatformLogo platform={platform} className="mt-0.5 size-9 p-1.5" />
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="font-semibold text-foreground">{platform.name}</span>
                    <span className="text-sm">{t(`platforms.short.${platform.key}`)}</span>
                    <PlatformBadges platform={platform} t={t} />
                  </span>
                </a>
              </li>
            ))}
          </ul>
          <p>
            {t.rich("platforms.other", {
              ...rich,
              link: (chunks) => (
                <a href="#integration-service" className="font-medium text-foreground underline underline-offset-3">
                  {chunks}
                </a>
              ),
            })}
          </p>
          {platforms.map((platform) => {
            const guide = `platforms.guides.${platform.key}`;
            const steps = Object.keys(t.raw(`${guide}.steps`) as Record<string, string>);
            return (
              <Fragment key={platform.id}>
                {platform.id === firstWebhook?.id && (
                  <>
                    <h3 className="mt-6 text-xl font-semibold text-foreground">{t("platforms.howTitle")}</h3>
                    <p>{t("platforms.how")}</p>
                    <p>{t.rich("platforms.testFlag", rich)}</p>
                    <p className="rounded-lg border-l-2 border-amber-500 bg-amber-50 px-4 py-3 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200 [&_b]:text-amber-950 dark:[&_b]:text-amber-100">
                      {t.rich("platforms.secret", rich)}
                    </p>
                  </>
                )}
                <div id={platform.id} className="mt-4 flex scroll-mt-24 flex-col gap-3">
                  <h3 className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xl font-semibold text-foreground">
                    <PlatformLogo platform={platform} className="size-8 p-1.5" />
                    <a href={`#${platform.id}`} className="hover:underline hover:underline-offset-4">
                      {t(`${guide}.title`)}
                    </a>
                    <PlatformBadges platform={platform} t={t} />
                  </h3>
                  {platform.app === "soon" && <p>{t.rich("platforms.soon", { ...rich, name: platform.name })}</p>}
                  <p>{t.rich(`${guide}.plan`, rich)}</p>
                  <ol
                    aria-label={t("platforms.stepsLabel", { name: platform.name })}
                    className="flex list-decimal flex-col gap-2 pl-5 marker:font-mono marker:text-foreground"
                  >
                    {steps.map((step) => (
                      <li key={step} className="pl-1">
                        {t.rich(`${guide}.steps.${step}`, rich)}
                      </li>
                    ))}
                  </ol>
                  <p>{t.rich(`${guide}.lists`, rich)}</p>
                  <p>{t.rich(`${guide}.security`, rich)}</p>
                  <p>{t.rich(`${guide}.note`, rich)}</p>
                </div>
              </Fragment>
            );
          })}
        </DocSection>

        <DocSection id="envelope" title={t("envelope.title")}>
          <p>{t.rich("envelope.intro", rich)}</p>
          <CodeBlock
            code={sampleEnvelopeJson}
            language="json"
            header={<PostBar url="https://your-system.example/vink" />}
            copyLabels={copyLabels}
          />
          <div className="rounded-xl border bg-card p-5">
            <h3 className="font-semibold text-foreground">{t("envelope.rules.title")}</h3>
            <div className="mt-3 text-foreground">
              <Bullets
                items={(["present", "null", "empty"] as const).map((key) => t.rich(`envelope.rules.${key}`, rich))}
              />
            </div>
          </div>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <thead className="bg-muted/60 text-foreground">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-semibold">{t("envelope.table.key")}</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">{t("envelope.table.meaning")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {envelopeKeys.map((key) => (
                  <tr key={key}>
                    <td className="px-4 py-3 align-top font-mono text-[13px] text-foreground">{key}</td>
                    <td className="px-4 py-3">{t.rich(`envelope.table.${key}`, rich)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DocSection>

        <DocSection id="verify-signature" title={t("signature.title")}>
          <p>{t.rich("signature.intro", rich)}</p>
          <CodeBlock code={signatureHeaderExample} language="text" />
          <h3 className="mt-2 text-lg font-semibold text-foreground">{t("signature.steps.title")}</h3>
          <ol className="flex list-decimal flex-col gap-2 pl-5 marker:font-mono marker:text-foreground">
            {(["parse", "sign", "compare", "time"] as const).map((key) => (
              <li key={key} className="pl-1">
                {t.rich(`signature.steps.${key}`, rich)}
              </li>
            ))}
          </ol>
          <p className="rounded-lg border-l-2 border-amber-500 bg-amber-50 px-4 py-3 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            {t("signature.raw")}
          </p>
          <Tabs defaultValue="node" className="gap-3">
            <TabsList aria-label={t("signature.tabs")}>
              {verifySnippets.map((snippet) => (
                <TabsTrigger key={snippet.id} value={snippet.id} className="px-3">
                  {snippet.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {verifySnippets.map((snippet) => (
              <TabsContent key={snippet.id} value={snippet.id} keepMounted className="data-hidden:hidden">
                <CodeBlock
                  code={snippet.code}
                  language={snippet.language}
                  header={snippet.label}
                  copyLabels={copyLabels}
                />
              </TabsContent>
            ))}
          </Tabs>
        </DocSection>

        <DocSection id="delivery" title={t("delivery.title")}>
          <p>{t("delivery.intro")}</p>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <thead className="bg-muted/60 text-foreground">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-semibold">{t("delivery.table.answer")}</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">{t("delivery.table.result")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(["ok", "retry", "fail"] as const).map((key) => (
                  <tr key={key}>
                    <td className="px-4 py-3 align-top font-medium text-foreground">{t(`delivery.table.${key}`)}</td>
                    <td className="px-4 py-3">{t(`delivery.table.${key}Result`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>{t.rich("delivery.retryAfter", rich)}</p>
          <p>{t.rich("delivery.redirects", rich)}</p>
          <p>{t.rich("delivery.atLeastOnce", rich)}</p>
          <h3 className="mt-2 text-lg font-semibold text-foreground">{t("delivery.headersTitle")}</h3>
          <p>{t.rich("delivery.headers", rich)}</p>
          <Screenshot
            name="delivery-retry"
            title={t("delivery.frameTitle")}
            width={831}
            height={341}
            alt={t("delivery.screenshot")}
            pendingLabel={tc("frame.screenshotPending")}
            className="mt-2"
          />
        </DocSection>

        <DocSection id="test-send" title={t("testSend.title")}>
          <p>{t.rich("testSend.body", rich)}</p>
          <p>{t.rich("testSend.flag", rich)}</p>
          <Screenshot
            name="integration-test-send"
            title="Vink · Integrations"
            alt={t("testSend.screenshot")}
            pendingLabel={tc("frame.screenshotPending")}
            className="mt-2"
          />
        </DocSection>

        <DocSection id="integration-service" title={t("service.title")}>
          <p className="text-lg text-foreground">{t("service.lead")}</p>
          <p>{t("service.body")}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border bg-card p-5">
              <h3 className="font-semibold text-foreground">{t("service.includes.title")}</h3>
              <div className="mt-3 text-sm">
                <Bullets
                  items={(["receiver", "forms", "hosting", "changes"] as const).map((key) =>
                    t(`service.includes.${key}`),
                  )}
                />
              </div>
            </div>
            <div className="rounded-xl border bg-card p-5">
              <h3 className="font-semibold text-foreground">{t("service.need.title")}</h3>
              <div className="mt-3 text-sm">
                <Bullets
                  items={(["system", "documents", "contact"] as const).map((key) => t(`service.need.${key}`))}
                />
              </div>
            </div>
          </div>
          <div className="rounded-xl bg-[#0f1e36] px-6 py-5 text-white dark:bg-[#13223c]">
            <p className="text-2xl font-semibold tracking-tight">{t("service.price")}</p>
            <p className="mt-1 text-white/75">{t("service.priceNote")}</p>
          </div>
          <h3 className="mt-4 text-xl font-semibold text-foreground">{t("service.formTitle")}</h3>
          <p>{t("service.formBody")}</p>
          <RequestForm kind="integration" fallbackEmail={CONTACT_EMAIL} />
        </DocSection>
      </TocLayout>
      <div className="h-16 sm:h-24" />
    </main>
  );
}
