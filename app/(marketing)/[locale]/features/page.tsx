import { ArrowDown, Check } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Demo } from "@/components/demo/demo";
import { DocumentsStill, ReviewStill } from "@/components/demo/demo-stills";
import { BrowserFrame } from "@/components/features/browser-frame";
import { FeaturePicker, type Feature } from "@/components/features/feature-picker";
import { FeatureVideo } from "@/components/features/feature-video";
import { PapersStill } from "@/components/features/papers-still";
import { ScaledStill } from "@/components/features/scaled-still";
import { Screenshot } from "@/components/features/screenshot";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

// TODO: switch to pageMetadata from lib/seo.ts (canonical, hreflang, OG image).
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("features.meta");
  return { title: t("title"), description: t("description") };
}

// Sign-up lives in the app, outside the marketing layout: a full page load.
const SIGN_UP = "/app/sign-up";

type Stop = "arrives" | "reads" | "check" | "lands" | "around";

export default async function FeaturesPage() {
  const t = await getTranslations("features");
  const list = (key: string) => t.raw(key) as string[];

  const feature = (
    id: string,
    key: string,
    visual: ReactNode,
    links?: Feature["links"],
  ): Feature => ({
    id,
    title: t(`${key}.title`),
    text: t(`${key}.text`),
    bullets: list(`${key}.bullets`),
    links,
    visual,
  });

  // Rendered app parts, framed like a screenshot. They are the demo's own
  // components, so they change with the app.
  const still = (framePath: string, label: string, children: ReactNode, aspect = "aspect-[4/5] sm:aspect-[16/11]") => (
    <BrowserFrame path={framePath}>
      <ScaledStill width={1080} label={label} className={aspect}>
        {children}
      </ScaledStill>
    </BrowserFrame>
  );

  const chapter = (stop: Stop, marker: ReactNode, body: ReactNode) => (
    <section aria-labelledby={`stop-${stop}`} className="border-t py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <p className="flex items-center gap-3 font-mono text-xs font-medium tracking-wider text-muted-foreground uppercase">
          <span className="flex size-8 items-center justify-center rounded-full border bg-background text-sm text-foreground">
            {marker}
          </span>
          {t(`stops.${stop}.label`)}
        </p>
        <h2
          id={`stop-${stop}`}
          className="mt-5 max-w-3xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
        >
          {t(`stops.${stop}.title`)}
        </h2>
        <p className="mt-4 max-w-2xl text-lg text-muted-foreground">{t(`stops.${stop}.lede`)}</p>
        {body}
      </div>
    </section>
  );

  return (
    <main className="flex-1">
      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 pt-16 pb-12 sm:px-6 sm:pt-24">
        <p className="font-mono text-xs font-medium tracking-wider text-muted-foreground uppercase">
          {t("hero.eyebrow")}
        </p>
        <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
          {t("hero.title")}
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted-foreground sm:text-xl">{t("hero.lede")}</p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button size="lg" nativeButton={false} render={<a href={SIGN_UP} />}>
            {t("hero.startFree")}
          </Button>
          <Button size="lg" variant="outline" nativeButton={false} render={<a href="#demo" />}>
            {t("hero.tryDemo")}
            <ArrowDown />
          </Button>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">{t("hero.note")}</p>
      </section>

      {/* The 15-second video, as on Home */}
      <section className="mx-auto max-w-5xl px-4 pb-20 sm:px-6 sm:pb-28">
        <FeatureVideo label={t("video.label")} caption={t("video.caption")} />
      </section>

      {chapter(
        "arrives",
        "1",
        <FeaturePicker
          features={[
            feature(
              "intake",
              "intake",
              <Screenshot
                name="upload-and-email-in"
                alt={t("intake.alt")}
                framePath={t("frames.upload")}
                placeholder={t("intake.placeholder")}
              />,
              [{ label: t("intake.otherSources"), href: "/contact" }],
            ),
            feature("any-pdf", "anyPdf", <PapersStill label={t("anyPdf.alt")} />),
          ]}
        />,
      )}

      {chapter(
        "reads",
        "2",
        <FeaturePicker
          features={[
            feature(
              "fields",
              "fields",
              <Screenshot
                name="form-editor"
                alt={t("fields.alt")}
                framePath={t("frames.form")}
                placeholder={t("fields.placeholder")}
              />,
            ),
            feature(
              "source",
              "source",
              still(
                t("frames.invoice"),
                t("source.alt"),
                <ReviewStill documentId="invoice" selected="invoice.invoice_date" />,
              ),
            ),
          ]}
        />,
      )}

      {chapter(
        "check",
        <span className="flex size-full items-center justify-center rounded-full bg-white">
          <Image src="/vink_icon.svg" alt="" width={518} height={363} className="h-3 w-auto" />
        </span>,
        <FeaturePicker
          features={[
            feature(
              "review",
              "review",
              still(
                t("frames.delivery"),
                t("review.alt"),
                <ReviewStill documentId="delivery" filter="needs_review" />,
              ),
            ),
            feature(
              "approve",
              "approve",
              still(
                t("frames.documents"),
                t("approve.alt"),
                <DocumentsStill tab="approved" />,
                "aspect-[4/5] sm:aspect-[16/9]",
              ),
            ),
          ]}
        />,
      )}

      {/* The demo, right after "You check"; Home's "Try the demo" links here. */}
      <section
        id="demo"
        aria-labelledby="demo-title"
        className="scroll-mt-16 border-t bg-muted/60 py-20 sm:py-28"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
            <div className="max-w-2xl">
              <p className="font-mono text-xs font-medium tracking-wider text-muted-foreground uppercase">
                {t("demo.eyebrow")}
              </p>
              <h2
                id="demo-title"
                className="mt-4 text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
              >
                {t("demo.title")}
              </h2>
              <p className="mt-4 text-lg text-muted-foreground">{t("demo.text")}</p>
            </div>
            <p className="text-sm text-muted-foreground">{t("demo.hint")}</p>
          </div>
          <div className="mt-10">
            <Demo />
          </div>
        </div>
      </section>

      {chapter(
        "lands",
        "4",
        <FeaturePicker
          features={[
            feature(
              "deliver",
              "deliver",
              <Screenshot
                name="integration-deliveries"
                alt={t("deliver.alt")}
                framePath={t("frames.integration")}
                placeholder={t("deliver.placeholder")}
              />,
              [
                { label: t("deliver.docs"), href: "/developers" },
                { label: t("deliver.connection"), href: "/contact" },
              ],
            ),
          ]}
        />,
      )}

      {/* Around it: a bento of three cards */}
      {chapter(
        "around",
        "+",
        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          <BentoCard
            title={t("team.title")}
            text={t("team.text")}
            bullets={list("team.bullets")}
            visual={
              <Screenshot
                name="members"
                alt={t("team.alt")}
                framePath={t("frames.members")}
                placeholder={t("team.placeholder")}
              />
            }
          />
          <BentoCard
            title={t("data.title")}
            text={t("data.text")}
            bullets={list("data.bullets")}
            link={{ label: t("data.link"), href: "/security" }}
            visual={
              <Screenshot
                name="retention"
                alt={t("data.alt")}
                framePath={t("frames.settings")}
                placeholder={t("data.placeholder")}
              />
            }
          />
          <BentoCard
            title={t("plans.title")}
            text={t("plans.text")}
            link={{ label: t("plans.link"), href: "/pricing" }}
            visual={
              <ul className="grid grid-cols-1 gap-2.5 rounded-xl border bg-background p-5 text-sm sm:grid-cols-2 lg:grid-cols-1">
                {list("plans.includes").map((item) => (
                  <li key={item} className="flex items-center gap-2.5">
                    <Check className="size-4 shrink-0 text-emerald-600 dark:text-emerald-500" />
                    {item}
                  </li>
                ))}
              </ul>
            }
          />
        </div>,
      )}

      {/* Closing card */}
      <section className="px-4 pb-20 sm:px-6 sm:pb-28">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 rounded-2xl bg-[#0F1E36] px-6 py-12 text-white sm:px-12 md:flex-row md:items-center">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              {t("close.title")}
            </h2>
            <p className="mt-3 text-white/70">
              {t("close.text")} {t("close.customer")}{" "}
              {/* The app has its own root layout: a full page load. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a href="/app" className="text-white underline underline-offset-4">
                {t("close.login")}
              </a>
            </p>
          </div>
          <Button
            size="lg"
            nativeButton={false}
            render={<a href={SIGN_UP} />}
            className="bg-white text-[#0F1E36] hover:bg-white/90"
          >
            {t("close.startFree")}
          </Button>
        </div>
      </section>
    </main>
  );
}

function BentoCard({
  title,
  text,
  bullets,
  link,
  visual,
}: {
  title: string;
  text: string;
  bullets?: string[];
  link?: { label: string; href: string };
  visual: ReactNode;
}) {
  return (
    <article className="flex flex-col gap-6 rounded-2xl border bg-card p-6 sm:p-8">
      <div>
        <h3 className="text-xl font-semibold tracking-tight">{title}</h3>
        <p className="mt-3 text-muted-foreground">{text}</p>
        {bullets && (
          <ul className="mt-4 flex flex-col gap-2 text-sm">
            {bullets.map((bullet) => (
              <li key={bullet} className="flex gap-2.5">
                <Check className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-500" />
                {bullet}
              </li>
            ))}
          </ul>
        )}
        {link && (
          <Link
            href={link.href}
            className="mt-4 inline-block text-sm font-medium underline-offset-4 hover:underline"
          >
            {link.label} →
          </Link>
        )}
      </div>
      <div className="mt-auto">{visual}</div>
    </article>
  );
}
