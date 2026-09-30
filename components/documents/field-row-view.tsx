"use client";

import { Check, Undo2 } from "lucide-react";
import { useState } from "react";
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
import { cn } from "cn";
import { useDocumentsLabels, type ReviewReason, type Signal } from "./labels";

export type FieldValueType = "text" | "number" | "date" | "boolean" | "choice";
export type Value = string | number | boolean | null;

/** What a user sees of one Field Value, as `api.documents.get` returns it. */
export type FieldValueData = {
  id: string;
  key: string;
  label: string;
  type: FieldValueType;
  required: boolean;
  options: string[] | null;
  value: Value;
  readText: string | null;
  pages: number[];
  confidence: number;
  lowestSignal: Signal;
  reviewReasons: ReviewReason[];
  needsReview: boolean;
  review: { state: "checked" | "corrected"; by: string; at: number } | null;
};

/**
 * A ranking score from 0 to 1 with a tick at the Review Threshold. Shown as a
 * number to two decimals, never as a percentage.
 */
export function ConfidenceBar({ confidence, threshold }: { confidence: number; threshold: number }) {
  const { labels } = useDocumentsLabels();
  const low = confidence < threshold;
  return (
    <div
      className="flex items-center gap-2"
      role="img"
      aria-label={labels.field.confidence(confidence.toFixed(2), threshold.toFixed(2))}
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
function parse(fieldValue: FieldValueData, draft: string): Value {
  const text = draft.trim();
  if (text === "") return null;
  if (fieldValue.type === "number") {
    const number = Number(text.replace(",", "."));
    return Number.isNaN(number) ? text : number;
  }
  return text;
}

/**
 * One Field Value: label and key, the editable value, where it was read, and
 * its review state. Plain data and callbacks: the app's FieldRow feeds it from
 * Convex, the marketing demo from static data.
 */
export function FieldRowView({
  fieldValue,
  threshold,
  disabled,
  manual = false,
  selected,
  onSelect,
  onCorrect,
  onCheck,
  onUndo,
  onError,
}: {
  fieldValue: FieldValueData;
  threshold: number;
  disabled: boolean;
  /** In a List entry a user added: nothing was read, so there's no confidence to show. */
  manual?: boolean;
  selected: boolean;
  onSelect: () => void;
  onCorrect: (value: Value) => Promise<unknown> | void;
  onCheck: () => Promise<unknown> | void;
  onUndo: () => Promise<unknown> | void;
  /** After a failed action; the draft is already back to the stored value. */
  onError?: (error: unknown) => void;
}) {
  const { labels, format } = useDocumentsLabels();
  const t = labels.field;
  const [draft, setDraft] = useState(asText(fieldValue.value));
  const [shown, setShown] = useState(fieldValue.value);
  // Follow the stored value when it changes elsewhere (Undo, another user).
  if (shown !== fieldValue.value) {
    setShown(fieldValue.value);
    setDraft(asText(fieldValue.value));
  }

  async function run(action: () => Promise<unknown> | void) {
    try {
      await action();
    } catch (error) {
      setDraft(asText(fieldValue.value));
      onError?.(error);
    }
  }

  function save(value: Value) {
    if (value === fieldValue.value) return;
    void run(() => onCorrect(value));
  }

  const inputId = `field-${fieldValue.id}`;
  const items =
    fieldValue.type === "boolean"
      ? [
          { value: "true", label: t.yes },
          { value: "false", label: t.no },
        ]
      : (fieldValue.options ?? []).map((option) => ({ value: option, label: option }));
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
            items={items}
            value={fieldValue.value === null ? null : String(fieldValue.value)}
            disabled={disabled}
            onValueChange={(choice) =>
              save(
                choice === null
                  ? null
                  : fieldValue.type === "boolean"
                    ? choice === "true"
                    : (choice as string),
              )
            }
          >
            <SelectTrigger id={inputId} className="w-full">
              <SelectValue placeholder={t.noValue} />
            </SelectTrigger>
            <SelectContent>
              {items.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            id={inputId}
            type={fieldValue.type === "date" ? "date" : "text"}
            inputMode={fieldValue.type === "number" ? "decimal" : undefined}
            className="font-mono"
            placeholder={t.noValue}
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
          {manual ? (
            t.filledByHand
          ) : fieldValue.readText === null ? (
            t.notFound
          ) : (
            <>
              {t.readOn(fieldValue.pages)}:{" "}
              <span className="font-mono text-foreground">{fieldValue.readText}</span>
            </>
          )}
        </p>
        {fieldValue.needsReview && (
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
            {fieldValue.reviewReasons.map((r) => t.reasons[r]).join(" · ")}
            {!manual && (
              <>
                {" "}
                · {t.lowestSignal}: {t.signals[fieldValue.lowestSignal]}
              </>
            )}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end">
        {!manual && <ConfidenceBar confidence={fieldValue.confidence} threshold={threshold} />}
        {fieldValue.needsReview ? (
          <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
            {t.needsReview}
          </Badge>
        ) : review ? (
          <Badge variant="secondary" title={`${review.by}, ${format.short(review.at)}`}>
            {review.state === "corrected" ? t.corrected : t.checked}
          </Badge>
        ) : null}
        <div className="flex gap-1">
          {fieldValue.needsReview && (
            <Button size="xs" variant="outline" disabled={disabled} onClick={() => run(onCheck)}>
              <Check />
              {t.valueIsRight}
            </Button>
          )}
          {review && (
            <Button size="xs" variant="ghost" disabled={disabled} onClick={() => run(onUndo)}>
              <Undo2 />
              {t.undo}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
