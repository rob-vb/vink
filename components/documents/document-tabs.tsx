"use client";

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDocumentsLabels, type ListedState } from "./labels";

// Extracting has its own page: those Documents need nothing from anyone yet.
export const listedStates = ["needs_review", "approved", "extraction_failed", "rejected"] as const;

/** The Documents page heading, with its controls (Upload, Email in, …) on the right. */
export function DocumentsHeading({ actions }: { actions?: ReactNode }) {
  const { labels } = useDocumentsLabels();
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold">{labels.documents.title}</h1>
        <p className="text-sm text-muted-foreground">{labels.documents.subtitle}</p>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/**
 * Needs Review / Approved / Failed / Rejected with their counts. Shared by the
 * app's Documents page and the marketing demo.
 */
export function DocumentStateTabs({
  value,
  onValueChange,
  counts,
}: {
  value: ListedState;
  onValueChange: (state: ListedState) => void;
  /** Undefined while loading. */
  counts: Record<ListedState, number> | undefined;
}) {
  const { labels } = useDocumentsLabels();
  return (
    <Tabs value={value} onValueChange={(next) => onValueChange(next as ListedState)}>
      {/* Scrolls sideways on a narrow screen, without a visible scrollbar. The padding
          keeps the active tab's underline inside, so there is nothing to scroll down to. */}
      <div className="-mx-4 overflow-x-auto overflow-y-hidden px-4 pb-1 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden">
        <TabsList variant="line">
          {listedStates.map((state) => (
            <TabsTrigger key={state} value={state}>
              {labels.documents.tabs[state]}
              <Badge variant="secondary" className="tabular-nums">
                {counts?.[state] ?? "–"}
              </Badge>
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
    </Tabs>
  );
}
