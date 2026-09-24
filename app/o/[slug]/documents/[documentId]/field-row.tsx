"use client";

import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";
import { Check, Undo2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/convex/_generated/api";
import { cn } from "cn";

export type FieldValueView = FunctionReturnType<
  typeof api.documents.get
>["fieldValues"][number];

type Value = FieldValueView["value"];

const reasonLabels = {
  below_threshold: "Below threshold",
  required_empty: "Required but empty",
  type_mismatch: "Doesn't fit the type",
  unsure: "Read as unsure",
  conflicting: "Conflicting readings",
} as const;

const signalLabels = { match: "Match", fit: "Jev fit", support: "Jev support" } as const;

const reviewedAt = new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" });

function pagesLabel(pages: number[]) {
  return pages.length === 1 ? `page ${pages[0]}` : `pages ${pages.join(", ")}`;
}

/**
 * A ranking score from 0 to 1 with a tick at the Review Threshold. Shown as a
 * number to two decimals, never as a percentage.
 */
export function ConfidenceBar({ confidence, threshold }: { confidence: number; threshold: number }) {
  const low = confidence < threshold;
  return (
    <div
      className="flex items-center gap-2"
      role="img"
      aria-label={`Confidence ${confidence.toFixed(2)}, threshold ${threshold.toFixed(2)}`}
    >
      <div className="relative h-1.5 w-14 rounded-full bg-muted">
        <div
          className={cn(
            "absolute inset-y-0 left-0 rounded-full",
            low ? "bg-amber-500" : "bg-emerald-600 dark:bg-emerald-500",
          )}
          style={{ width: `${confidence * 100}%` }}
        />
        <div
          className="absolute -inset-y-0.5 w-px bg-foreground/60"
          style={{ left: `${threshold * 100}%` }}
        />
      </div>
      <span className="font-mono text-xs tabular-nums">{confidence.toFixed(2)}</span>
    </div>
  );
}

function asText(value: Value) {
  return value === null ? "" : String(value);
}

/** What the user typed, as the value the correction sends. */
function parse(fieldValue: FieldValueView, draft: string): Value {
  const text = draft.trim();
  if (text === "") return null;
  if (fieldValue.type === "number") {
    const number = Number(text.replace(",", "."));
    return Number.isNaN(number) ? text : number;
  }
  return text;
}

/** One Field Value: label and key, the editable value, where it was read, and its review state. */
export function FieldRow({
  organisationSlug,
  fieldValue,
  threshold,
  disabled,
  selected,
  onSelect,
}: {
  organisationSlug: string;
  fieldValue: FieldValueView;
  threshold: number;
  disabled: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const correct = useMutation(api.review.correct);
  const check = useMutation(api.review.check);
  const undo = useMutation(api.review.undo);
  const [draft, setDraft] = useState(asText(fieldValue.value));
  const [shown, setShown] = useState(fieldValue.value);
  // Follow the stored value when it changes elsewhere (Undo, another user).
  if (shown !== fieldValue.value) {
    setShown(fieldValue.value);
    setDraft(asText(fieldValue.value));
  }

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
    } catch (error) {
      setDraft(asText(fieldValue.value));
      toast.error(error instanceof ConvexError ? String(error.data) : "That didn't work. Try again.");
    }
  }

  function save(value: Value) {
    if (value === fieldValue.value) return;
    void run(() => correct({ organisationSlug, fieldValueId: fieldValue.id, value }));
  }

  const inputId = `field-${fieldValue.id}`;
  const { review } = fieldValue;

  return (
    <div
      className={cn(
        "grid gap-x-4 gap-y-2 border-t px-4 py-3 first:border-t-0 sm:grid-cols-[10rem_minmax(0,1fr)_auto]",
        fieldValue.needsReview && "bg-amber-50 dark:bg-amber-950/30",
        selected && "ring-2 ring-ring ring-inset",
      )}
      onFocus={onSelect}
      onClick={onSelect}
    >
      <label htmlFor={inputId} className="pt-1.5">
        <span className="block text-sm font-medium">
          {fieldValue.label}
          {fieldValue.required && <span className="text-muted-foreground"> *</span>}
        </span>
        <span className="block font-mono text-xs text-muted-foreground">{fieldValue.key}</span>
      </label>

      <div className="min-w-0">
        {fieldValue.type === "boolean" || fieldValue.type === "choice" ? (
          <Select
            value={fieldValue.value === null ? "" : String(fieldValue.value)}
            disabled={disabled}
            onValueChange={(choice) =>
              save(
                fieldValue.type === "boolean"
                  ? choice === "true"
                  : (choice as string) || null,
              )
            }
          >
            <SelectTrigger id={inputId} className="w-full">
              <SelectValue placeholder="No value" />
            </SelectTrigger>
            <SelectContent>
              {fieldValue.type === "boolean" ? (
                <>
                  <SelectItem value="true">Yes</SelectItem>
                  <SelectItem value="false">No</SelectItem>
                </>
              ) : (
                fieldValue.options!.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        ) : (
          <Input
            id={inputId}
            type={fieldValue.type === "date" ? "date" : "text"}
            inputMode={fieldValue.type === "number" ? "decimal" : undefined}
            className="font-mono"
            placeholder="No value"
            value={draft}
            disabled={disabled}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => save(parse(fieldValue, draft))}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") setDraft(asText(fieldValue.value));
            }}
          />
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          {fieldValue.readText === null ? (
            "Not found on the Document"
          ) : (
            <>
              Read on {pagesLabel(fieldValue.pages)}:{" "}
              <span className="font-mono text-foreground">{fieldValue.readText}</span>
            </>
          )}
        </p>
        {fieldValue.needsReview && (
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
            {fieldValue.reviewReasons.map((r) => reasonLabels[r]).join(" · ")} · lowest signal:{" "}
            {signalLabels[fieldValue.lowestSignal]}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end">
        <ConfidenceBar confidence={fieldValue.confidence} threshold={threshold} />
        {fieldValue.needsReview ? (
          <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
            Needs Review
          </Badge>
        ) : review ? (
          <Badge
            variant="secondary"
            title={`${review.by}, ${reviewedAt.format(review.at)}`}
          >
            {review.state === "corrected" ? "Corrected" : "Checked"}
          </Badge>
        ) : null}
        <div className="flex gap-1">
          {fieldValue.needsReview && (
            <Button
              size="xs"
              variant="outline"
              disabled={disabled}
              onClick={() =>
                run(() => check({ organisationSlug, fieldValueId: fieldValue.id }))
              }
            >
              <Check />
              Value is right
            </Button>
          )}
          {review && (
            <Button
              size="xs"
              variant="ghost"
              disabled={disabled}
              onClick={() => run(() => undo({ organisationSlug, fieldValueId: fieldValue.id }))}
            >
              <Undo2 />
              Undo
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
