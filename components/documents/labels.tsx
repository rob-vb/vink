"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * The words and date formats of the Documents page and review screen.
 *
 * These components are shared by the app (fed by Convex) and the marketing
 * site's interactive demo (fed by static data, in English or Dutch). The app
 * never sets a provider, so it always gets `englishLabels` and the browser's
 * own date formats, exactly as before.
 */

export type DocumentState =
  | "extracting"
  | "needs_review"
  | "approved"
  | "extraction_failed"
  | "rejected"
  | "deleted";
export type ListedState = "needs_review" | "approved" | "extraction_failed" | "rejected";
export type ReviewReason =
  | "below_threshold"
  | "required_empty"
  | "type_mismatch"
  | "unsure"
  | "conflicting";
export type Signal = "match" | "fit" | "support";
export type DeliveryState = "pending" | "retrying" | "delivered" | "failed";
export type DocumentEvent =
  | "uploaded"
  | "extracted"
  | "extraction_failed"
  | "extraction_retried"
  | "rejected"
  | "reopened"
  | "form_changed"
  | "data_deleted"
  | "deleted"
  | "corrected"
  | "entry_added"
  | "entry_removed"
  | "entry_restored"
  | "entries_confirmed"
  | "entries_unconfirmed"
  | "approved";

function pagesLabel(pages: number[]) {
  return pages.length === 1 ? `page ${pages[0]}` : `pages ${pages.join(", ")}`;
}

export const englishLabels = {
  documents: {
    title: "Documents",
    subtitle: "Status updates arrive here as soon as they happen.",
    tabs: {
      needs_review: "Needs Review",
      approved: "Approved",
      extraction_failed: "Failed",
      rejected: "Rejected",
    } satisfies Record<ListedState, string>,
    empty: {
      needs_review: "Nothing is waiting for review.",
      approved: "No Documents have been approved yet.",
      extraction_failed: "No Extractions have failed.",
      rejected: "No Documents have been rejected.",
    } satisfies Record<ListedState, string>,
  },
  table: {
    document: "Document",
    form: "Form",
    pages: "Pages",
    uploadedBy: "Uploaded by",
    uploaded: "Uploaded",
    retry: "Retry",
    autoSend: "Auto-Send",
    noDocuments: "No Documents",
    deleted: "Deleted · ",
    rejectedBy: "Rejected by",
  },
  review: {
    back: "Documents",
    states: {
      extracting: "Extracting",
      needs_review: "Needs Review",
      approved: "Approved",
      extraction_failed: "Extraction Failed",
      rejected: "Rejected",
      deleted: "Deleted",
    } satisfies Record<DocumentState, string>,
    pageCount: (n: number): string => (n === 1 ? "page" : "pages"),
    reviewThreshold: "Review Threshold",
    approved: "Approved",
    approvedBy: (mode: "auto" | "manual", by: string | null) =>
      mode === "auto" ? "Automatically" : `By ${by}`,
    fields: "Fields",
    allFields: "All fields",
    needsReviewOnly: "Needs Review only",
    nothingLeft: "Nothing left to review.",
    everythingChecked: "Everything is checked.",
    valuesNeedReview: (n: number) =>
      `${n} ${n === 1 ? "value needs" : "values need"} review before Approval.`,
    approveAndNext: "Approve and next",
    approveLeft: (n: number) => `Approve (${n} left)`,
    approveAndSend: "Approve and send",
    deliveries: "Deliveries",
    history: "History",
    events: {
      uploaded: "Uploaded",
      extracted: "Extracted",
      extraction_failed: "Extraction failed",
      extraction_retried: "Extraction started again",
      rejected: "Rejected",
      reopened: "Reopened",
      form_changed: "Form changed",
      data_deleted: "Data deleted",
      deleted: "Deleted",
      corrected: "Corrected",
      entry_added: "Entry added",
      entry_removed: "Entry removed",
      entry_restored: "Entry restored",
      entries_confirmed: "Entries confirmed complete",
      entries_unconfirmed: "Entries no longer confirmed",
      approved: "Approved",
    } satisfies Record<DocumentEvent, string>,
  },
  field: {
    reasons: {
      below_threshold: "Below threshold",
      required_empty: "Required but empty",
      type_mismatch: "Doesn't fit the type",
      unsure: "Read as unsure",
      conflicting: "Conflicting readings",
    } satisfies Record<ReviewReason, string>,
    signals: { match: "Match", fit: "Jev fit", support: "Jev support" } satisfies Record<Signal, string>,
    lowestSignal: "lowest signal",
    readOn: (pages: number[]) => `Read on ${pagesLabel(pages)}`,
    notFound: "Not found on the Document",
    filledByHand: "Filled in by hand",
    noValue: "No value",
    yes: "Yes",
    no: "No",
    needsReview: "Needs Review",
    corrected: "Corrected",
    checked: "Checked",
    valueIsRight: "Value is right",
    undo: "Undo",
    confidence: (confidence: string, threshold: string) =>
      `Confidence ${confidence}, threshold ${threshold}`,
  },
  list: {
    reasons: {
      below_threshold: "Some entries may be missing or invented",
      required_empty: "Required, but there are no entries",
      type_mismatch: "Doesn't fit the type",
      unsure: "Read as unsure",
      conflicting: "Conflicting readings",
    } satisfies Record<ReviewReason, string>,
    entries: (n: number) => `${n} ${n === 1 ? "entry" : "entries"} · were all entries found?`,
    complete: "Complete",
    entriesComplete: "Entries are complete",
    undo: "Undo",
    entry: (n: number) => `Entry ${n}`,
    addedByHand: "Added by hand",
    restore: "Restore",
    remove: "Remove",
    removeEntry: (n: number) => `Remove entry ${n}`,
    addEntry: "Add entry",
  },
  delivery: {
    states: {
      pending: "Sending",
      retrying: "Retrying",
      delivered: "Delivered",
      failed: "Failed",
    } satisfies Record<DeliveryState, string>,
    nextTry: "Next try",
    noAttempt: "No attempt yet.",
  },
};

export type DocumentsLabels = typeof englishLabels;

type Format = (at: number) => string;

/** The app's date formats: the browser's own locale and time zone. */
function formats(locale?: string, timeZone?: string) {
  const make = (options: Intl.DateTimeFormatOptions): Format => {
    const format = new Intl.DateTimeFormat(locale, { ...options, timeZone });
    return (at) => format.format(at);
  };
  return {
    /** Uploaded, approved, history. */
    dateTime: make({ dateStyle: "medium", timeStyle: "short" }),
    /** A rejection in the Documents table. */
    date: make({ dateStyle: "medium" }),
    /** When a Field Value was reviewed. */
    short: make({ dateStyle: "short", timeStyle: "short" }),
    /** Delivery attempts. */
    precise: make({ dateStyle: "short", timeStyle: "medium" }),
  };
}

export type DocumentsFormats = ReturnType<typeof formats>;

export function documentsFormats(locale?: string, timeZone?: string): DocumentsFormats {
  return formats(locale, timeZone);
}

const appFormats = formats();

const Context = createContext<{ labels: DocumentsLabels; format: DocumentsFormats }>({
  labels: englishLabels,
  format: appFormats,
});

/** Used by the demo only: other words, and a fixed locale and time zone so the static render matches. */
export function DocumentsLabelsProvider({
  labels,
  format,
  children,
}: {
  labels: DocumentsLabels;
  format: DocumentsFormats;
  children: ReactNode;
}) {
  return <Context value={{ labels, format }}>{children}</Context>;
}

export function useDocumentsLabels() {
  return useContext(Context);
}
