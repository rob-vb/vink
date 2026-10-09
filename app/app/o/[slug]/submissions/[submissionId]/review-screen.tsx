"use client";

import { useMutation, useQuery } from "convex/react";
import { Ban, CircleAlert, RotateCcw, ShieldAlert, TriangleAlert } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ResendButton } from "@/components/deliveries/delivery-log";
import {
  ApprovalAlert,
  ApproveBar,
  DeliveriesSection,
  FieldsToolbar,
  HistorySection,
  NoFormAlert,
  NothingLeftToReview,
  ReviewColumns,
  SplitAlert,
  ReviewHeader,
  type ReviewFilter,
} from "@/components/submissions/review-view";
import { ImagePaneView } from "@/components/submissions/image-pane-view";
import { splitReasonText } from "@/components/submissions/event-detail";
import { useSubmissionsLabels } from "@/components/submissions/labels";
import { paneFor } from "@/components/submissions/review-panes";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useErrorText } from "../../../../error-text";
import { FieldRow } from "./field-row";
import { ListGroup } from "./list-group";
import { ChangeFormButton } from "./change-form";
import { DeleteButton, RejectButton, ReopenButton } from "./rejection-actions";

// pdf.js needs the browser.
const PdfPane = dynamic(() => import("./pdf-pane"), {
  ssr: false,
  loading: () => <Skeleton className="h-full min-h-96 w-full" />,
});

// The email pane loads the stored email and draws its attachments in the PDF or image pane.
const EmailPane = dynamic(() => import("./email-pane"), {
  ssr: false,
  loading: () => <Skeleton className="h-full min-h-96 w-full" />,
});

/**
 * The review screen (review-screen prototype, variant A): the source (PDF,
 * email or photo, by the Submission's kind) on the left and the Form's Fields on
 * the right, stacked on mobile. Updates live.
 *
 * Its parts live in components/submissions so the marketing demo (components/demo)
 * renders the same screen with demo data; the PDF pane is mirrored there by
 * components/demo/demo-pdf-pane.tsx, the email and photo panes are shared
 * (email-pane-view.tsx, image-pane-view.tsx). Update both.
 */
