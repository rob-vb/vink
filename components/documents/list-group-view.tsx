"use client";

import { Check, Plus, RotateCcw, Undo2, X } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import { ConfidenceBar, type FieldValueData } from "./field-row-view";
import { useDocumentsLabels, type ReviewReason } from "./labels";

/** A List Field on one Document, as `api.documents.get` returns it. */
export type ListData<F extends FieldValueData = FieldValueData> = {
  key: string;
  label: string;
  required: boolean;
  completeness: number;
  reviewReasons: ReviewReason[];
  needsReview: boolean;
  complete: { by: string; at: number } | null;
  entries: Array<{ entry: number; removed: boolean; added: boolean; fieldValues: F[] }>;
};

/**
 * A List Field on the review screen: its completeness row, then each entry
 * with a row per sub-Field. Entries can be added, removed and restored.
 * Plain data and callbacks, shared by the app and the marketing demo;
 * `renderField` draws one sub-Field's row.
 */
export function ListGroupView<F extends FieldValueData>({
  list,
  threshold,
  disabled,
  filter,
  selected,
  renderField,
  onConfirm,
  onUndoConfirm,
  onRemove,
  onRestore,
  onAdd,
}: {
  list: ListData<F>;
  threshold: number;
  disabled: boolean;
  filter: "all" | "needs_review";
  selected: string | null;
  renderField: (fieldValue: F, manual: boolean) => ReactNode;
  onConfirm: () => void;
  onUndoConfirm: () => void;
  onRemove: (entry: number) => void;
  onRestore: (entry: number) => void;
  onAdd: () => void;
}) {
  const { labels } = useDocumentsLabels();
  const t = labels.list;
  const entries = list.entries.filter(
    (e) =>
      filter === "all" ||
      (!e.removed && e.fieldValues.some((f) => f.needsReview || f.id === selected)),
  );
  const live = list.entries.filter((e) => !e.removed).length;

  return (
    <section className="overflow-hidden rounded-lg border bg-card" aria-label={list.label}>
      <div
        className={cn(
          "flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3",
          list.needsReview && "bg-amber-50 dark:bg-amber-950/30",
        )}
      >
        <div className="min-w-0">
          <h3 className="text-sm font-medium">
            {list.label}
            {list.required && <span className="text-muted-foreground"> *</span>}
          </h3>
          <p className="text-xs text-muted-foreground">{t.entries(live)}</p>
          {list.needsReview && (
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
              {list.reviewReasons.map((r) => t.reasons[r]).join(" · ")}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end">
          <ConfidenceBar confidence={list.completeness} threshold={threshold} />
          {list.needsReview ? (
            <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
              {labels.field.needsReview}
            </Badge>
          ) : list.complete ? (
            <Badge variant="secondary" title={list.complete.by}>
              {t.complete}
            </Badge>
          ) : null}
          <div className="flex gap-1">
            {!list.complete && (
              <Button size="xs" variant="outline" disabled={disabled} onClick={onConfirm}>
                <Check />
                {t.entriesComplete}
              </Button>
            )}
            {list.complete && (
              <Button size="xs" variant="ghost" disabled={disabled} onClick={onUndoConfirm}>
                <Undo2 />
                {t.undo}
              </Button>
            )}
          </div>
        </div>
      </div>

      {entries.map((entry) => (
        <div key={entry.entry} className="border-b last:border-b-0">
          <div className="flex items-center justify-between gap-2 bg-muted/40 px-4 py-1.5">
            <p
              className={cn(
                "flex items-center gap-2 text-xs font-medium text-muted-foreground",
                entry.removed && "line-through",
              )}
            >
              {t.entry(entry.entry + 1)}
              {entry.added && <Badge variant="outline">{t.addedByHand}</Badge>}
            </p>
            {entry.removed ? (
              <Button
                size="xs"
                variant="ghost"
                disabled={disabled}
                onClick={() => onRestore(entry.entry)}
              >
                <RotateCcw />
                {t.restore}
              </Button>
            ) : (
              <Button
                size="xs"
                variant="ghost"
                disabled={disabled}
                aria-label={t.removeEntry(entry.entry + 1)}
                onClick={() => onRemove(entry.entry)}
              >
                <X />
                {t.remove}
              </Button>
            )}
          </div>
          {!entry.removed &&
            entry.fieldValues
              .filter((f) => filter === "all" || f.needsReview || f.id === selected)
              .map((fieldValue) => (
                <Fragment key={fieldValue.id}>{renderField(fieldValue, entry.added)}</Fragment>
              ))}
        </div>
      ))}

      {filter === "all" && (
        <div className="px-4 py-2">
          <Button size="sm" variant="ghost" disabled={disabled} onClick={onAdd}>
            <Plus />
            {t.addEntry}
          </Button>
        </div>
      )}
    </section>
  );
}
