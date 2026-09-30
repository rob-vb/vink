import { Check, ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { REVIEW_THRESHOLD, type SampleDocument, type SampleField } from "./sample-documents";

// A faithful static rendition of the app's review screen
// (app/app/o/[slug]/documents/[documentId]/review-screen.tsx and field-row.tsx),
// fed with sample data. Same layout, labels and styles; no behaviour. When the
// review screen changes, change this too (the demo mirrors the app).

export function ConfidenceMock({ confidence }: { confidence: number }) {
  const low = confidence < REVIEW_THRESHOLD;
  return (
    <div
      className="flex items-center gap-2"
      role="img"
      aria-label={`Confidence ${confidence.toFixed(2)}, threshold ${REVIEW_THRESHOLD.toFixed(2)}`}
    >
      <div className="relative h-1.5 w-14 rounded-full bg-muted">
        <div
          className={cn("absolute inset-y-0 left-0 rounded-full", low ? "bg-amber-500" : "bg-emerald-600")}
          style={{ width: `${confidence * 100}%` }}
        />
        <div className="absolute -inset-y-0.5 w-px bg-foreground/60" style={{ left: `${REVIEW_THRESHOLD * 100}%` }} />
      </div>
      <span className="font-mono text-xs tabular-nums">{confidence.toFixed(2)}</span>
    </div>
  );
}

export function FieldRowMock({ field, stacked = false }: { field: SampleField; stacked?: boolean }) {
  const needsReview = field.confidence < REVIEW_THRESHOLD && !field.checked;
  return (
    <div
      className={cn(
        "grid gap-x-4 gap-y-2 border-t px-4 py-3 text-left first:border-t-0",
        stacked ? "grid-cols-[minmax(0,1fr)_auto]" : "sm:grid-cols-[8.5rem_minmax(0,1fr)_auto]",
        needsReview && "bg-amber-50",
      )}
    >
      <div className={cn("pt-1.5", stacked && "col-start-1 row-start-1 pt-0")}>
        <span className="block text-sm font-medium">{field.label}</span>
        <span className="block font-mono text-xs text-muted-foreground">{field.key}</span>
      </div>
      <div className={cn("min-w-0", stacked && "col-span-2 row-start-2")}>
        <div className="flex h-8 w-full min-w-0 items-center truncate rounded-lg border border-input bg-transparent px-2.5 font-mono text-sm">
          {field.value}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {field.read === null ? (
            "Not found on the Document"
          ) : (
            <>
              Read on page {field.page}: <span className="font-mono text-foreground">{field.read}</span>
            </>
          )}
        </p>
        {needsReview && field.reasons && <p className="mt-1 text-xs text-amber-700">{field.reasons}</p>}
      </div>
      <div
        className={cn(
          "flex flex-wrap items-center gap-2",
          stacked ? "col-start-2 row-start-1 flex-col items-end gap-1.5" : "sm:flex-col sm:items-end",
        )}
      >
        <ConfidenceMock confidence={field.confidence} />
        {needsReview ? (
          <Badge className="bg-amber-100 text-amber-800">Needs Review</Badge>
        ) : field.checked ? (
          <Badge variant="secondary">Checked</Badge>
        ) : null}
        {needsReview && (
          <Button size="xs" variant="outline" tabIndex={-1} aria-hidden>
            <Check />
            Value is right
          </Button>
        )}
      </div>
    </div>
  );
}

/** The Fields card of the review screen, optionally with only some rows. */
export function FieldsMock({
  fields,
  stacked = false,
  className,
}: {
  fields: SampleField[];
  stacked?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("overflow-hidden rounded-lg border bg-card", className)}>
      {fields.map((field) => (
        <FieldRowMock key={field.key} field={field} stacked={stacked} />
      ))}
    </div>
  );
}

function PdfPaneMock({ document }: { document: SampleDocument }) {
  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-muted/40">
      <div className="flex items-center justify-between gap-2 border-b bg-background px-2 py-1.5">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" disabled tabIndex={-1} aria-hidden>
            <ChevronLeft />
          </Button>
          <span className="min-w-14 text-center text-sm tabular-nums">
            1 / {document.pages}
          </span>
          <Button variant="ghost" size="icon-sm" disabled tabIndex={-1} aria-hidden>
            <ChevronRight />
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" tabIndex={-1} aria-hidden>
            <Minus />
          </Button>
          <span className="min-w-12 text-center text-sm tabular-nums">100%</span>
          <Button variant="ghost" size="icon-sm" tabIndex={-1} aria-hidden>
            <Plus />
          </Button>
        </div>
      </div>
      <div className="p-3 [zoom:0.9]">{document.paper}</div>
    </div>
  );
}

/** The whole review screen for one Document in Needs Review. */
export function ReviewScreenMock({ document, label }: { document: SampleDocument; label: string }) {
  const open = document.fields.filter((f) => f.confidence < REVIEW_THRESHOLD && !f.checked).length;
  return (
    <div role="img" aria-label={label} className="flex flex-col gap-3 p-3 text-left sm:p-4">
      <div aria-hidden className="contents">
        <div className="min-w-0">
          <p className="flex items-center gap-1 text-[0.8rem] font-medium text-muted-foreground">
            <ChevronLeft className="size-3.5" />
            Documents
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <p className="truncate text-lg font-semibold">{document.file}</p>
            <Badge>Needs Review</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {document.form} v{document.version} · {document.pages} {document.pages === 1 ? "page" : "pages"}
          </p>
        </div>
        <div className="grid items-start gap-3 sm:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          <div className="hidden sm:block">
            <PdfPaneMock document={document} />
          </div>
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-muted-foreground">Fields</p>
              <div className="flex rounded-lg border text-[0.8rem]">
                <span className="rounded-l-lg bg-muted px-2.5 py-1">All fields</span>
                <span className="flex items-center gap-1 border-l px-2.5 py-1">
                  Needs Review only
                  <Badge variant="secondary" className="tabular-nums">
                    {open}
                  </Badge>
                </span>
              </div>
            </div>
            <FieldsMock fields={document.fields} stacked />
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background p-3 shadow-md">
              <p className="text-sm text-muted-foreground">
                {open} {open === 1 ? "value needs" : "values need"} review before Approval.
              </p>
              <Button disabled tabIndex={-1}>
                Approve ({open} left)
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
