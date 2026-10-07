import type { Platform } from "@/lib/platforms";
import { cn } from "@/lib/utils";

/**
 * A platform's brand mark on a white tile, so its own colours read the same in
 * light and dark mode. Decorative: the platform's name always sits next to it.
 */
export function PlatformLogo({ platform, className }: { platform: Platform; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg border bg-white shadow-xs dark:border-white/10",
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- tiny static SVG, nothing to optimise */}
      <img src={platform.logo} alt="" width={24} height={24} className="size-full" />
    </span>
  );
}
