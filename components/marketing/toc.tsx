import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Container } from "./section";

/** An anchor-section page: a sticky "On this page" list next to the content on wide screens. */
export function TocLayout({
  label,
  items,
  children,
}: {
  label: string;
  items: Array<{ id: string; label: string }>;
  children: ReactNode;
}) {
  return (
    <Container className="grid gap-10 pb-8 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-14">
      <nav aria-label={label} className="lg:sticky lg:top-24 lg:self-start">
        <p className="font-mono text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">{label}</p>
        <ol className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-sm lg:flex-col lg:border-l">
          {items.map((item) => (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className="text-muted-foreground transition-colors hover:text-foreground lg:-ml-px lg:block lg:border-l lg:border-transparent lg:py-0.5 lg:pl-3 lg:hover:border-foreground"
              >
                {item.label}
              </a>
            </li>
          ))}
        </ol>
      </nav>
      <div className="flex min-w-0 flex-col gap-16 sm:gap-20">{children}</div>
    </Container>
  );
}

export function DocSection({
  id,
  title,
  children,
  className,
}: {
  id: string;
  title: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cn("scroll-mt-24", className)}>
      <h2 id={`${id}-title`} className="text-2xl font-semibold tracking-tight sm:text-3xl">
        <a href={`#${id}`} className="hover:underline hover:underline-offset-4">
          {title}
        </a>
      </h2>
      <div className="mt-5 flex max-w-3xl flex-col gap-4 text-[15.5px] leading-relaxed text-muted-foreground [&_b]:font-semibold [&_b]:text-foreground [&_strong]:text-foreground">
        {children}
      </div>
    </section>
  );
}
