import type { ReactNode } from "react";
import { cn } from "cn";

/**
 * A thin browser frame on a light grey panel, for app screenshots and the
 * app parts rendered as pictures. It stays light in dark mode (`.light`),
 * like a screenshot would.
 *
 * TODO(lead): swap for components/marketing/screenshot-frame.tsx on merge if
 * that one ends up doing the same.
 */
export function BrowserFrame({
  path,
  children,
  className,
}: {
  /** Shown in the address bar. */
  path: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("light rounded-2xl bg-[#EDF0F4] p-3 text-foreground sm:p-5", className)}>
      <div className="overflow-hidden rounded-lg border border-[#0F1E36]/10 bg-background shadow-[0_1px_2px_rgba(15,30,54,.06),0_16px_32px_-16px_rgba(15,30,54,.3)]">
        <div className="flex h-8 items-center gap-3 border-b bg-[#F7F8FA] px-3">
          <span className="flex gap-1.5" aria-hidden>
            <i className="size-2.5 rounded-full bg-[#D5DAE1]" />
            <i className="size-2.5 rounded-full bg-[#D5DAE1]" />
            <i className="size-2.5 rounded-full bg-[#D5DAE1]" />
          </span>
          <span className="min-w-0 flex-1 truncate rounded-md bg-background px-2 py-0.5 text-center font-mono text-[11px] text-muted-foreground">
            {path}
          </span>
          <span className="w-[42px]" aria-hidden />
        </div>
        {children}
      </div>
    </div>
  );
}
