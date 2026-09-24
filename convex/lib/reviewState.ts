// What still waits for a user on a Document: Field Values with reasons and no
// review, and List Fields whose entries aren't confirmed or are required but
// gone. Values in a removed List entry don't count.
import type { Doc } from "../_generated/dataModel";
import type { ReviewReason } from "./confidence";

type ListValue = Doc<"listValues">;

export function liveEntries(list: ListValue) {
  const removed = new Set(list.removedEntries ?? []);
  return Array.from({ length: list.entryCount }, (_, i) => i).filter((i) => !removed.has(i));
}

/** A List Field's reasons now: the Extraction's completeness, and whether any entry is left. */
export function listReasons(list: ListValue): ReviewReason[] {
  const reasons: ReviewReason[] = list.reviewReasons.filter((r) => r !== "required_empty");
  if (list.required && liveEntries(list).length === 0) reasons.push("required_empty");
  return reasons;
}

export function listNeedsReview(list: ListValue) {
  return listReasons(list).some((r) => r === "required_empty" || list.complete === undefined);
}

export function fieldValueNeedsReview(
  fieldValue: Pick<Doc<"fieldValues">, "reviewReasons" | "review">,
) {
  return fieldValue.reviewReasons.length > 0 && fieldValue.review === undefined;
}

/** Whether a Field Value sits in a List entry that was removed. */
export function inRemovedEntry(fieldValue: Doc<"fieldValues">, lists: ListValue[]) {
  if (!fieldValue.list) return false;
  const { key, entry } = fieldValue.list;
  return lists.some((l) => l.key === key && (l.removedEntries ?? []).includes(entry));
}

export function needsReviewCount(fieldValues: Doc<"fieldValues">[], lists: ListValue[]) {
  return (
    fieldValues.filter((f) => fieldValueNeedsReview(f) && !inRemovedEntry(f, lists)).length +
    lists.filter(listNeedsReview).length
  );
}
