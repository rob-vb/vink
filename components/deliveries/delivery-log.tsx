"use client";

import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { ChevronRight, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "cn";

export type DeliveryView = {
  id: string;
  deliveryId: string;
  state: "pending" | "retrying" | "delivered" | "failed";
  failureReason: string | null;
  nextAttemptAt: number | null;
  canResend: boolean;
  attempts: Array<{ at: number; status: number | null; body: string | null; error: string | null }>;
};

const stateLabels = {
  pending: "Sending",
  retrying: "Retrying",
  delivered: "Delivered",
  failed: "Failed",
} as const;

const when = new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "medium" });

export function DeliveryState({ state }: { state: DeliveryView["state"] }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        state === "delivered" && "border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400",
        state === "failed" && "border-destructive/50 text-destructive",
        state === "retrying" && "border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400",
      )}
    >
      {stateLabels[state]}
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
              {delivery.failureReason}. Next try {when.format(delivery.nextAttemptAt)}.
            </>
          )}
        </p>
      )}
      <CollapsibleContent className="px-4 pb-3 pl-10">
        <p className="mb-2 font-mono text-xs text-muted-foreground">{delivery.deliveryId}</p>
        {delivery.attempts.length === 0 ? (
          <p className="text-xs text-muted-foreground">No attempt yet.</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {delivery.attempts.map((attempt, i) => (
              <li key={i} className="rounded-md border p-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <time className="tabular-nums text-muted-foreground">{when.format(attempt.at)}</time>
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

/** "Send again" for a failed Delivery: Admin only, same deliveryId, current configuration. */
export function ResendButton({
  organisationSlug,
  delivery,
}: {
  organisationSlug: string;
  delivery: DeliveryView;
}) {
  const resend = useMutation(api.deliveries.resend);
  if (!delivery.canResend) return null;
  return (
    <Button
      variant="outline"
      size="xs"
      onClick={() =>
        resend({ organisationSlug, id: delivery.id as Id<"deliveries"> }).catch((error) =>
          toast.error(error instanceof ConvexError ? String(error.data) : "That didn't work. Try again."),
        )
      }
    >
      <RotateCcw />
      Send again
    </Button>
  );
}
