"use client";

import { ArrowRightLeft, Ban, LoaderCircle, Mail, Upload } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useSyncExternalStore, type ReactNode } from "react";
import { SubmissionTableView, type SubmissionRowData } from "@/components/submissions/submission-table-view";
import { SubmissionStateTabs, SubmissionsHeading } from "@/components/submissions/submission-tabs";
import { EmailPaneView } from "@/components/submissions/email-pane-view";
import { FieldRowView, type Value } from "@/components/submissions/field-row-view";
import { ImagePaneView } from "@/components/submissions/image-pane-view";
import {
  SubmissionsLabelsProvider,
  submissionsFormats,
  englishLabels,
  type ListedState,
} from "@/components/submissions/labels";
import { ListGroupView } from "@/components/submissions/list-group-view";
import {
  ApprovalAlert,
  ApproveBar,
  DeliveriesSection,
  FieldsToolbar,
  HistorySection,
  NoFormAlert,
  NothingLeftToReview,
  ReviewColumns,
  ReviewHeader,
  type ReviewFilter,
} from "@/components/submissions/review-view";
import { paneFor } from "@/components/submissions/review-panes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DEMO_FORM_VERSION, DEMO_THRESHOLD } from "./demo-data";
import { demoPhotos, type DemoPdfId } from "./demo-papers";
import { DemoPdfPane } from "./demo-pdf-pane";
import { needsReviewCount, type DemoSubmission, type Locale } from "./demo-state";
import { dutchLabels } from "@/components/submissions/nl-labels";

