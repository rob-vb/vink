import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { KVK_NUMBER, LEGAL_ADDRESS, LEGAL_OWNER, PRIVACY_EMAIL } from "@/lib/site";
import { Container } from "./section";
import { DocSection } from "./toc";

export const inlineLink = "font-medium text-foreground underline underline-offset-3";

/**
 * One block of a legal section in messages/<locale>/legal.json: a string is a
 * paragraph, a list of strings is a bullet list, `{ h }` is a subheading.
 */
type Block = string | string[] | { h: string };

export function Points({ items }: { items: ReactNode[] }) {
  return (
    <ul className="flex list-disc flex-col gap-2.5 pl-5 marker:text-muted-foreground/60">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

/** Title, last-updated date and intro of the Privacy or Terms page. */
export async function LegalHeader({ locale, doc }: { locale: Locale; doc: "privacy" | "terms" }) {
  const t = await getTranslations({ locale, namespace: `legal.${doc}` });
  return (
    <section className="pt-14 pb-12 sm:pt-20 sm:pb-16">
      <Container>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{t("title")}</h1>
        <p className="mt-4 font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase">{t("updated")}</p>
        <p className="mt-4 max-w-[60ch] text-muted-foreground">{t("intro")}</p>
      </Container>
    </section>
  );
}

/**
 * The sections of `legal.<doc>.sections`, in file order, with their TOC
 * entries. `links` maps a rich-text tag to where it points: a path or `#anchor`
 * stays on the site, anything else opens the other party's page.
 */
export async function legalSections(locale: Locale, doc: "privacy" | "terms", links: Record<string, string>) {
  const t = await getTranslations({ locale, namespace: `legal.${doc}` });
  const sections = t.raw("sections") as Record<string, { title: string; body: Block[] }>;
  const tag = (href: string) =>
    function LinkTag(chunks: ReactNode) {
      if (href.startsWith("#")) {
        return (
          <a href={href} className={inlineLink}>
            {chunks}
          </a>
        );
      }
      if (href.startsWith("/")) {
        return (
          <Link href={href} className={inlineLink}>
            {chunks}
          </Link>
        );
      }
      return (
        <a href={href} className={inlineLink} rel="noopener noreferrer">
          {chunks}
        </a>
      );
    };
  const values = {
    ...Object.fromEntries(Object.entries(links).map(([name, href]) => [name, tag(href)])),
    b: (chunks: ReactNode) => <b>{chunks}</b>,
    mail: () => (
      <a href={`mailto:${PRIVACY_EMAIL}`} className={inlineLink}>
        {PRIVACY_EMAIL}
      </a>
    ),
    owner: LEGAL_OWNER,
    address: LEGAL_ADDRESS,
    kvk: KVK_NUMBER,
  };
  // Keys are built from the file's own structure, so they're looked up untyped.
  const rich = t.rich as unknown as (key: string, values: Record<string, unknown>) => ReactNode;

  const ids = Object.keys(sections);
  return {
    items: ids.map((id) => ({ id, label: sections[id].title })),
    nodes: ids.map((id) => (
      <DocSection key={id} id={id} title={sections[id].title}>
        {sections[id].body.map((block, i) => {
          const key = `sections.${id}.body.${i}`;
          if (Array.isArray(block)) return <Points key={i} items={block.map((_, j) => rich(`${key}.${j}`, values))} />;
          if (typeof block === "object") {
            return (
              <h3 key={i} className="mt-2 text-base font-semibold text-foreground">
                {block.h}
              </h3>
            );
          }
          return <p key={i}>{rich(key, values)}</p>;
        })}
      </DocSection>
    )),
  };
}
