"use client";

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSubmissionsLabels, type ListedState } from "./labels";

// Extracting has its own page: those Submissions need nothing from anyone yet.
export const listedStates = ["needs_review", "no_form", "approved", "extraction_failed", "rejected"] as const;

/** The Submissions page heading, with its controls (Upload, Email in, …) on the right. */
export function SubmissionsHeading({ actions }: { actions?: ReactNode }) {
  const { labels, heading: Heading } = useSubmissionsLabels();
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div>
        <Heading className="text-xl font-semibold">{labels.submissions.title}</Heading>
        <p className="text-sm text-muted-foreground">{labels.submissions.subtitle}</p>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/**
 * Needs Review / No Form / Approved / Failed / Rejected with their counts. Shared by the
 * app's Submissions page and the marketing demo.
 */
export function SubmissionStateTabs({
  value,
  onValueChange,
  counts,
}: {
  value: ListedState;
  onValueChange: (state: ListedState) => void;
  /** Undefined while loading. */
  counts: Record<ListedState, number> | undefined;
}) {
  const { labels } = useSubmissionsLabels();
  return (
    <Tabs value={value} onValueChange={(next) => onValueChange(next as ListedState)}>
      {/* Scrolls sideways on a narrow screen, without a visible scrollbar. The padding
          keeps the active tab's underline inside, so there is nothing to scroll down to. */}
      <div className="-mx-4 overflow-x-auto overflow-y-hidden px-4 pb-1 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden">
        <TabsList variant="line">
          {listedStates.map((state) => (
            <TabsTrigger key={state} value={state}>
              {labels.submissions.tabs[state]}
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
