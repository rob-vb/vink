"use client";

import { ArrowLeft, CircleCheck, FileQuestion, Split } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { DeliveryRow, type DeliveryView } from "@/components/deliveries/delivery-row";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useDocumentsLabels, type DocumentEvent, type DocumentState } from "./labels";

/*
 * The parts of the review screen that only need plain data. The app's
 * review-screen.tsx composes them with Convex; the marketing demo
 * (components/demo) composes them with demo data. Change them here and both follow.
 */

export type ReviewFilter = "all" | "needs_review";

/** "← Documents", the filename with its state, and "Form vN · N pages · Review Threshold" ("email" or "photo" where a PDF has its pages). */
export function ReviewHeader({
  filename,
  state,
  formName,
  formVersion,
  pageCount,
  kind,
  reviewThreshold,
  backHref,
  onBack,
  badges,
  actions,
}: {
  filename: string;
  state: DocumentState;
  formName: string;
  formVersion: number | null;
  pageCount: number;
  /** An email or a photo is one unit, so it shows its kind and not "1 page". Missing: a PDF. */
  kind?: "pdf" | "email" | "image";
  reviewThreshold: number | null;
  backHref?: string;
  onBack?: () => void;
  /** Next to the state badge, e.g. "Not verified by Jev". */
  badges?: ReactNode;
  actions?: ReactNode;
}) {
  const { labels, heading: Heading } = useDocumentsLabels();
  const t = labels.review;
  const reviewing = state === "needs_review";
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        {backHref ? (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2"
            nativeButton={false}
            render={<Link href={backHref} />}
          >
            <ArrowLeft />
            {t.back}
          </Button>
        ) : (
          <Button variant="ghost" size="sm" className="-ml-2" onClick={onBack}>
            <ArrowLeft />
            {t.back}
          </Button>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Heading className="truncate text-xl font-semibold">{filename}</Heading>
          <Badge variant={reviewing ? "default" : "secondary"}>{t.states[state]}</Badge>
          {badges}
        </div>
        <p className="text-sm text-muted-foreground">
          {formVersion === null ? "" : `${formName} v${formVersion} · `}
          {kind === "email" || kind === "image" ? t.kinds[kind] : `${pageCount} ${t.pageCount(pageCount)}`}
          {reviewThreshold !== null && (
            <>
              {" "}
              · {t.reviewThreshold} {reviewThreshold.toFixed(2)}
            </>
          )}
        </p>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function ApprovalAlert({
  approval,
}: {
  approval: { mode: "auto" | "manual"; by: string | null; at: number };
}) {
  const { labels, format } = useDocumentsLabels();
  return (
    <Alert>
      <CircleCheck />
      <AlertTitle>{labels.review.approved}</AlertTitle>
      <AlertDescription>
        {labels.review.approvedBy(approval.mode, approval.by)}, {format.dateTime(approval.at)}.
      </AlertDescription>
    </Alert>
  );
}

/** A Document in No Form: no Form fits it. `actions` are Change Form and Reject. */
export function NoFormAlert({ actions }: { actions?: ReactNode }) {
  const { labels } = useDocumentsLabels();
  return (
    <Alert className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      <FileQuestion />
      <AlertTitle>{labels.review.noForm.title}</AlertTitle>
      <AlertDescription className="text-amber-900/80 dark:text-amber-200/80">
        <p>{labels.review.noForm.text}</p>
        {actions && <div className="mt-2 flex flex-wrap gap-2">{actions}</div>}
      </AlertDescription>
    </Alert>
  );
}

/** Why Vink split an email it was unsure about, on each Document it made. */
export function SplitAlert({ reason }: { reason: string }) {
  const { labels } = useDocumentsLabels();
  return (
    <Alert>
      <Split />
      <AlertTitle>{labels.review.split.title}</AlertTitle>
      <AlertDescription>{labels.review.split.text(reason)}</AlertDescription>
    </Alert>
  );
}

/** The source (PDF, email or photo) on the left and the Fields on the right, stacked below `lg`. */
export function ReviewColumns({ pdf, children }: { pdf: ReactNode; children: ReactNode }) {
  return (
    <div className="grid flex-1 items-start gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      {pdf}
      <div className="flex min-w-0 flex-col gap-4">{children}</div>
    </div>
  );
}

/** "Fields" with the All fields / Needs Review only switch. */
export function FieldsToolbar({
  filter,
  onFilterChange,
  left,
}: {
  filter: ReviewFilter;
  onFilterChange: (filter: ReviewFilter) => void;
  left: number;
}) {
  const { labels } = useDocumentsLabels();
  const t = labels.review;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-sm font-medium text-muted-foreground">{t.fields}</h2>
      <ToggleGroup
        variant="outline"
        size="sm"
        value={[filter]}
        onValueChange={(value) => value[0] && onFilterChange(value[0] as ReviewFilter)}
      >
        <ToggleGroupItem value="all">{t.allFields}</ToggleGroupItem>
        <ToggleGroupItem value="needs_review">
          {t.needsReviewOnly}
          <Badge variant="secondary" className="tabular-nums">
            {left}
          </Badge>
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}

export function NothingLeftToReview() {
  const { labels } = useDocumentsLabels();
  return <p className="p-6 text-center text-sm text-muted-foreground">{labels.review.nothingLeft}</p>;
}

/** The sticky bar under the Fields while a Document is in Needs Review. */
export function ApproveBar({
  left,
  approving,
  onApprove,
}: {
  left: number;
  approving: boolean;
  /** `next`: open the next Document in Needs Review afterwards. */
  onApprove: (next: boolean) => void;
}) {
  const { labels } = useDocumentsLabels();
  const t = labels.review;
  return (
    <div className="sticky bottom-4 z-20 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background p-3 shadow-md">
      <p className="text-sm text-muted-foreground">
        {left === 0 ? t.everythingChecked : t.valuesNeedReview(left)}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={left > 0 || approving} onClick={() => onApprove(true)}>
          {t.approveAndNext}
        </Button>
        <Button disabled={left > 0 || approving} onClick={() => onApprove(false)}>
          {left > 0 ? t.approveLeft(left) : t.approveAndSend}
        </Button>
      </div>
    </div>
  );
}

export function DeliveriesSection<D extends DeliveryView & { integrationName: string }>({
  deliveries,
  actions,
}: {
  deliveries: D[];
  actions?: (delivery: D) => ReactNode;
}) {
  const { labels } = useDocumentsLabels();
  return (
    <section aria-labelledby="deliveries" className="overflow-hidden rounded-lg border">
      <h2 id="deliveries" className="border-b px-4 py-3 text-sm font-medium">
        {labels.review.deliveries}
      </h2>
      {deliveries.map((delivery) => (
        <DeliveryRow
          key={delivery.id}
          delivery={delivery}
          title={delivery.integrationName}
          actions={actions?.(delivery)}
        />
      ))}
    </section>
  );
}

export function HistorySection({
  history,
}: {
  history: Array<{ event: DocumentEvent; detail: string | null; by: string; at: number }>;
}) {
  const { labels, format } = useDocumentsLabels();
  return (
    <section aria-labelledby="history" className="rounded-lg border p-4">
      <h2 id="history" className="mb-3 text-sm font-medium">
        {labels.review.history}
      </h2>
      <ol className="grid gap-2 text-sm">
        {history.map((entry, i) => (
          <li key={i} className="flex flex-wrap justify-between gap-x-4">
            <span>
              {labels.review.events[entry.event]}
              {entry.detail && <span className="text-muted-foreground"> · {entry.detail}</span>}
              <span className="text-muted-foreground"> · {entry.by}</span>
            </span>
            <time
              className="text-muted-foreground tabular-nums"
              dateTime={new Date(entry.at).toISOString()}
            >
              {format.dateTime(entry.at)}
            </time>
          </li>
        ))}
      </ol>
    </section>
  );
}
