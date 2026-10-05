import { existsSync } from "node:fs";
import { join } from "node:path";
import { ArrowRight, Mail, Play, Upload } from "lucide-react";
import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClosingCard, Faq, TeamBlock, StartFree, TrustRow } from "@/components/marketing/blocks";
import { VinkMark } from "@/components/marketing/brand";
import { CodeBlock, PostBar } from "@/components/marketing/code-block";
import { JsonLd } from "@/components/marketing/json-ld";
import { seedDocuments } from "@/components/demo/demo-data";
import type { DemoDocumentId } from "@/components/demo/demo-papers";
import { ReviewStill } from "@/components/demo/demo-stills";
import {
  CheckStill,
  DocumentFieldsStill,
  PapersRow,
  ReviewFrameTitle,
  VideoBackdrop,
} from "@/components/demo/home-stills";
import { ScreenshotFrame } from "@/components/marketing/screenshot-frame";
import { ScaledStill } from "@/components/features/scaled-still";
import { Container, Eyebrow, SectionHeading } from "@/components/marketing/section";
import { Link } from "@/i18n/navigation";
import { isLocale, routing, type Locale } from "@/i18n/routing";
import { custom, formatEuro, formatNumber, perPage, plans } from "@/lib/plans";
import { sampleEnvelopeJson } from "@/lib/sample-payload";
import { localeUrl, pageMetadata } from "@/lib/seo";
import { absoluteUrl, CONTACT_EMAIL } from "@/lib/site";
import { cn } from "@/lib/utils";

function localeOf(value: string): Locale {
  return isLocale(value) ? value : routing.defaultLocale;
}

export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata({ locale: localeOf(locale), path: "/", ns: "home", absoluteTitle: true });
}

const moreLink =
  "inline-flex items-center gap-1.5 font-semibold text-foreground underline-offset-4 hover:underline [&_svg]:size-4";

export default async function Home({ params }: PageProps<"/[locale]">) {
  const locale = localeOf((await params).locale);
  const t = await getTranslations({ locale, namespace: "home" });
  return (
    <main>
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "Organization",
            name: "Vink",
            url: absoluteUrl("/"),
            logo: absoluteUrl("/vink_icon.svg"),
            email: CONTACT_EMAIL,
          },
          {
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: "Vink",
            url: localeUrl(locale, "/"),
            inLanguage: locale,
            description: t("meta.description"),
          },
        ]}
      />
      <Hero />
      <section className="border-y bg-panel py-5">
        <Container>
          <TrustRow />
        </Container>
      </section>
      <Video />
      <Journey />
      <Connect />
      <PricingRow locale={locale} />
      <FounderAndFaq />
      <ClosingCard location="home" />
    </main>
  );
}

function Hero() {
  const t = useTranslations("home.hero");
  const tc = useTranslations("common.cta");
  return (
    <section className="overflow-hidden pt-12 pb-14 sm:pt-20 sm:pb-20">
      <Container className="grid grid-cols-[minmax(0,1fr)] items-center gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-14">
        <div>
          <h1 className="text-[3.25rem] leading-[0.98] font-semibold tracking-[-0.035em] sm:text-7xl lg:text-[5.25rem]">
            <span className="block">{t("document")}</span>
            <span className="flex items-baseline gap-[0.14em]">
              {t("vink")}
              <VinkMark className="h-[0.6em] w-auto text-navy" />
            </span>
            <span className="block">{t("done")}</span>
          </h1>
          <p className="mt-6 max-w-[44ch] text-lg text-pretty text-muted-foreground">{t("subtitle")}</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <StartFree location="home-hero" size="xl" note={false} />
            <a href="#video" className={buttonVariants({ variant: "outline", size: "lg", className: "h-11 !border-border px-4 text-base" })}>
              <Play className="fill-current" />
              {t("watch")}
            </a>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">{tc("freeNote")}</p>
        </div>
        <ScreenshotFrame title={<ReviewFrameTitle documentId="invoice" />}>
          <ScaledStill width={840} label={t("screenLabel")} className="aspect-[4/5] sm:aspect-[16/15]">
            <ReviewStill documentId="invoice" />
          </ScaledStill>
        </ScreenshotFrame>
      </Container>
    </section>
  );
}

