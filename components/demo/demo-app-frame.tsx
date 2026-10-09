"use client";

import { ChevronsUpDown, RotateCcw } from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "cn";

/**
 * The app's top bar with Submissions active, as in app/app/o/[slug]/layout.tsx
 * and nav-links.tsx (update both), plus the "Demo data" badge. Only
 * Submissions does something here; the rest of the app needs an account.
 */
export function DemoAppFrame({
  organisation,
  nav,
  demoData,
  startOver,
  onSubmissions,
  onStartOver,
  children,
}: {
  organisation: string;
  nav: { submissions: string; forms: string; integrations: string; members: string };
  demoData: string;
  startOver: string;
  onSubmissions: () => void;
  onStartOver: () => void;
  children: ReactNode;
}) {
  const link =
    "relative flex h-full items-center text-muted-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-foreground after:opacity-0";
  return (
    <div className="flex flex-col">
      <header className="flex flex-wrap items-center justify-between gap-x-3 border-b px-4 md:px-6">
        <div className="flex h-14 min-w-0 flex-1 items-center gap-2 sm:flex-none">
          <Image src="/vink_icon.svg" alt="Vink" width={518} height={363} className="h-6 w-auto" />
          <span className="shrink-0 text-muted-foreground">/</span>
          <span className="flex min-w-0 items-center gap-1 text-sm font-medium">
            <span className="truncate">{organisation}</span>
            <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
          </span>
        </div>
        <nav className="order-last -mx-4 flex h-10 w-[calc(100%+2rem)] items-center gap-4 overflow-x-auto border-t px-4 text-sm whitespace-nowrap [scrollbar-width:none] sm:order-none sm:mx-0 sm:h-14 sm:w-auto sm:flex-1 sm:border-t-0 sm:px-2">
          <button
            type="button"
            aria-current="page"
            onClick={onSubmissions}
            className={cn(link, "cursor-pointer font-medium text-foreground after:opacity-100")}
          >
            {nav.submissions}
          </button>
          <span className={link}>{nav.forms}</span>
          <span className={link}>{nav.integrations}</span>
          <span className={link}>{nav.members}</span>
        </nav>
        <div className="flex shrink-0 items-center gap-1">
          <Badge variant="outline" className="font-mono text-[0.7rem] tracking-wide uppercase">
            {demoData}
          </Badge>
          <Button variant="ghost" size="sm" onClick={onStartOver}>
            <RotateCcw />
            <span className="sr-only sm:not-sr-only">{startOver}</span>
          </Button>
        </div>
      </header>
      {children}
    </div>
  );
}