/*
 * The demo's two screens, built from the app's own parts in
 * components/submissions. Only the PDF pane and the top bar are copies; the
 * email and photo panes are the app's own (components/submissions), with drawn
 * photos in place of files.
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
    () => submissionsFormats(locale === "nl" ? "nl-NL" : "en-GB", "Europe/Amsterdam"),
    [locale],
  );
  return (
    <SubmissionsLabelsProvider
      labels={locale === "nl" ? dutchLabels : englishLabels}
      format={format}
      heading="h2"
    >
      {children}
    </SubmissionsLabelsProvider>
  );
}

const uploadedAt = (submission: DemoSubmission, now: number) => now - submission.minutesAgo * 60_000;
// Most submissions are read in under a minute.
const READ_SECONDS = 38;

function approvalOf(submission: DemoSubmission, now: number) {
  if (!submission.approval) return null;
  return {
    mode: submission.approval.mode,
    by: submission.approval.by,
    at: submission.approval.at ?? uploadedAt(submission, now) + (READ_SECONDS + 1) * 1000,
  };
}

export function rowOf(submission: DemoSubmission, now: number): SubmissionRowData {
  return {
    id: submission.id,
    filename: submission.filename,
    pageCount: submission.pageCount,
    state: submission.state,
    formName: submission.formName,
    formVersion: submission.state === "no_form" ? null : DEMO_FORM_VERSION,
    uploadedBy: submission.uploadedBy,
    uploadedAt: uploadedAt(submission, now),
    rejection: null,
    approvalMode: submission.approval?.mode ?? null,
  };
}

/** The Submissions page: heading with its controls, the five tabs and the table. */
export function DemoSubmissionsScreen({
  submissions,
  tab,
  onTabChange,
  onOpen,
  onAccountOnly,
}: {
  submissions: DemoSubmission[];
  tab: ListedState;
  onTabChange: (tab: ListedState) => void;
  onOpen: (id: string) => void;
  /** Upload, Email in, Extracting, and No Form's Change Form and Reject: they need an account. */
  onAccountOnly: (what: "upload" | "extracting") => void;
}) {
  const t = useTranslations("demo");
  const now = useDemoNow();
  const locale = useLocale() as Locale;
  const labels = locale === "nl" ? dutchLabels : englishLabels;
  const counts = {
    needs_review: submissions.filter((d) => d.state === "needs_review").length,
    no_form: submissions.filter((d) => d.state === "no_form").length,
    approved: submissions.filter((d) => d.state === "approved").length,
    extraction_failed: 0,
    rejected: 0,
  };
  const rows = submissions.filter((d) => d.state === tab).map((d) => rowOf(d, now));

  return (
    <div className="px-4 py-8 md:px-6">
      <SubmissionsHeading
        actions={
          <>
            <p className="text-sm text-muted-foreground tabular-nums">{t("heading.itemsLeft")}</p>
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
      <SubmissionStateTabs value={tab} onValueChange={onTabChange} counts={counts} />
      <div className="mt-4">
        <SubmissionTableView
          submissions={rows}
          retryable={tab === "extraction_failed"}
          empty={labels.submissions.empty[tab]}
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
  /** Change Form and Reject on a Submission in No Form: they need an account. */
  onNoFormAction: () => void;
};

/** The review screen, composed like app/app/o/[slug]/submissions/[submissionId]/review-screen.tsx. */
export function DemoReviewScreen({
  submission,
  page,
  selected,
  filter,
  handlers,
  paneClassName = "h-[440px] sm:h-[560px] lg:sticky lg:top-20 lg:h-[680px]",
  approveBar = true,
}: {
  submission: DemoSubmission;
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
  const locale = useLocale() as Locale;
  const labelsOf = locale === "nl" ? dutchLabels : englishLabels;
  const reviewing = submission.state === "needs_review";
  const left = needsReviewCount(submission);
  const approval = approvalOf(submission, now);
  const rows =
    filter === "all"
      ? submission.fieldValues
      : submission.fieldValues.filter((f) => f.needsReview || f.id === selected);
  const lists =
    filter === "all"
      ? submission.lists
      : submission.lists.filter(
          (l) =>
            l.needsReview ||
            l.entries.some((e) => !e.removed && e.fieldValues.some((f) => f.needsReview || f.id === selected)),
        );
  const start = uploadedAt(submission, now);
  const history = [
    { event: "uploaded" as const, detail: null, by: submission.uploadedBy, at: start },
    ...(submission.routed === null
      ? []
      : [{ event: "routed" as const, detail: null, info: submission.routed, by: "Vink", at: start + (READ_SECONDS - 6) * 1000 }]),
    submission.noFormInfo === null
      ? { event: "extracted" as const, detail: null, by: "Vink", at: start + READ_SECONDS * 1000 }
      : { event: "no_form" as const, detail: null, info: submission.noFormInfo, by: "Vink", at: start + READ_SECONDS * 1000 },
    ...(submission.approval?.mode === "auto" && approval
      ? [{ event: "approved" as const, detail: null, by: "Vink", at: approval.at }]
      : []),
    ...submission.events,
  ];
  const deliveries = approval
    ? [
        {
          id: `${submission.id}-delivery`,
          deliveryId: `dlv_demo_${submission.id}`,
          state: "delivered" as const,
          failureReason: null,
          nextAttemptAt: null,
          canResend: false,
          attempts: [{ at: approval.at + 1200, status: 200, body: null, error: null }],
          integrationName: t("delivery.integration"),
        },
      ]
    : [];
  const noForm = submission.state === "no_form";
  const pane = paneFor(submission.kind);
  // The selected value's read text, marked in an email body when it was read there (page 1).
  const selectedValue = [...submission.fieldValues, ...submission.lists.flatMap((l) => l.entries.flatMap((e) => e.fieldValues))].find(
    (f) => f.id === selected,
  );
  const highlight = selectedValue?.pages.includes(1) ? selectedValue.readText : null;
  const paneLabels = {
    previous: t("pane.previous"),
    next: t("pane.next"),
    zoomIn: t("pane.zoomIn"),
    zoomOut: t("pane.zoomOut"),
  };
  const Photo = (photo: { id: keyof typeof demoPhotos; alt: string }) => {
    const Drawn = demoPhotos[photo.id];
    return <Drawn alt={photo.alt} />;
  };
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
        filename={submission.filename}
        state={submission.state}
        formName={submission.formName}
        formVersion={noForm ? null : DEMO_FORM_VERSION}
        pageCount={submission.pageCount}
        kind={pane}
        reviewThreshold={noForm ? null : DEMO_THRESHOLD}
        onBack={handlers.onBack}
        actions={
          noForm && (
            <>
              <Button variant="outline" onClick={handlers.onNoFormAction}>
                <ArrowRightLeft />
                {t("noForm.changeForm")}
              </Button>
              <Button variant="outline" onClick={handlers.onNoFormAction}>
                <Ban />
                {t("noForm.reject")}
              </Button>
            </>
          )
        }
      />

      {noForm && (
        <NoFormAlert />
      )}

      {approval && <ApprovalAlert approval={approval} />}

      <ReviewColumns
        pdf={
          <div className={paneClassName}>
            {pane === "email" && submission.email ? (
              <EmailPaneView
                email={submission.email}
                page={page}
                onPageChange={handlers.onPageChange}
                highlight={highlight}
                className="h-full"
                renderAttachment={(index, localPage, onLocalPage) => {
                  const attachment = submission.email!.attachments[index];
                  const view = submission.attachmentViews[index];
                  return "pdf" in view ? (
                    <DemoPdfPane
                      key={index}
                      submissionId={view.pdf}
                      page={localPage}
                      onPageChange={onLocalPage}
                      labels={paneLabels}
                    />
                  ) : (
                    <ImagePaneView key={index} filename={attachment.filename} mimeType={attachment.mimeType}>
                      {Photo(view.photo)}
                    </ImagePaneView>
                  );
                }}
              />
            ) : pane === "image" && submission.photo ? (
              <ImagePaneView filename={submission.filename} mimeType="image/jpeg" className="h-full">
                {Photo(submission.photo)}
              </ImagePaneView>
            ) : (
              <DemoPdfPane
                submissionId={submission.id as DemoPdfId}
                page={page}
                onPageChange={handlers.onPageChange}
                labels={paneLabels}
              />
            )}
          </div>
        }
      >
        <FieldsToolbar filter={filter} onFilterChange={handlers.onFilterChange} left={left} />

        <div className="relative overflow-hidden rounded-lg border bg-card">
          {noForm ? (
            <p className="p-6 text-center text-sm text-muted-foreground">{labelsOf.review.noForm.empty}</p>
          ) : rows.length === 0 && lists.length === 0 ? (
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
