import { existsSync } from "node:fs";
import { join } from "node:path";
import Image from "next/image";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A thin browser frame on a light grey panel, for product screenshots and
 * faithful product renditions. It stays light in dark mode (`.light-island`),
 * like the app's screenshots always are.
 */
export function ScreenshotFrame({
  title,
  children,
  className,
  bodyClassName,
  panel = true,
}: {
  title: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Sit the frame on the grey panel (off when the page already has one). */
  panel?: boolean;
}) {
  return (
    <div className={cn("light-island", panel && "rounded-2xl bg-panel p-3 sm:p-5", className)}>
      <div className="overflow-hidden rounded-xl border border-[#dfe3e9] bg-background shadow-[0_1px_2px_rgba(15,30,54,0.06),0_12px_32px_-16px_rgba(15,30,54,0.3)]">
        <div className="flex items-center gap-2 border-b border-[#e6e9ee] bg-[#f7f8fa] px-3 py-2">
          <span className="flex gap-1.5" aria-hidden>
            <i className="size-2.5 rounded-full bg-[#d7dbe1]" />
            <i className="size-2.5 rounded-full bg-[#d7dbe1]" />
            <i className="size-2.5 rounded-full bg-[#d7dbe1]" />
          </span>
          <span className="min-w-0 flex-1 truncate text-center font-mono text-[11px] text-[#6b7383]">{title}</span>
          <span className="w-10" aria-hidden />
        </div>
        <div className={bodyClassName}>{children}</div>
      </div>
    </div>
  );
}

/**
 * A real app screenshot from `public/screenshots/<name>.png`. Until Rob adds
 * the file, a labelled placeholder of the same size shows instead.
 * TODO(screenshots): see the list in the marketing build report.
 */
export function Screenshot({
  name,
  alt,
  title,
  width = 1600,
  height = 1000,
  pendingLabel,
  className,
}: {
  name: string;
  alt: string;
  title: string;
  width?: number;
  height?: number;
  pendingLabel: string;
  className?: string;
}) {
  const src = `/screenshots/${name}.png`;
  const present = existsSync(join(process.cwd(), "public", src));
  return (
    <ScreenshotFrame title={title} className={className}>
      {present ? (
        <Image src={src} alt={alt} width={width} height={height} className="h-auto w-full" />
      ) : (
        <div
          role="img"
          aria-label={alt}
          data-todo={`screenshot ${src}`}
          className="grid place-items-center bg-[repeating-linear-gradient(135deg,#f6f7f9_0_12px,#eff1f4_12px_24px)] p-6 text-center"
          style={{ aspectRatio: `${width} / ${height}` }}
        >
          <div className="max-w-sm">
            <span className="inline-block rounded-full border border-dashed border-[#c5ccd6] bg-white px-2.5 py-1 font-mono text-[11px] tracking-wide text-[#6b7383] uppercase">
              {pendingLabel}
            </span>
            <p className="mt-3 text-sm text-[#4a5364]">{alt}</p>
          </div>
        </div>
      )}
    </ScreenshotFrame>
  );
}
