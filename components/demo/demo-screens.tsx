"use client";

import { LoaderCircle, Mail, Upload } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useSyncExternalStore, type ReactNode } from "react";
import { DocumentTableView, type DocumentRowData } from "@/components/documents/document-table-view";
import { DocumentStateTabs, DocumentsHeading } from "@/components/documents/document-tabs";
import { FieldRowView, type Value } from "@/components/documents/field-row-view";
import {
  DocumentsLabelsProvider,
  documentsFormats,
  englishLabels,
  type ListedState,
} from "@/components/documents/labels";
import { ListGroupView } from "@/components/documents/list-group-view";
import {
  ApprovalAlert,
  ApproveBar,
  DeliveriesSection,
  FieldsToolbar,
  HistorySection,
  NothingLeftToReview,
  ReviewColumns,
  ReviewHeader,
  type ReviewFilter,
} from "@/components/documents/review-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DEMO_FORM_VERSION, DEMO_THRESHOLD } from "./demo-data";
import { DemoPdfPane } from "./demo-pdf-pane";
import { needsReviewCount, type DemoDocument, type Locale } from "./demo-state";
import { dutchLabels } from "./nl-labels";

/*
 * The demo's two screens, built from the app's own parts in
 * components/documents. Only the PDF pane and the top bar are copies.
 */

// A fixed moment for the static render; the browser swaps in its own "now"
// after hydration, so upload times read as a few minutes ago.
const STATIC_NOW = Date.UTC(2026, 8, 30, 6, 30);
let clientNow: number | undefined;
const subscribe = () => () => {};
const getNow = () => (clientNow ??= Date.now());
const getStaticNow = () => STATIC_NOW;

export function useDemoNow() {
  return useSyncExternalStore(subscribe, getNow, getStaticNow);
}

/** The app's words in the page's language, and one locale and time zone for server and browser. */
export function DemoLabels({ children }: { children: ReactNode }) {
  const locale = useLocale() as Locale;
  const format = useMemo(
    () => documentsFormats(locale === "nl" ? "nl-NL" : "en-GB", "Europe/Amsterdam"),
    [locale],
  );
  return (
    <DocumentsLabelsProvider labels={locale === "nl" ? dutchLabels : englishLabels} format={format}>
      {children}
    </DocumentsLabelsProvider>
  );
}

const uploadedAt = (document: DemoDocument, now: number) => now - document.minutesAgo * 60_000;
// Most documents are read in under a minute.
const READ_SECONDS = 38;

function approvalOf(document: DemoDocument, now: number) {
  if (!document.approval) return null;
  return {
    mode: document.approval.mode,
    by: document.approval.by,
    at: document.approval.at ?? uploadedAt(document, now) + (READ_SECONDS + 1) * 1000,
  };
}

export function rowOf(document: DemoDocument, now: number): DocumentRowData {
  return {
    id: document.id,
    filename: document.filename,
    pageCount: document.pageCount,
    state: document.state,
    formName: document.formName,
    formVersion: DEMO_FORM_VERSION,
    uploadedBy: document.uploadedBy,
    uploadedAt: uploadedAt(document, now),
    rejection: null,
    approvalMode: document.approval?.mode ?? null,
  };
}

/** The Documents page: heading with its controls, the four tabs and the table. */
export function DemoDocumentsScreen({
  documents,
  tab,
  onTabChange,
  onOpen,
  onAccountOnly,
}: {
  documents: DemoDocument[];
  tab: ListedState;
  onTabChange: (tab: ListedState) => void;
  onOpen: (id: string) => void;
  /** Upload, Email in and Extracting: they need an account. */
  onAccountOnly: (what: "upload" | "extracting") => void;
}) {
  const t = useTranslations("demo");
  const now = useDemoNow();
  const locale = useLocale() as Locale;
  const labels = locale === "nl" ? dutchLabels : englishLabels;
  const counts = {
    needs_review: documents.filter((d) => d.state === "needs_review").length,
    approved: documents.filter((d) => d.state === "approved").length,
    extraction_failed: 0,
    rejected: 0,
  };
  const rows = documents.filter((d) => d.state === tab).map((d) => rowOf(d, now));

  return (
    <div className="px-4 py-8 md:px-6">
      <DocumentsHeading
        actions={
          <>
            <p className="text-sm text-muted-foreground tabular-nums">{t("heading.pagesLeft")}</p>
            <Button variant="outline" onClick={() => onAccountOnly("extracting")}>
              <LoaderCircle className="text-muted-foreground" />
              {t("heading.extracting")}
              <Badge variant="secondary" className="tabular-nums">
                0
              </Badge>
            </Button>
            <Button variant="outline" onClick={() => onAccountOnly("upload")}>
              <Mail />
              {t("heading.emailIn")}
            </Button>
            <Button onClick={() => onAccountOnly("upload")}>
              <Upload />
              {t("heading.upload")}
            </Button>
          </>
        }
      />
      <DocumentStateTabs value={tab} onValueChange={onTabChange} counts={counts} />
      <div className="mt-4">
        <DocumentTableView
          documents={rows}
          retryable={tab === "extraction_failed"}
          empty={labels.documents.empty[tab]}
          onOpen={onOpen}
        />
      </div>
    </div>
  );
}