export function ReviewScreen({
  organisationSlug,
  submissionId,
  isAdmin,
}: {
  organisationSlug: string;
  submissionId: Id<"submissions">;
  isAdmin: boolean;
}) {
  const t = useTranslations("appSubmissions");
  const errorText = useErrorText();
  const { format, labels } = useSubmissionsLabels();
  const router = useRouter();
  const submission = useQuery(api.submissions.get, { organisationSlug, submissionId });
  const pdfUrl = useMutation(api.submissions.pdfUrl);
  const attachmentUrlOf = useMutation(api.submissions.attachmentUrl);
  const approve = useMutation(api.review.approve);
  const retry = useMutation(api.extraction.retry);
  const [url, setUrl] = useState<string | null>(null);
  const [urlFailed, setUrlFailed] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const [approving, setApproving] = useState(false);

  const dataDeleted = submission?.dataDeleted;
  useEffect(() => {
    if (dataDeleted !== false) return;
    pdfUrl({ organisationSlug, submissionId }).then(setUrl, () => setUrlFailed(true));
  }, [pdfUrl, organisationSlug, submissionId, dataDeleted]);

  const attachmentUrl = useCallback(
    (index: number) => attachmentUrlOf({ organisationSlug, submissionId, index }),
    [attachmentUrlOf, organisationSlug, submissionId],
  );

  if (submission === undefined) {
    return (
      <main className="grid flex-1 gap-4 p-4 md:grid-cols-2 md:p-6">
        <Skeleton className="h-96" />
        <Skeleton className="h-96" />
      </main>
    );
  }

  const threshold = submission.reviewThreshold ?? 0.8;
  const reviewing = submission.state === "needs_review";
  const noForm = submission.state === "no_form";
  const splitReason = splitReasonText(submission, labels);
  const pane = paneFor(submission.kind);
  // The selected value's read text, to mark in an email body when it was read there (page 1).
  const selectedValue = [
    ...submission.fieldValues,
    ...submission.lists.flatMap((l) => l.entries.flatMap((e) => e.fieldValues)),
  ].find((f) => f.id === selected);
  const highlight = selectedValue?.pages.includes(1) ? selectedValue.readText : null;
  // Delete now; a Rejected Submission has it in its Rejected notice.
  const deletable =
    isAdmin && !submission.dataDeleted && submission.state !== "rejected" && submission.state !== "deleted";
  const left = submission.needsReviewCount;
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
  const select = (id: string, pages: number[]) => {
    setSelected(id);
    if (pages.length > 0) setPage(pages[0]);
  };

  async function approveThen(next: boolean) {
    setApproving(true);
    try {
      const { nextSubmissionId } = await approve({ organisationSlug, submissionId });
      toast.success(t("review.approvedToast", { filename: submission!.filename }));
      if (next && nextSubmissionId) {
        router.push(`/app/o/${organisationSlug}/submissions/${nextSubmissionId}`);
      } else if (next) {
        toast.info(t("review.nothingElse"));
        router.push(`/app/o/${organisationSlug}`);
      }
    } catch (error) {
      toast.error(errorText(error, t("review.approvalFailed")));
    } finally {
      setApproving(false);
    }
  }

  return (
    <main className="flex w-full flex-1 flex-col gap-4 px-4 py-4 md:px-6">
      <ReviewHeader
        filename={submission.filename}
        state={submission.state}
        formName={submission.formName}
        formVersion={submission.formVersion}
        pageCount={submission.pageCount}
        kind={pane}
        reviewThreshold={submission.reviewThreshold === null ? null : threshold}
        backHref={`/app/o/${organisationSlug}`}
        badges={
          !submission.jevVerified &&
          (reviewing || submission.state === "approved") && (
            <Tooltip>
              <TooltipTrigger render={<Badge variant="outline" className="cursor-help" />}>
                <ShieldAlert />
                {t("review.notVerified")}
              </TooltipTrigger>
              <TooltipContent>{t("review.notVerifiedTip")}</TooltipContent>
            </Tooltip>
          )
        }
        actions={
          (reviewing || noForm || submission.state === "extraction_failed" || deletable) && (
            <>
              {(reviewing || noForm || submission.state === "extraction_failed") && (
                <>
                  <ChangeFormButton
                    organisationSlug={organisationSlug}
                    submissionId={submissionId}
                    currentFormId={submission.formId}
                  />
                  <RejectButton
                    organisationSlug={organisationSlug}
                    submissionId={submissionId}
                    filename={submission.filename}
                  />
                </>
              )}
              {deletable && (
                <DeleteButton
                  organisationSlug={organisationSlug}
                  submissionId={submissionId}
                  filename={submission.filename}
                  variant="outline"
                />
              )}
            </>
          )
        }
      />

      {splitReason && <SplitAlert reason={splitReason} />}

      {noForm && <NoFormAlert />}

      {reviewing && submission.doesNotFit && (
        <Alert className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <TriangleAlert />
          <AlertTitle>{t("review.doesNotFit")}</AlertTitle>
          <AlertDescription className="text-amber-900/80 dark:text-amber-200/80">
            <p>{t("review.doesNotFitText", { form: submission.formName })}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <ChangeFormButton
                organisationSlug={organisationSlug}
                submissionId={submissionId}
                currentFormId={submission.formId}
                size="sm"
              />
              <RejectButton
                organisationSlug={organisationSlug}
                submissionId={submissionId}
                filename={submission.filename}
                size="sm"
              />
            </div>
          </AlertDescription>
        </Alert>
      )}

      {submission.rejection && (
        <Alert>
          <Ban />
          <AlertTitle>
            {submission.state === "deleted" ? t("review.rejectedAndDeleted") : t("review.rejected")}
          </AlertTitle>
          <AlertDescription>
            <p>
              {t("review.rejectedBy", {
                name: submission.rejection.by,
                date: format.dateTime(submission.rejection.at),
              })}
              {submission.rejection.reason ? <>: &ldquo;{submission.rejection.reason}&rdquo;</> : "."}
            </p>
            {submission.state === "deleted" ? (
              <p>{t("review.gone")}</p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {!submission.dataDeleted && (
                  <ReopenButton organisationSlug={organisationSlug} submissionId={submissionId} />
                )}
                {isAdmin && !submission.dataDeleted && (
                  <DeleteButton
                    organisationSlug={organisationSlug}
                    submissionId={submissionId}
                    filename={submission.filename}
                  />
                )}
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

      {submission.state === "extraction_failed" && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>{t("review.failedTitle")}</AlertTitle>
          <AlertDescription>
            <p>{t(submission.failure === "unreadable" ? "review.failedUnreadable" : "review.failedText")}</p>
            <Button
              size="sm"
              className="mt-2"
              onClick={() =>
                retry({ organisationSlug, submissionId }).catch((error) =>
                  toast.error(errorText(error, t("retryFailed"))),
                )
              }
            >
              <RotateCcw />
              {t("review.retry")}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {submission.dataDeletedAt !== null && !submission.rejection && (
        <Alert>
          <CircleAlert />
          <AlertTitle>{t("review.dataDeleted")}</AlertTitle>
          <AlertDescription>
            {submission.dataDeletedBy
              ? t("review.dataDeletedBy", {
                  date: format.dateTime(submission.dataDeletedAt),
                  name: submission.dataDeletedBy,
                })
              : t("review.dataDeletedRetention", { date: format.dateTime(submission.dataDeletedAt) })}
          </AlertDescription>
        </Alert>
      )}

      {submission.approval && <ApprovalAlert approval={submission.approval} />}

      <ReviewColumns
        pdf={
          <div className="h-[55vh] lg:sticky lg:top-4 lg:h-[calc(100vh-7rem)]">
            {submission.dataDeleted ? (
              <div className="flex h-full items-center justify-center rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                {t("review.pdfDeleted")}
              </div>
            ) : url ? (
              pane === "email" ? (
                <EmailPane
                  url={url}
                  page={page}
                  onPageChange={setPage}
                  highlight={highlight}
                  attachmentUrl={attachmentUrl}
                />
              ) : pane === "image" ? (
                <ImagePaneView
                  url={url}
                  filename={submission.filename}
                  mimeType={submission.mimeType}
                  className="h-full"
                />
              ) : (
                <PdfPane url={url} pageCount={submission.pageCount} page={page} onPageChange={setPage} />
              )
            ) : urlFailed ? (
              <div className="flex h-full items-center justify-center rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                {t("review.pdfFailed")}
              </div>
            ) : (
              <Skeleton className="h-full" />
            )}
          </div>
        }
      >
        <FieldsToolbar filter={filter} onFilterChange={setFilter} left={left} />

        <div className="relative overflow-hidden rounded-lg border bg-card">
          {submission.state === "extracting" && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-background/80 p-6 text-center backdrop-blur-[1px]">
              <Spinner />
              <p className="text-sm font-medium">{t("review.reading")}</p>
              <p className="text-xs text-muted-foreground">{t("review.readingText")}</p>
            </div>
          )}
          {submission.state === "extracting" && submission.fieldValues.length === 0 ? (
            <div className="grid gap-3 p-4" aria-hidden>
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : noForm ? (
            <p className="p-6 text-center text-sm text-muted-foreground">{labels.review.noForm.empty}</p>
          ) : rows.length === 0 && lists.length === 0 ? (
            <NothingLeftToReview />
          ) : (
            rows.map((fieldValue) => (
              <FieldRow
                key={fieldValue.id}
                organisationSlug={organisationSlug}
                fieldValue={fieldValue}
                threshold={threshold}
                disabled={!reviewing}
                selected={selected === fieldValue.id}
                onSelect={() => select(fieldValue.id, fieldValue.pages)}
              />
            ))
          )}
        </div>

        {lists.map((list) => (
          <ListGroup
            key={list.key}
            organisationSlug={organisationSlug}
            submissionId={submissionId}
            list={list}
            threshold={threshold}
            disabled={!reviewing}
            filter={filter}
            selected={selected}
            onSelect={select}
          />
        ))}

        {reviewing && <ApproveBar left={left} approving={approving} onApprove={approveThen} />}

        {submission.deliveries.length > 0 && (
          <DeliveriesSection
            deliveries={submission.deliveries}
            actions={(delivery) =>
              isAdmin && <ResendButton organisationSlug={organisationSlug} delivery={delivery} />
            }
          />
        )}

        <HistorySection history={submission.history} />
      </ReviewColumns>
    </main>
  );
}
