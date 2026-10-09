"use client";

import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { useSubmissionsLabels } from "@/components/submissions/labels";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "cn";

// Plain data only, so the marketing demo can show a Delivery exactly as the app does.

export type DeliveryView = {
  id: string;
  deliveryId: string;
  state: "pending" | "retrying" | "delivered" | "failed";
  failureReason: string | null;
  nextAttemptAt: number | null;
  canResend: boolean;
  attempts: Array<{ at: number; status: number | null; body: string | null; error: string | null }>;
};

export function DeliveryState({ state }: { state: DeliveryView["state"] }) {
  const { labels } = useSubmissionsLabels();
  return (
    <Badge
      variant="outline"
      className={cn(
        state === "delivered" && "border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400",
        state === "failed" && "border-destructive/50 text-destructive",
        state === "retrying" && "border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400",
      )}
    >
      {labels.delivery.states[state]}
    </Badge>
  );
}

/**
 * One Delivery: its state, and when opened, every attempt with its time,
 * status code and the start of the answer.
 */
export function DeliveryRow({
  delivery,
  title,
  actions,
}: {
  delivery: DeliveryView;
  title: ReactNode;
  actions?: ReactNode;
}) {
  const { labels, format } = useSubmissionsLabels();
  return (
    <Collapsible className="border-b last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
        <CollapsibleTrigger className="group flex min-w-0 flex-1 items-center gap-2 text-left text-sm">
          <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]:rotate-90" />
          <span className="min-w-0 truncate font-medium">{title}</span>
          <DeliveryState state={delivery.state} />
        </CollapsibleTrigger>
        {actions}
      </div>
      {(delivery.failureReason || delivery.nextAttemptAt) && (
        <p className="px-4 pb-2 pl-10 text-xs text-muted-foreground">
          {delivery.state === "failed" && delivery.failureReason}
          {delivery.state === "retrying" && delivery.nextAttemptAt && (
            <>
              {delivery.failureReason}. {labels.delivery.nextTry} {format.precise(delivery.nextAttemptAt)}.
            </>
          )}
        </p>
      )}
      <CollapsibleContent className="px-4 pb-3 pl-10">
        <p className="mb-2 font-mono text-xs text-muted-foreground">{delivery.deliveryId}</p>
        {delivery.attempts.length === 0 ? (
          <p className="text-xs text-muted-foreground">{labels.delivery.noAttempt}</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {delivery.attempts.map((attempt, i) => (
              <li key={i} className="rounded-md border p-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <time className="tabular-nums text-muted-foreground">{format.precise(attempt.at)}</time>
                  {attempt.status !== null ? (
                    <Badge variant="secondary" className="font-mono">
                      {attempt.status}
                    </Badge>
                  ) : (
                    <span className="text-destructive">{attempt.error}</span>
                  )}
                </div>
                {attempt.body && (
                  <pre className="mt-1 max-h-24 overflow-auto font-mono whitespace-pre-wrap break-all text-muted-foreground">
                    {attempt.body}
                  </pre>
                )}
              </li>
            ))}
          </ol>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
