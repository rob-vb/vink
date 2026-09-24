// Confidence and Needs Review (spec, Confidence and Needs Review). Confidence
// is a ranking score, not a probability: the lowest of the signals there are.
import type { Infer } from "convex/values";
import type { reviewReason, signal } from "../schema";

export type Signal = Infer<typeof signal>;
export type ReviewReason = Infer<typeof reviewReason>;

/** Jev's raw signals for one value; fit and support are `null` when not asked. */
export type Signals = { match: number; fit: number | null; support: number | null };

export function confidenceOf(signals: Signals): { confidence: number; lowestSignal: Signal } {
  let lowest: { confidence: number; lowestSignal: Signal } = {
    confidence: signals.match,
    lowestSignal: "match",
  };
  for (const name of ["fit", "support"] as const) {
    const value = signals[name];
    if (value !== null && value < lowest.confidence) {
      lowest = { confidence: value, lowestSignal: name };
    }
  }
  return lowest;
}

/** Why a Field Value is Needs Review, in a fixed order; none when it isn't. */
export function reviewReasonsOf(fieldValue: {
  confidence: number;
  threshold: number;
  required: boolean;
  empty: boolean;
  typeMismatch: boolean;
  unsure: boolean;
  conflicting: boolean;
}): ReviewReason[] {
  const reasons: ReviewReason[] = [];
  if (fieldValue.confidence < fieldValue.threshold) reasons.push("below_threshold");
  if (fieldValue.required && fieldValue.empty) reasons.push("required_empty");
  if (fieldValue.typeMismatch) reasons.push("type_mismatch");
  if (fieldValue.unsure) reasons.push("unsure");
  if (fieldValue.conflicting) reasons.push("conflicting");
  return reasons;
}
