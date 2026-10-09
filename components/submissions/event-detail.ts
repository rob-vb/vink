import type { SubmissionsLabels } from "@/components/submissions/labels";
import type { EventInfo, SplitInfo } from "@/convex/lib/eventInfo";

/**
 * The detail after a history event's name, in the words of `labels`. An event
 * that carries a code (lib/eventInfo.ts) is written in the user's language;
 * an older one only has the free text it was written with, which is shown as is.
 */
export function eventDetailText(
  entry: { detail: string | null; info?: EventInfo | null },
  labels: SubmissionsLabels,
): string | null {
  return entry.info ? labels.review.eventDetail(entry.info) : entry.detail;
}

/**
 * Why Vink split an email, for the alert on its Submissions: from the code when
 * there is one, else the English text older Submissions were written with.
 */
export function splitReasonText(
  submission: { split?: SplitInfo | null; splitReason?: string | null },
  labels: SubmissionsLabels,
): string | null {
  return submission.split ? labels.review.split.reason(submission.split) : (submission.splitReason ?? null);
}
