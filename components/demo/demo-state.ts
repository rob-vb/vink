import type { FieldValueData, Value } from "@/components/documents/field-row-view";
import type { EmailData } from "@/components/documents/email-pane-view";
import type { DocumentEvent, DocumentState, ReviewReason } from "@/components/documents/labels";
import type { ListData } from "@/components/documents/list-group-view";
import type { EventInfo } from "@/convex/lib/eventInfo";
import { DEMO_USER, inLocale, seedDocuments, type SeedField } from "./demo-data";
import { demoPages, type DemoDocumentId, type DemoPdfId, type DemoPhotoId } from "./demo-papers";

/*
 * The demo's Documents and what the visitor did to them. The rules follow the
 * app's backend (convex/review.ts, convex/lib/reviewState.ts): a flagged value
 * stops needing review once it is checked or corrected, Undo brings back what
 * was read, and Approval needs nothing left to review.
 */

export type Locale = "en" | "nl";

export type DemoFieldValue = FieldValueData & { extracted: Value; reasons: ReviewReason[] };

export type DemoList = ListData<DemoFieldValue> & { reasons: ReviewReason[]; page: number };

export type DemoEvent = {
  event: DocumentEvent;
  detail: string | null;
  info?: EventInfo | null;
  by: string;
  at: number;
};

/** A drawn photo and its alt text. */
export type DemoPhoto = { id: DemoPhotoId; alt: string };

/** What an email attachment shows: a drawn photo, or a PDF's drawn pages. */
export type DemoAttachment = { photo: DemoPhoto } | { pdf: DemoPdfId };

export type DemoDocument = {
  id: DemoDocumentId;
  filename: string;
  /** Picks the pane: the PDF pane, the email pane or the image pane. */
  kind: "pdf" | "email" | "image";
  /** An email Document's email; what its attachments show is `attachmentViews`, in order. */
  email: EmailData | null;
  attachmentViews: DemoAttachment[];
  /** A photo Document's picture. */
  photo: DemoPhoto | null;
  /** The history's "Form picked" detail, when Vink picked the Form. */
  routed: EventInfo | null;
  /** The history's "No Form fits" detail, for a Document in No Form. */
  noFormInfo: EventInfo | null;
  formName: string;
  uploadedBy: string;
  minutesAgo: number;
  state: DocumentState;
  pageCount: number;
  approval: { mode: "auto" | "manual"; by: string | null; at: number | null } | null;
  fieldValues: DemoFieldValue[];
  lists: DemoList[];
  /** What the visitor did, in order. Uploaded and Extracted come from `minutesAgo`. */
  events: DemoEvent[];
};

function fieldValue(
  id: string,
  seed: Pick<SeedField, "key" | "type" | "page" | "confidence" | "lowestSignal" | "reasons" | "required" | "options"> & {
    value: Value;
    readText: string | null;
  },
  label: string,
): DemoFieldValue {
  const reasons = seed.reasons ?? [];
  return {
    id,
    key: seed.key,
    label,
    type: seed.type,
    required: seed.required ?? false,
    options: seed.options ?? null,
    value: seed.value,
    extracted: seed.value,
    readText: seed.readText,
    pages: [seed.page],
    confidence: seed.confidence,
    lowestSignal: seed.lowestSignal,
    reasons,
    reviewReasons: reasons,
    needsReview: reasons.length > 0,
    review: null,
  };
}

