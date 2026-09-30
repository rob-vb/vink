import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { Container } from "./section";

const inlineLink = "font-medium text-foreground underline underline-offset-3";

/**
 * A reserved legal page with placeholder content. TODO(legal): the real
 * privacy policy and terms come from the GDPR pre-launch track; until then
 * the pages are noindex and say plainly that the text is pending.
 */
export async function LegalPage({
  locale,
  doc,
  points,
  links,
}: {
  locale: Locale;
  doc: "privacy" | "terms";
  points: string[];
  links: Record<string, string>;
}) {
  const t = await getTranslations({ locale, namespace: "legal" });
  const tag = (href: string) =>
    function LinkTag(chunks: ReactNode) {
      return (
        <Link href={href} className={inlineLink}>
          {chunks}
        </Link>
      );
    };
  // Keys and tags are chosen per page, so they're looked up untyped.
  const rich = t.rich as unknown as (key: string, values: Record<string, unknown>) => ReactNode;
  const tags = Object.fromEntries(Object.entries(links).map(([name, href]) => [name, tag(href)]));
  return (
    <main className="pt-14 pb-20 sm:pt-20 sm:pb-28">
      <Container className="max-w-3xl">
        <p className="inline-block rounded-full border border-dashed px-3 py-1 font-mono text-xs tracking-wide text-muted-foreground uppercase">
          {t("updated")}
        </p>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">{t(`${doc}.title`)}</h1>
        <p className="mt-5 rounded-xl border-l-2 border-amber-500 bg-amber-50 px-4 py-3 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          {t(`${doc}.pending`)}
        </p>
        <ul className="mt-8 flex list-disc flex-col gap-3 pl-5 text-[15.5px] leading-relaxed text-muted-foreground">
          {points.map((key) => (
            <li key={key}>{rich(`${doc}.points.${key}`, tags)}</li>
          ))}
        </ul>
      </Container>
    </main>
  );
}
