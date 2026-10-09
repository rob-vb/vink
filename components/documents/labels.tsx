"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { EventInfo, SplitInfo } from "@/convex/lib/eventInfo";

/**
 * The words and date formats of the Documents page and review screen.
 *
 * These components are shared by the app (fed by Convex) and the marketing
 * site's interactive demo (fed by static data). Both set a provider with the
 * words of their language; the app keeps the browser's own time zone.
 */

export type DocumentState =
  | "extracting"
  | "needs_review"
  | "approved"
  | "extraction_failed"
  | "no_form"
  | "rejected"
  | "deleted";
export type ListedState = "needs_review" | "no_form" | "approved" | "extraction_failed" | "rejected";
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
  | "routed"
  | "no_form"
  | "mail_split"
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

const SPLIT_ANSWERS = {
  together: "one case",
  cover_note: "separate papers with the text only a cover note",
  apart: "separate papers",
};

function splitReason(split: SplitInfo): string {
  return `Vink was not sure whether this email is one case or ${split.documents} separate papers (${split.percent}% sure of "${SPLIT_ANSWERS[split.answer]}"), so it made ${split.documents} Documents. Check whether they belong together.`;
}

export const englishLabels = {
  documents: {
    title: "Documents",
    subtitle: "Status updates arrive here as soon as they happen.",
    tabs: {
      needs_review: "Needs Review",
      no_form: "No Form",
      approved: "Approved",
      extraction_failed: "Failed",
      rejected: "Rejected",
    } satisfies Record<ListedState, string>,
    empty: {
      needs_review: "Nothing is waiting for review.",
      no_form: "Every Document found its Form.",
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
      no_form: "No Form",
      rejected: "Rejected",
      deleted: "Deleted",
    } satisfies Record<DocumentState, string>,
    pageCount: (n: number): string => (n === 1 ? "page" : "pages"),
    /** The size line of an email or a photo, where a PDF has its page count. */
    kinds: { email: "email", image: "photo" },
    reviewThreshold: "Review Threshold",
    approved: "Approved",
    approvedBy: (mode: "auto" | "manual", by: string | null) =>
      mode === "auto" ? "Automatically" : `By ${by}`,
    noForm: {
      title: "No Form fits this Document",
      text: "Vink found no Form that fits it, so there is nothing to review yet. Use Change Form above to pick a Form to fill, or Reject to turn it away. Its Items are counted.",
      empty: "No Fields yet. They appear when the Document has a Form.",
    },
    split: {
      title: "Vink split this email",
      // The specific reason already says what Vink was unsure of; the general sentence is only a fallback.
      text: (reason: string) =>
        reason.trim() ||
        "Vink wasn't sure whether the parts of this email belong together, so it made separate Documents. Please check them.",
      /** Why, from Jev's call: the words of an email split Vink was unsure about. */
      reason: (split: SplitInfo): string => splitReason(split),
    },
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
      routed: "Form picked",
      no_form: "No Form fits",
      mail_split: "Email split",
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
    /** The detail after an event's name, for the events that carry a code (lib/eventInfo.ts). */
    eventDetail: (info: EventInfo): string => {
      switch (info.code) {
        case "routed":
          return `${info.form} (${info.percent}%)`;
        case "no_forms":
          return "The Organisation has no Forms";
        case "nothing_read":
          return "Nothing could be read";
        case "no_fit":
          return info.form === undefined ? "Jev picked none of the Forms" : `Does not fit ${info.form}`;
        case "form_changed":
          return `${info.from ?? "No Form"} → ${info.to}`;
        case "mail_split":
          return splitReason(info.split);
      }
    },
  },
  panes: {
    email: {
      from: "From",
      subject: "Subject",
      date: "Date",
      noSubject: "(no subject)",
      body: "Email",
      attachments: (n: number) => `Attachments (${n})`,
      attachment: (name: string, pages: number | null) =>
        pages === null ? name : `${name}, ${pages} ${pages === 1 ? "page" : "pages"}`,
      noBody: "This email has no text.",
      sourceFound: "The text this value was read from is marked.",
      failed: "The email couldn't be loaded.",
      attachmentFailed: "The attachment couldn't be loaded.",
      switcher: "Email and attachments",
    },
    image: {
      zoomIn: "Zoom in",
      zoomOut: "Zoom out",
      fit: "Fit to width",
      zoomHint: "Zoom with the buttons, Ctrl and the mouse wheel, a pinch, or + and −.",
      failed: "The photo couldn't be shown here.",
      heicTitle: "This browser can't show HEIC photos",
      heicText: "Vink reads the photo anyway. Download it to look at it yourself.",
      download: "Download the photo",
      alt: (name: string) => `The photo ${name}`,
      zoom: "Zoomable photo",
    },
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

type Heading = "h1" | "h2";

const Context = createContext<{ labels: DocumentsLabels; format: DocumentsFormats; heading: Heading }>({
  labels: englishLabels,
  format: appFormats,
  heading: "h1",
});

/**
 * The words and date formats for one language. The demo also fixes the time
 * zone so the static render matches, and uses `h2` page headings inside a
 * marketing page that has its own `h1`.
 */
export function DocumentsLabelsProvider({
  labels,
  format,
  heading = "h1",
  children,
}: {
  labels: DocumentsLabels;
  format: DocumentsFormats;
  heading?: Heading;
  children: ReactNode;
}) {
  return <Context value={{ labels, format, heading }}>{children}</Context>;
}

export function useDocumentsLabels() {
  return useContext(Context);
}