/**
 * The 15-second video. TODO(video): record it and add
 * public/video/vink-15s.mp4 (plus public/video/vink-15s.jpg as the poster);
 * until then a labelled placeholder shows.
 */
function Video() {
  const t = useTranslations("home.video");
  const hasVideo = existsSync(join(process.cwd(), "public/video/vink-15s.mp4"));
  const hasPoster = existsSync(join(process.cwd(), "public/video/vink-15s.jpg"));
  return (
    <section id="video" className="scroll-mt-20 py-16 sm:py-24">
      <Container>
        <SectionHeading title={t("title")} subtitle={t("subtitle")} center className="mb-10" />
        <ScreenshotFrame title="Vink · 0:15" className="mx-auto max-w-4xl">
          {hasVideo ? (
            <video
              className="aspect-video w-full bg-white"
              src="/video/vink-15s.mp4"
              poster={hasPoster ? "/video/vink-15s.jpg" : undefined}
              controls
              muted
              playsInline
              preload="metadata"
              aria-label={t("label")}
            />
          ) : (
            <div
              data-todo="video public/video/vink-15s.mp4"
              role="img"
              aria-label={t("label")}
              className="relative grid aspect-video place-items-center overflow-hidden bg-[#f5f7fa]"
            >
              <div className="absolute inset-0 opacity-40 blur-[1px]" aria-hidden>
                <VideoBackdrop label={t("label")} className="size-full" />
              </div>
              <div className="relative flex flex-col items-center gap-3">
                <span className="grid size-16 place-items-center rounded-full bg-[#0f1e36] text-white shadow-lg">
                  <Play className="size-6 translate-x-0.5 fill-current" />
                </span>
                <span className="rounded-full border border-dashed border-[#c5ccd6] bg-white px-3 py-1 font-mono text-[11px] tracking-wide text-[#5b6577] uppercase">
                  0:15 · {t("placeholder")}
                </span>
              </div>
            </div>
          )}
        </ScreenshotFrame>
      </Container>
    </section>
  );
}

function Stop({
  pin,
  kicker,
  title,
  body,
  extra,
  visual,
}: {
  pin: ReactNode;
  kicker: string;
  title: string;
  body: string;
  extra?: ReactNode;
  visual: ReactNode;
}) {
  return (
    <li className="relative grid grid-cols-[minmax(0,1fr)] gap-8 pl-14 sm:pl-16 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.25fr)] lg:gap-12">
      <span className="absolute top-0 left-0 grid size-10 place-items-center rounded-full border-[1.5px] border-foreground/80 bg-background font-mono text-sm font-medium">
        {pin}
      </span>
      <div className="min-w-0">
        <Eyebrow>{kicker}</Eyebrow>
        <h3 className="mt-2 text-2xl font-semibold tracking-tight sm:text-[1.75rem]">{title}</h3>
        <p className="mt-3 max-w-[46ch] text-muted-foreground">{body}</p>
        {extra}
      </div>
      <div className="min-w-0">{visual}</div>
    </li>
  );
}

/** Stop 2's example tabs, each one of the demo's Documents. */
const exampleTabs = [
  { tab: "invoice", documentId: "invoice" },
  { tab: "deliveryNote", documentId: "delivery" },
  { tab: "handwritten", documentId: "service" },
  { tab: "orderForm", documentId: "order" },
] as const satisfies ReadonlyArray<{ tab: string; documentId: DemoDocumentId }>;

const filename = (id: DemoDocumentId) => seedDocuments.find((d) => d.id === id)!.filename;

