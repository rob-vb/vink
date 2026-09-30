"use client";

import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";
import { Check, Plus, RotateCcw, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "cn";
import { ConfidenceBar, FieldRow } from "./field-row";

type ListView = FunctionReturnType<typeof api.documents.get>["lists"][number];

const reasonLabels = {
  below_threshold: "Some entries may be missing or invented",
  required_empty: "Required, but there are no entries",
  type_mismatch: "Doesn't fit the type",
  unsure: "Read as unsure",
  conflicting: "Conflicting readings",
} as const;

/**
 * A List Field on the review screen: its completeness row, then each entry
 * with a row per sub-Field. Entries can be added, removed and restored.
 */
export function ListGroup({
  organisationSlug,
  documentId,
  list,
  threshold,
  disabled,
  filter,
  selected,
  onSelect,
}: {
  organisationSlug: string;
  documentId: Id<"documents">;
  list: ListView;
  threshold: number;
  disabled: boolean;
  filter: "all" | "needs_review";
  selected: string | null;
  onSelect: (id: string, pages: number[]) => void;
}) {
  const addEntry = useMutation(api.review.addEntry);
  const removeEntry = useMutation(api.review.removeEntry);
  const restoreEntry = useMutation(api.review.restoreEntry);
  const confirmEntries = useMutation(api.review.confirmEntries);
  const undoConfirmEntries = useMutation(api.review.undoConfirmEntries);
  const on = { organisationSlug, documentId, listKey: list.key };

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
    } catch (error) {
      toast.error(error instanceof ConvexError ? String(error.data) : "That didn't work. Try again.");
    }
  }

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
          <p className="text-xs text-muted-foreground">
            {live} {live === 1 ? "entry" : "entries"} · were all entries found?
          </p>
          {list.needsReview && (
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
              {list.reviewReasons.map((r) => reasonLabels[r]).join(" · ")}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end">
          <ConfidenceBar confidence={list.completeness} threshold={threshold} />
          {list.needsReview ? (
            <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
              Needs Review
            </Badge>
          ) : list.complete ? (
            <Badge variant="secondary" title={list.complete.by}>
              Complete
            </Badge>
          ) : null}
          <div className="flex gap-1">
            {!list.complete && (
              <Button
                size="xs"
                variant="outline"
                disabled={disabled}
                onClick={() => run(() => confirmEntries(on))}
              >
                <Check />
                Entries are complete
              </Button>
            )}
            {list.complete && (
              <Button
                size="xs"
                variant="ghost"
                disabled={disabled}
                onClick={() => run(() => undoConfirmEntries(on))}
              >
                <Undo2 />
                Undo
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
              Entry {entry.entry + 1}
              {entry.added && <Badge variant="outline">Added by hand</Badge>}
            </p>
            {entry.removed ? (
              <Button
                size="xs"
                variant="ghost"
                disabled={disabled}
                onClick={() => run(() => restoreEntry({ ...on, entry: entry.entry }))}
              >
                <RotateCcw />
                Restore
              </Button>
            ) : (
              <Button
                size="xs"
                variant="ghost"
                disabled={disabled}
                aria-label={`Remove entry ${entry.entry + 1}`}
                onClick={() => run(() => removeEntry({ ...on, entry: entry.entry }))}
              >
                <X />
                Remove
              </Button>
            )}
          </div>
          {!entry.removed &&
            entry.fieldValues
              .filter((f) => filter === "all" || f.needsReview || f.id === selected)
              .map((fieldValue) => (
                <FieldRow
                  key={fieldValue.id}
                  organisationSlug={organisationSlug}
                  fieldValue={fieldValue}
                  threshold={threshold}
                  disabled={disabled}
                  manual={entry.added}
                  selected={selected === fieldValue.id}
                  onSelect={() => onSelect(fieldValue.id, fieldValue.pages)}
                />
              ))}
        </div>
      ))}

      {filter === "all" && (
        <div className="px-4 py-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={() => run(() => addEntry(on))}
          >
            <Plus />
            Add entry
          </Button>
        </div>
      )}
    </section>
  );
}
