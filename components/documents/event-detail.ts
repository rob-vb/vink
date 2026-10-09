import type { DocumentsLabels } from "@/components/documents/labels";
import type { EventInfo, SplitInfo } from "@/convex/lib/eventInfo";

/**
 * The detail after a history event's name, in the words of `labels`. An event
 * that carries a code (lib/eventInfo.ts) is written in the user's language;
 * an older one only has the free text it was written with, which is shown as is.
 */
export function eventDetailText(
  entry: { detail: string | null; info?: EventInfo | null },
  labels: DocumentsLabels,
): string | null {
  return entry.info ? labels.review.eventDetail(entry.info) : entry.detail;
}

/**
 * Why Vink split an email, for the alert on its Documents: from the code when
 * there is one, else the English text older Documents were written with.
 */
export function splitReasonText(
  document: { split?: SplitInfo | null; splitReason?: string | null },
  labels: DocumentsLabels,
): string | null {
  return document.split ? labels.review.split.reason(document.split) : (document.splitReason ?? null);
}