function Journey() {
  const t = useTranslations("home");
  return (
    <section className="pb-16 sm:pb-24">
      <Container>
        <SectionHeading title={t("journey.title")} subtitle={t("journey.subtitle")} className="mb-14" />
        <ol className="relative flex flex-col gap-20 before:absolute before:top-2 before:bottom-2 before:left-[19px] before:border-l before:border-dashed before:border-foreground/25">
          <Stop
            pin="1"
            kicker={t("journey.arrives.kicker")}
            title={t("journey.arrives.title")}
            body={t("journey.arrives.body")}
            extra={
              <p className="mt-4 flex max-w-[46ch] gap-3 text-[15px]">
                <span className="mt-0.5 flex shrink-0 gap-1 text-muted-foreground" aria-hidden>
                  <Upload className="size-4" />
                  <Mail className="size-4" />
                </span>
                {t("journey.arrives.intake")}
              </p>
            }
            visual={
              <div className="light-island rounded-2xl bg-panel p-4 sm:p-6">
                <PapersRow documentIds={["invoice", "delivery", "service"]} label={t("journey.arrives.title")} />
              </div>
            }
          />
          <Stop
            pin="2"
            kicker={t("journey.reads.kicker")}
            title={t("journey.reads.title")}
            body={t("journey.reads.body")}
            extra={
              <Link href="/features#demo" className={cn(moreLink, "mt-4")}>
                {t("journey.reads.demo")}
                <ArrowRight />
              </Link>
            }
            visual={
              <Tabs defaultValue="invoice" className="gap-4">
                <TabsList aria-label={t("tabs.label")} className="!h-auto max-w-full flex-wrap justify-start">
                  {exampleTabs.map(({ tab }) => (
                    <TabsTrigger key={tab} value={tab} className="px-3">
                      {t(`tabs.${tab}`)}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {exampleTabs.map(({ tab, documentId }) => (
                  <TabsContent key={tab} value={tab} keepMounted className="data-hidden:hidden">
                    <div className="light-island rounded-2xl bg-panel p-4 sm:p-5">
                      <DocumentFieldsStill documentId={documentId} label={t(`tabs.${tab}`)} />
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            }
          />
          <Stop
            pin={<VinkMark className="h-4 w-auto text-navy" />}
            kicker={t("journey.check.kicker")}
            title={t("journey.check.title")}
            body={t("journey.check.body")}
            visual={
              <ScreenshotFrame title={<ReviewFrameTitle documentId="delivery" />}>
                <CheckStill label={t("journey.check.title")} />
              </ScreenshotFrame>
            }
          />
          <Stop
            pin="4"
            kicker={t("journey.lands.kicker")}
            title={t("journey.lands.title")}
            body={t("journey.lands.body")}
            visual={<DeliveriesMock files={(["invoice", "delivery", "order"] as const).map(filename)} />}
          />
        </ol>
      </Container>
    </section>
  );
}

/** Mirrors the app's Delivery rows (components/deliveries/delivery-log.tsx). */
function DeliveriesMock({ files }: { files: string[] }) {
  const rows = [
    { file: files[0], note: "Approved by Anouk · 08:14", state: "Delivered" },
    { file: files[1], note: "Auto-Send · 08:02", state: "Delivered" },
    { file: files[2], note: "The receiver answered 503. Next try 08:53.", state: "Retrying" },
  ];
  return (
    <ScreenshotFrame title="Integration · Orders API">
      <div className="p-3 sm:p-4">
        <section className="overflow-hidden rounded-lg border bg-card">
          <p className="border-b px-4 py-3 text-sm font-medium">Deliveries</p>
          {rows.map((row) => (
            <div key={row.file} className="border-b px-4 py-2.5 last:border-b-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="min-w-0 truncate font-medium">{row.file}</span>
                <Badge
                  variant="outline"
                  className={
                    row.state === "Delivered"
                      ? "border-emerald-300 text-emerald-700"
                      : "border-amber-300 text-amber-700"
                  }
                >
                  {row.state}
                </Badge>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{row.note}</p>
            </div>
          ))}
        </section>
      </div>
    </ScreenshotFrame>
  );
}

function Connect() {
  const t = useTranslations("home.connect");
  return (
    <section className="border-y bg-panel/60 py-16 sm:py-24">
      <Container>
        <SectionHeading title={t("title")} subtitle={t("subtitle")} className="mb-10" />
        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-4 rounded-2xl border bg-card p-6 sm:p-8">
            <Eyebrow>{t("dev.eyebrow")}</Eyebrow>
            <h3 className="text-2xl font-semibold tracking-tight">{t("dev.title")}</h3>
            <p className="text-muted-foreground">{t("dev.body")}</p>
            <CodeBlock
              code={sampleEnvelopeJson}
              language="json"
              header={<PostBar url="https://your-system.example/vink" />}
              maxHeight="300px"
            />
            <Link href="/developers" className={moreLink}>
              {t("dev.link")}
              <ArrowRight />
            </Link>
          </div>
          <div className="flex flex-col gap-4 rounded-2xl bg-[#0f1e36] p-6 text-white sm:p-8 dark:bg-[#13223c]">
            <p className="font-mono text-xs font-medium tracking-[0.08em] text-white/70 uppercase">{t("service.eyebrow")}</p>
            <h3 className="text-2xl font-semibold tracking-tight">{t("service.title")}</h3>
            <p className="text-white/80">{t("service.body")}</p>
            <ul className="flex flex-col gap-2 text-[15px] text-white/90">
              {(["point1", "point2", "point3"] as const).map((key) => (
                <li key={key} className="flex gap-2.5">
                  <VinkMark className="mt-1 h-3 w-auto shrink-0 text-white" />
                  {t(`service.${key}`)}
                </li>
              ))}
            </ul>
            <Link
              href="/developers#integration-service"
              className={buttonVariants({
                size: "lg",
                className: "mt-auto h-10 self-start bg-white px-4 !text-[#0f1e36] hover:bg-white/90",
              })}
            >
              {t("service.cta")}
            </Link>
          </div>
        </div>
      </Container>
    </section>
  );
}

function PricingRow({ locale }: { locale: Locale }) {
  const t = useTranslations("home.pricing");
  return (
    <section className="pb-16 sm:pb-24">
      <Container>
        <SectionHeading title={t("title")} subtitle={t("subtitle")} className="mb-10" />
        <div className="grid overflow-hidden rounded-2xl border sm:grid-cols-2 lg:grid-cols-4">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={cn(
                "flex flex-col gap-1.5 border-b p-6 sm:border-r lg:border-b-0",
                plan.highlighted && "bg-panel",
              )}
            >
              <h3 className="flex items-center gap-2 text-[15px] font-semibold">
                {plan.name}
                {plan.highlighted && <Badge variant="secondary">{t("popular")}</Badge>}
              </h3>
              <p className="text-3xl font-semibold tracking-tight tabular-nums">
                {formatEuro(plan.monthly, locale)}
                <small className="text-sm font-medium text-muted-foreground">{t("perMonth")}</small>
              </p>
              <p className="font-mono text-sm">{t("pages", { count: formatNumber(plan.pages, locale) })}</p>
              <p className="text-[13px] text-muted-foreground">
                {t("perPage", { price: formatEuro(perPage(plan, "monthly"), locale, 3) })}
              </p>
            </div>
          ))}
          <div className="flex flex-col gap-1.5 p-6">
            <h3 className="text-[15px] font-semibold">{custom.name}</h3>
            <p className="text-3xl font-semibold tracking-tight tabular-nums">
              <small className="mr-1 text-sm font-medium text-muted-foreground">{t("from")}</small>
              {formatEuro(custom.fromMonthly, locale)}
              <small className="text-sm font-medium text-muted-foreground">{t("perMonth")}</small>
            </p>
            <p className="font-mono text-sm">{t("customPages", { count: formatNumber(custom.fromPages, locale) })}</p>
            <p className="text-[13px] text-muted-foreground">{t("customNote")}</p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>{t("free")}</span>
          <Link href="/pricing" className={moreLink}>
            {t("link")}
            <ArrowRight />
          </Link>
        </div>
      </Container>
    </section>
  );
}

function FounderAndFaq() {
  const t = useTranslations("home.faq");
  const keys = ["wrong", "messy", "developer", "templates"] as const;
  return (
    <section className="pb-8">
      <Container className="grid grid-cols-[minmax(0,1fr)] gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
        <TeamBlock className="lg:pt-2" />
        <div>
          <h2 className="mb-6 text-3xl font-semibold tracking-tight">{t("title")}</h2>
          <Faq
            items={keys.map((key) => ({
              id: key,
              question: t(`${key}.q`),
              answer: t(`${key}.a`),
            }))}
          />
        </div>
      </Container>
    </section>
  );
}
