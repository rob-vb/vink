import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Container({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8", className)} {...props} />;
}

export function Eyebrow({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      className={cn("font-mono text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase", className)}
      {...props}
    />
  );
}

export function SectionHeading({
  title,
  subtitle,
  eyebrow,
  id,
  as: Heading = "h2",
  center = false,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  id?: string;
  as?: "h1" | "h2";
  center?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("max-w-2xl", center && "mx-auto text-center", className)}>
      {eyebrow && <Eyebrow className="mb-3">{eyebrow}</Eyebrow>}
      <Heading
        id={id}
        className={cn(
          "font-semibold tracking-tight text-balance",
          Heading === "h1" ? "text-4xl sm:text-5xl" : "text-3xl sm:text-4xl",
        )}
      >
        {title}
      </Heading>
      {subtitle && <p className="mt-3 text-lg text-pretty text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

/** Inline `code` inside translated prose (`<code>…</code>` in the messages). */
export function InlineCode({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em] text-foreground">{children}</code>
  );
}
