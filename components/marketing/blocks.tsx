import { existsSync } from "node:fs";
import { join } from "node:path";
import { Check, Mail } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { buttonVariants } from "@/components/ui/button";
import { FOUNDER_EMAIL } from "@/lib/site";
import { cn } from "@/lib/utils";
import { LogInLink, StartFreeLink } from "./cta-links";
import { Container } from "./section";

/** "Start free" with "20 free pages. No credit card." underneath. */
export function StartFree({
  location,
  size = "lg",
  note = true,
  className,
}: {
  location: string;
  size?: "lg" | "xl";
  note?: boolean;
  className?: string;
}) {
  const t = useTranslations("common.cta");
  return (
    <div className={className}>
      <StartFreeLink
        location={location}
        className={buttonVariants({
          size: "lg",
          className: size === "xl" ? "h-11 px-5 text-base" : "h-10 px-4",
        })}
      >
        {t("startFree")}
      </StartFreeLink>
      {note && <p className="mt-2.5 text-sm text-muted-foreground">{t("freeNote")}</p>}
    </div>
  );
}

export function TrustRow({ className }: { className?: string }) {
  const t = useTranslations("common.trust");
  return (
    <ul
      className={cn(
        "flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-[15px] font-medium",
        className,
      )}
    >
      {(["eu", "deleted", "approval"] as const).map((key) => (
        <li key={key} className="inline-flex items-center gap-2">
          <Check className="size-4 text-emerald-600 dark:text-emerald-400" strokeWidth={2.5} aria-hidden />
          {t(key)}
        </li>
      ))}
    </ul>
  );
}

/** The navy closing card: "Stop retyping. Start with 20 pages." */
export function ClosingCard({ location, title }: { location: string; title?: string }) {
  const t = useTranslations("common");
  return (
    <section className="py-16 sm:py-24">
      <Container>
        <div className="flex flex-col items-start justify-between gap-8 rounded-3xl bg-[#0f1e36] px-6 py-10 text-white sm:px-12 sm:py-14 md:flex-row md:items-center dark:bg-[#13223c]">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              {title ?? t("closing.title")}
            </h2>
            <p className="mt-3 text-sm text-white/70">
              {t("closing.customer")}{" "}
              <LogInLink location={`${location}-closing`} className="font-medium text-white underline underline-offset-3">
                {t("closing.logIn")}
              </LogInLink>
            </p>
          </div>
          <div className="shrink-0">
            <StartFreeLink
              location={`${location}-closing`}
              className={buttonVariants({
                size: "lg",
                className: "h-11 bg-white px-5 text-base !text-[#0f1e36] hover:bg-white/90",
              })}
            >
              {t("cta.startFree")}
            </StartFreeLink>
            <p className="mt-2.5 text-sm text-white/70">{t("cta.freeNote")}</p>
          </div>
        </div>
      </Container>
    </section>
  );
}

/**
 * Rob, with a photo and his direct email. TODO(founder-photo): add
 * public/founder.jpg (square, at least 256 px); until then his initial shows.
 */
export function FounderBlock({ className }: { className?: string }) {
  const t = useTranslations("common.founder");
  const hasPhoto = existsSync(join(process.cwd(), "public/founder.jpg"));
  return (
    <figure className={cn("flex flex-col gap-5", className)}>
      <p className="font-mono text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">
        {t("eyebrow")}
      </p>
      <blockquote className="text-lg leading-relaxed text-pretty">&ldquo;{t("quote")}&rdquo;</blockquote>
      <figcaption className="flex items-center gap-3">
        {hasPhoto ? (
          <Image
            src="/founder.jpg"
            alt={t("photoAlt")}
            width={56}
            height={56}
            className="size-14 rounded-full object-cover"
          />
        ) : (
          <span
            data-todo="founder photo public/founder.jpg"
            aria-hidden
            className="grid size-14 place-items-center rounded-full border border-dashed bg-muted text-lg font-semibold text-muted-foreground"
          >
            R
          </span>
        )}
        <span>
          <span className="block font-semibold">{t("name")}</span>
          <span className="block text-sm text-muted-foreground">{t("role")}</span>
          <a
            href={`mailto:${FOUNDER_EMAIL}`}
            className="mt-0.5 inline-flex items-center gap-1.5 font-mono text-sm text-foreground underline-offset-3 hover:underline"
          >
            <Mail className="size-3.5" aria-hidden />
            {FOUNDER_EMAIL}
          </a>
        </span>
      </figcaption>
    </figure>
  );
}

/**
 * Questions and answers. Answers stay in the static HTML (hidden until
 * opened), so search engines and assistants read them as text.
 */
export function Faq({
  items,
  className,
  defaultOpen = 0,
}: {
  items: Array<{ id: string; question: string; answer: ReactNode }>;
  className?: string;
  defaultOpen?: number | null;
}) {
  return (
    <Accordion
      className={cn("border-t", className)}
      defaultValue={defaultOpen === null ? [] : [items[defaultOpen]?.id]}
    >
      {items.map((item) => (
        <AccordionItem key={item.id} value={item.id} className="border-b">
          <AccordionTrigger className="py-4 text-base font-semibold hover:no-underline">
            {item.question}
          </AccordionTrigger>
          <AccordionContent keepMounted className="max-w-prose pb-4 text-[15px] text-muted-foreground">
            <p>{item.answer}</p>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
