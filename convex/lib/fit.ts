// "Does not fit this Form" (spec, Extraction pipeline): set from the Match
// result when the Reading is empty or too few required Fields matched.
import type { FlatField, ListField, ListMatch, Match, Reading } from "./pipeline";
import { readingLeaves } from "./reading";

// Fewer than this share of the required Fields matched means the Document
// was probably uploaded against the wrong Form.
const DEFAULT_CUTOFF = 0.5;

export function doesNotFit(
  reading: Reading,
  fields: FlatField[],
  lists: ListField[],
  matches: { fields: Record<string, Match>; lists: Record<string, ListMatch> },
) {
  if (readingLeaves(reading).length === 0) return true;
  const required = [
    ...fields.filter((f) => f.required).map((f) => matches.fields[f.key]),
    ...lists.filter((l) => l.required).map((l) => matches.lists[l.key]),
  ];
  if (required.length === 0) return false;
  const matched = required.filter((m) => m?.path != null).length;
  const cutoff = Number(process.env.DOES_NOT_FIT_CUTOFF ?? DEFAULT_CUTOFF);
  return matched / required.length < cutoff;
}