export function initialDocuments(locale: Locale): DemoDocument[] {
  return seedDocuments.map((seed) => ({
    id: seed.id,
    filename: seed.filename,
    formName: seed.form[locale],
    uploadedBy: seed.uploadedBy[locale],
    minutesAgo: seed.minutesAgo,
    kind: seed.kind ?? "pdf",
    email: seed.email
      ? {
          subject: seed.filename,
          from: seed.email.from,
          date: seed.email.date,
          body: seed.email.body[locale],
          attachments: seed.email.attachments.map((a) =>
            "pdf" in a
              ? { filename: a.filename, mimeType: a.mimeType, pageCount: demoPages[a.pdf].length }
              : { filename: a.filename, mimeType: a.mimeType },
          ),
        }
      : null,
    attachmentViews: (seed.email?.attachments ?? []).map((a) =>
      "pdf" in a ? { pdf: a.pdf } : { photo: { id: a.photo, alt: a.alt[locale] } },
    ),
    photo:
      seed.kind === "image" && seed.photoAlt
        ? { id: seed.id as DemoPhotoId, alt: seed.photoAlt[locale] }
        : null,
    routed:
      seed.routed === undefined
        ? null
        : { code: "routed", form: seed.form[locale], percent: Math.round(seed.routed * 100) },
    noFormInfo: seed.noForm ? { code: "no_fit", form: seed.noForm[locale] } : null,
    state: seed.noForm ? "no_form" : seed.autoSent ? "approved" : "needs_review",
    // Like the app: an email or a photo is one page; its attachments are pages of the email, not of the Document.
    pageCount: (seed.kind ?? "pdf") === "pdf" ? demoPages[seed.id as DemoPdfId].length : 1,
    approval: seed.autoSent ? { mode: "auto", by: null, at: null } : null,
    fieldValues: seed.fields.map((f) =>
      fieldValue(
        `${seed.id}.${f.key}`,
        { ...f, value: inLocale(f.value, locale), readText: inLocale(f.readText, locale) },
        f.label[locale],
      ),
    ),
    lists: (seed.lists ?? []).map((list) => ({
      key: list.key,
      label: list.label[locale],
      required: list.required,
      completeness: list.completeness,
      page: list.page,
      reasons: [],
      reviewReasons: [],
      needsReview: false,
      complete: null,
      entries: list.entries.map((entry, i) => ({
        entry: i,
        removed: false,
        added: false,
        fieldValues: list.subFields.map((sub) =>
          fieldValue(
            `${seed.id}.${list.key}[${i}].${sub.key}`,
            {
              key: sub.key,
              type: sub.type,
              value: entry[sub.key].value,
              readText: entry[sub.key].readText,
              page: list.page,
              confidence: entry[sub.key].confidence,
              lowestSignal: "match",
              reasons: entry[sub.key].reasons,
            },
            sub.label[locale],
          ),
        ),
      })),
    })),
    events: [],
  }));
}

/** Values in Needs Review, plus Lists whose completeness isn't confirmed. */
export function needsReviewCount(document: DemoDocument) {
  return (
    document.fieldValues.filter((f) => f.needsReview).length +
    document.lists.reduce(
      (n, list) =>
        n +
        (list.needsReview ? 1 : 0) +
        list.entries
          .filter((e) => !e.removed)
          .reduce((m, e) => m + e.fieldValues.filter((f) => f.needsReview).length, 0),
      0,
    )
  );
}

/** Every value Vink read across the demo, for the closing card. */
export function valuesRead(documents: DemoDocument[]) {
  return documents.reduce(
    (n, d) =>
      n +
      d.fieldValues.length +
      d.lists.reduce((m, l) => m + l.entries.filter((e) => !e.added).length * (l.entries[0]?.fieldValues.length ?? 0), 0),
    0,
  );
}

export type DemoAction =
  | { type: "correct"; documentId: DemoDocumentId; fieldValueId: string; value: Value; at: number }
  | { type: "check"; documentId: DemoDocumentId; fieldValueId: string; at: number }
  | { type: "undo"; documentId: DemoDocumentId; fieldValueId: string }
  | { type: "confirmEntries"; documentId: DemoDocumentId; listKey: string; at: number }
  | { type: "undoConfirmEntries"; documentId: DemoDocumentId; listKey: string; at: number }
  | { type: "removeEntry"; documentId: DemoDocumentId; listKey: string; entry: number; at: number }
  | { type: "restoreEntry"; documentId: DemoDocumentId; listKey: string; entry: number; at: number }
  | { type: "addEntry"; documentId: DemoDocumentId; listKey: string; at: number }
  | { type: "approve"; documentId: DemoDocumentId; at: number }
  | { type: "reset"; locale: Locale };

function mapFieldValues(
  document: DemoDocument,
  id: string,
  change: (f: DemoFieldValue) => DemoFieldValue,
): DemoDocument {
  const apply = (f: DemoFieldValue) => (f.id === id ? change(f) : f);
  return {
    ...document,
    fieldValues: document.fieldValues.map(apply),
    lists: document.lists.map((list) => ({
      ...list,
      entries: list.entries.map((e) => ({ ...e, fieldValues: e.fieldValues.map(apply) })),
    })),
  };
}