export type ReviewHandlers = {
  onBack: () => void;
  onPageChange: (page: number) => void;
  onSelect: (id: string, pages: number[]) => void;
  onFilterChange: (filter: ReviewFilter) => void;
  onCorrect: (fieldValueId: string, value: Value) => void;
  onCheck: (fieldValueId: string) => void;
  onUndo: (fieldValueId: string) => void;
  onConfirmEntries: (listKey: string) => void;
  onUndoConfirmEntries: (listKey: string) => void;
  onRemoveEntry: (listKey: string, entry: number) => void;
  onRestoreEntry: (listKey: string, entry: number) => void;
  onAddEntry: (listKey: string) => void;
  onApprove: (next: boolean) => void;
};

/** The review screen, composed like app/app/o/[slug]/documents/[documentId]/review-screen.tsx. */
export function DemoReviewScreen({
  document,
  page,
  selected,
  filter,
  handlers,
  paneClassName = "h-[440px] sm:h-[560px] lg:sticky lg:top-20 lg:h-[680px]",
  approveBar = true,
}: {
  document: DemoDocument;
  page: number;
  selected: string | null;
  filter: ReviewFilter;
  handlers: ReviewHandlers;
  paneClassName?: string;
  /** Pictures leave out the sticky bar, which would float over the cropped Fields. */
  approveBar?: boolean;
}) {
  const t = useTranslations("demo");
  const now = useDemoNow();
  const reviewing = document.state === "needs_review";
  const left = needsReviewCount(document);
  const approval = approvalOf(document, now);
  const rows =
    filter === "all"
      ? document.fieldValues
      : document.fieldValues.filter((f) => f.needsReview || f.id === selected);
  const lists =
    filter === "all"
      ? document.lists
      : document.lists.filter(
          (l) =>
            l.needsReview ||
            l.entries.some((e) => !e.removed && e.fieldValues.some((f) => f.needsReview || f.id === selected)),
        );
  const start = uploadedAt(document, now);
  const history = [
    { event: "uploaded" as const, detail: null, by: document.uploadedBy, at: start },
    { event: "extracted" as const, detail: null, by: "Vink", at: start + READ_SECONDS * 1000 },
    ...(document.approval?.mode === "auto" && approval
      ? [{ event: "approved" as const, detail: null, by: "Vink", at: approval.at }]
      : []),
    ...document.events,
  ];
  const deliveries = approval
    ? [
        {
          id: `${document.id}-delivery`,
          deliveryId: `dlv_demo_${document.id}`,
          state: "delivered" as const,
          failureReason: null,
          nextAttemptAt: null,
          canResend: false,
          attempts: [{ at: approval.at + 1200, status: 200, body: null, error: null }],
          integrationName: t("delivery.integration"),
        },
      ]
    : [];
  const field = (fieldValue: (typeof rows)[number], manual = false) => (
    <FieldRowView
      key={fieldValue.id}
      fieldValue={fieldValue}
      threshold={DEMO_THRESHOLD}
      disabled={!reviewing}
      manual={manual}
      selected={selected === fieldValue.id}
      onSelect={() => handlers.onSelect(fieldValue.id, fieldValue.pages)}
      onCorrect={(value) => handlers.onCorrect(fieldValue.id, value)}
      onCheck={() => handlers.onCheck(fieldValue.id)}
      onUndo={() => handlers.onUndo(fieldValue.id)}
    />
  );

  return (
    <div className="flex w-full flex-col gap-4 px-4 py-4 md:px-6">
      <ReviewHeader
        filename={document.filename}
        state={document.state}
        formName={document.formName}
        formVersion={DEMO_FORM_VERSION}
        pageCount={document.pageCount}
        reviewThreshold={DEMO_THRESHOLD}
        onBack={handlers.onBack}
      />

      {approval && <ApprovalAlert approval={approval} />}

      <ReviewColumns
        pdf={
          <div className={paneClassName}>
            <DemoPdfPane
              documentId={document.id}
              page={page}
              onPageChange={handlers.onPageChange}
              labels={{
                previous: t("pane.previous"),
                next: t("pane.next"),
                zoomIn: t("pane.zoomIn"),
                zoomOut: t("pane.zoomOut"),
              }}
            />
          </div>
        }
      >
        <FieldsToolbar filter={filter} onFilterChange={handlers.onFilterChange} left={left} />

        <div className="relative overflow-hidden rounded-lg border bg-card">
          {rows.length === 0 && lists.length === 0 ? (
            <NothingLeftToReview />
          ) : (
            rows.map((fieldValue) => field(fieldValue))
          )}
        </div>

        {lists.map((list) => (
          <ListGroupView
            key={list.key}
            list={list}
            threshold={DEMO_THRESHOLD}
            disabled={!reviewing}
            filter={filter}
            selected={selected}
            renderField={field}
            onConfirm={() => handlers.onConfirmEntries(list.key)}
            onUndoConfirm={() => handlers.onUndoConfirmEntries(list.key)}
            onRemove={(entry) => handlers.onRemoveEntry(list.key, entry)}
            onRestore={(entry) => handlers.onRestoreEntry(list.key, entry)}
            onAdd={() => handlers.onAddEntry(list.key)}
          />
        ))}

        {reviewing && approveBar && <ApproveBar left={left} approving={false} onApprove={handlers.onApprove} />}

        {deliveries.length > 0 && <DeliveriesSection deliveries={deliveries} />}

        <HistorySection history={history} />
      </ReviewColumns>
    </div>
  );
}