function findFieldValue(document: DemoDocument, id: string) {
  return (
    document.fieldValues.find((f) => f.id === id) ??
    document.lists.flatMap((l) => l.entries.flatMap((e) => e.fieldValues)).find((f) => f.id === id)
  );
}

function mapList(document: DemoDocument, key: string, change: (l: DemoList) => DemoList): DemoDocument {
  return { ...document, lists: document.lists.map((l) => (l.key === key ? change(l) : l)) };
}

function withListState(list: DemoList): DemoList {
  const live = list.entries.filter((e) => !e.removed).length;
  const reasons: ReviewReason[] = [...list.reasons];
  if (list.required && live === 0) reasons.push("required_empty");
  return {
    ...list,
    reviewReasons: reasons,
    needsReview: reasons.some((r) => r === "required_empty" || list.complete === null),
  };
}

function log(document: DemoDocument, event: DocumentEvent, at: number, detail: string | null = null) {
  return { ...document, events: [...document.events, { event, detail, by: DEMO_USER, at }] };
}

function reduceDocument(document: DemoDocument, action: Exclude<DemoAction, { type: "reset" }>): DemoDocument {
  // Like the app: once approved, nothing on a Document changes.
  if (document.state !== "needs_review") return document;
  const list = "listKey" in action ? document.lists.find((l) => l.key === action.listKey) : undefined;
  const listLabel = list?.label ?? null;
  switch (action.type) {
    case "correct": {
      const label = findFieldValue(document, action.fieldValueId)?.label ?? null;
      return log(
        mapFieldValues(document, action.fieldValueId, (f) => ({
          ...f,
          value: action.value,
          needsReview: false,
          review: { state: "corrected", by: DEMO_USER, at: action.at },
        })),
        "corrected",
        action.at,
        label,
      );
    }
    case "check":
      return mapFieldValues(document, action.fieldValueId, (f) => ({
        ...f,
        needsReview: false,
        review: { state: "checked", by: DEMO_USER, at: action.at },
      }));
    case "undo":
      return mapFieldValues(document, action.fieldValueId, (f) => ({
        ...f,
        value: f.extracted,
        needsReview: f.reasons.length > 0,
        review: null,
      }));
    case "confirmEntries":
      return log(
        mapList(document, action.listKey, (l) =>
          withListState({ ...l, complete: { by: DEMO_USER, at: action.at } }),
        ),
        "entries_confirmed",
        action.at,
        listLabel,
      );
    case "undoConfirmEntries":
      return log(
        mapList(document, action.listKey, (l) => withListState({ ...l, complete: null })),
        "entries_unconfirmed",
        action.at,
        listLabel,
      );
    case "removeEntry":
    case "restoreEntry":
      return log(
        mapList(document, action.listKey, (l) =>
          withListState({
            ...l,
            entries: l.entries.map((e) =>
              e.entry === action.entry ? { ...e, removed: action.type === "removeEntry" } : e,
            ),
          }),
        ),
        action.type === "removeEntry" ? "entry_removed" : "entry_restored",
        action.at,
        `${listLabel} #${action.entry + 1}`,
      );
    case "addEntry":
      return log(
        mapList(document, action.listKey, (l) => {
          const entry = l.entries.length;
          const template = l.entries[0]?.fieldValues ?? [];
          return withListState({
            ...l,
            entries: [
              ...l.entries,
              {
                entry,
                removed: false,
                added: true,
                fieldValues: template.map((f) => ({
                  ...f,
                  id: `${document.id}.${l.key}[${entry}].${f.key}`,
                  value: null,
                  extracted: null,
                  readText: null,
                  confidence: 1,
                  reasons: [],
                  reviewReasons: [],
                  needsReview: false,
                  review: null,
                })),
              },
            ],
          });
        }),
        "entry_added",
        action.at,
        `${listLabel} #${(list?.entries.length ?? 0) + 1}`,
      );
    case "approve":
      if (needsReviewCount(document) > 0) return document;
      return log(
        { ...document, state: "approved", approval: { mode: "manual", by: DEMO_USER, at: action.at } },
        "approved",
        action.at,
      );
  }
}

export function demoReducer(documents: DemoDocument[], action: DemoAction): DemoDocument[] {
  if (action.type === "reset") return initialDocuments(action.locale);
  return documents.map((d) => (d.id === action.documentId ? reduceDocument(d, action) : d));
}
