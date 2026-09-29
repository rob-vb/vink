"use client";

import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import {
  ArrowLeft,
  Ban,
  CircleAlert,
  CircleCheck,
  RotateCcw,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { DeliveryRow, ResendButton } from "@/components/deliveries/delivery-log";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { FieldRow } from "./field-row";
import { ListGroup } from "./list-group";
import { ChangeFormButton } from "./change-form";
import { DeleteButton, RejectButton, ReopenButton } from "./rejection-actions";

// pdf.js needs the browser.
const PdfPane = dynamic(() => import("./pdf-pane"), {
  ssr: false,
  loading: () => <Skeleton className="h-full min-h-96 w-full" />,
});

const stateLabels = {
  extracting: "Extracting",
  needs_review: "Needs Review",
  approved: "Approved",
  extraction_failed: "Extraction Failed",
  rejected: "Rejected",
  deleted: "Deleted",
} as const;

const eventLabels = {
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
} as const;

const when = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

/**
 * The review screen (review-screen prototype, variant A): the PDF on the left
 * and the Form's Fields on the right, stacked on mobile. Updates live.
 */
export function ReviewScreen({
  organisationSlug,
  documentId,
  isAdmin,
}: {
  organisationSlug: string;
  documentId: Id<"documents">;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const document = useQuery(api.documents.get, { organisationSlug, documentId });
  const pdfUrl = useMutation(api.documents.pdfUrl);
  const approve = useMutation(api.review.approve);
  const retry = useMutation(api.extraction.retry);
  const [url, setUrl] = useState<string | null>(null);
  const [urlFailed, setUrlFailed] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "needs_review">("all");
  const [approving, setApproving] = useState(false);

  const dataDeleted = document?.dataDeleted;
  useEffect(() => {
    if (dataDeleted !== false) return;
    pdfUrl({ organisationSlug, documentId }).then(setUrl, () => setUrlFailed(true));
  }, [pdfUrl, organisationSlug, documentId, dataDeleted]);

  if (document === undefined) {
    return (
      <main className="grid flex-1 gap-4 p-4 md:grid-cols-2 md:p-6">
        <Skeleton className="h-96" />
        <Skeleton className="h-96" />
      </main>
    );
  }

  const threshold = document.reviewThreshold ?? 0.8;
  const reviewing = document.state === "needs_review";
  const left = document.needsReviewCount;
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
  const select = (id: string, pages: number[]) => {
    setSelected(id);
    if (pages.length > 0) setPage(pages[0]);
  };

  async function approveThen(next: boolean) {
    setApproving(true);
    try {
      const { nextDocumentId } = await approve({ organisationSlug, documentId });
      toast.success(`${document!.filename} is approved.`);
      if (next && nextDocumentId) {
        router.push(`/o/${organisationSlug}/documents/${nextDocumentId}`);
      } else if (next) {
        toast.info("Nothing else needs review.");
        router.push(`/o/${organisationSlug}`);
      }
    } catch (error) {
      toast.error(error instanceof ConvexError ? String(error.data) : "Approval didn't work. Try again.");
    } finally {
      setApproving(false);
    }
  }

  return (
    <main className="flex w-full flex-1 flex-col gap-4 px-4 py-4 md:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2"
            nativeButton={false}
            render={<Link href={`/o/${organisationSlug}`} />}
          >
            <ArrowLeft />
            Documents
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-semibold">{document.filename}</h1>
            <Badge variant={reviewing ? "default" : "secondary"}>{stateLabels[document.state]}</Badge>
            {!document.jevVerified && (reviewing || document.state === "approved") && (
              <Tooltip>
                <TooltipTrigger render={<Badge variant="outline" className="cursor-help" />}>
                  <ShieldAlert />
                  Not verified by Jev
                </TooltipTrigger>
                <TooltipContent>
                  Jev couldn&apos;t verify this Document, so it is never approved automatically.
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {document.formName} v{document.formVersion} · {document.pageCount}{" "}
            {document.pageCount === 1 ? "page" : "pages"}
            {document.reviewThreshold !== null && <> · Review Threshold {threshold.toFixed(2)}</>}
          </p>
        </div>
        {(reviewing || document.state === "extraction_failed") && (
          <div className="flex flex-wrap gap-2">
            <ChangeFormButton
              organisationSlug={organisationSlug}
              documentId={documentId}
              currentFormId={document.formId}
            />
            <RejectButton
              organisationSlug={organisationSlug}
              documentId={documentId}
              filename={document.filename}
            />
          </div>
        )}
      </div>

      {reviewing && document.doesNotFit && (
        <Alert className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <TriangleAlert />
          <AlertTitle>Does not fit this Form</AlertTitle>
          <AlertDescription className="text-amber-900/80 dark:text-amber-200/80">
            <p>
              Too few of {document.formName}&apos;s required Fields were found on it. It may have
              been uploaded against the wrong Form, or not be a usable Document.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <ChangeFormButton
                organisationSlug={organisationSlug}
                documentId={documentId}
                currentFormId={document.formId}
                size="sm"
              />
              <RejectButton
                organisationSlug={organisationSlug}
                documentId={documentId}
                filename={document.filename}
                size="sm"
              />
            </div>
          </AlertDescription>
        </Alert>
      )}

      {document.rejection && (
        <Alert>
          <Ban />
          <AlertTitle>
            {document.state === "deleted" ? "Rejected and deleted" : "Rejected"}
          </AlertTitle>
          <AlertDescription>
            <p>
              By {document.rejection.by}, {when.format(document.rejection.at)}
              {document.rejection.reason ? <>: &ldquo;{document.rejection.reason}&rdquo;</> : "."}
            </p>
            {document.state === "deleted" ? (
              <p>Its PDF and data are gone; only this record and its history are kept.</p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {!document.dataDeleted && (
                  <ReopenButton organisationSlug={organisationSlug} documentId={documentId} />
                )}
                {isAdmin && (
                  <DeleteButton
                    organisationSlug={organisationSlug}
                    documentId={documentId}
                    filename={document.filename}
                  />
                )}
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

      {document.state === "extraction_failed" && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Vink couldn&apos;t read this Document</AlertTitle>
          <AlertDescription>
            <p>
              It tried four times. This is usually a passing outage, so try again. When a
              Reading was stored, the retry picks up from there and doesn&apos;t read the PDF
              again.
            </p>
            {document.extractionError && (
              <p className="line-clamp-2 font-mono text-xs break-all opacity-80">
                {document.extractionError}
              </p>
            )}
            <Button
              size="sm"
              className="mt-2"
              onClick={() =>
                retry({ organisationSlug, documentId }).catch((error) =>
                  toast.error(
                    error instanceof ConvexError ? String(error.data) : "The retry didn't start. Try again.",
                  ),
                )
              }
            >
              <RotateCcw />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {document.dataDeletedAt !== null && !document.rejection && (
        <Alert>
          <CircleAlert />
          <AlertTitle>Data deleted</AlertTitle>
          <AlertDescription>
            Its PDF, what Vink read and its values were deleted on{" "}
            {when.format(document.dataDeletedAt)} under the Organisation&apos;s retention. Only this
            record, its history and its Delivery log are kept.
          </AlertDescription>
        </Alert>
      )}

      {document.approval && (
        <Alert>
          <CircleCheck />
          <AlertTitle>Approved</AlertTitle>
          <AlertDescription>
            {document.approval.mode === "auto" ? "Automatically" : `By ${document.approval.by}`},{" "}
            {when.format(document.approval.at)}.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid flex-1 items-start gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div className="h-[55vh] lg:sticky lg:top-4 lg:h-[calc(100vh-7rem)]">
          {document.dataDeleted ? (
            <div className="flex h-full items-center justify-center rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              The PDF was deleted.
            </div>
          ) : url ? (
            <PdfPane url={url} pageCount={document.pageCount} page={page} onPageChange={setPage} />
          ) : urlFailed ? (
            <div className="flex h-full items-center justify-center rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              The PDF couldn&apos;t be loaded.
            </div>
          ) : (
            <Skeleton className="h-full" />
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-muted-foreground">Fields</h2>
            <ToggleGroup
              variant="outline"
              size="sm"
              value={[filter]}
              onValueChange={(value) => value[0] && setFilter(value[0] as typeof filter)}
            >
              <ToggleGroupItem value="all">All fields</ToggleGroupItem>
              <ToggleGroupItem value="needs_review">
                Needs Review only
                <Badge variant="secondary" className="tabular-nums">
                  {left}
                </Badge>
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="relative overflow-hidden rounded-lg border bg-card">
            {document.state === "extracting" && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-background/80 p-6 text-center backdrop-blur-[1px]">
                <Spinner />
                <p className="text-sm font-medium">Vink is reading this Document</p>
                <p className="text-xs text-muted-foreground">
                  This can take up to a minute. The Fields fill in here when it&apos;s done.
                </p>
              </div>
            )}
            {document.state === "extracting" && document.fieldValues.length === 0 ? (
              <div className="grid gap-3 p-4" aria-hidden>
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12" />
                ))}
              </div>
            ) : rows.length === 0 && lists.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                Nothing left to review.
              </p>
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
              documentId={documentId}
              list={list}
              threshold={threshold}
              disabled={!reviewing}
              filter={filter}
              selected={selected}
              onSelect={select}
            />
          ))}

          {reviewing && (
            <div className="sticky bottom-4 z-20 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background p-3 shadow-md">
              <p className="text-sm text-muted-foreground">
                {left === 0
                  ? "Everything is checked."
                  : `${left} ${left === 1 ? "value needs" : "values need"} review before Approval.`}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={left > 0 || approving}
                  onClick={() => approveThen(true)}
                >
                  Approve and next
                </Button>
                <Button disabled={left > 0 || approving} onClick={() => approveThen(false)}>
                  {left > 0 ? `Approve (${left} left)` : "Approve and send"}
                </Button>
              </div>
            </div>
          )}

          {document.deliveries.length > 0 && (
            <section aria-labelledby="deliveries" className="overflow-hidden rounded-lg border">
              <h2 id="deliveries" className="border-b px-4 py-3 text-sm font-medium">
                Deliveries
              </h2>
              {document.deliveries.map((delivery) => (
                <DeliveryRow
                  key={delivery.id}
                  delivery={delivery}
                  title={delivery.integrationName}
                  actions={
                    isAdmin && <ResendButton organisationSlug={organisationSlug} delivery={delivery} />
                  }
                />
              ))}
            </section>
          )}

          <section aria-labelledby="history" className="rounded-lg border p-4">
            <h2 id="history" className="mb-3 text-sm font-medium">
              History
            </h2>
            <ol className="grid gap-2 text-sm">
              {document.history.map((entry, i) => (
                <li key={i} className="flex flex-wrap justify-between gap-x-4">
                  <span>
                    {eventLabels[entry.event]}
                    {entry.detail && <span className="text-muted-foreground"> · {entry.detail}</span>}
                    <span className="text-muted-foreground"> · {entry.by}</span>
                  </span>
                  <time className="text-muted-foreground tabular-nums" dateTime={new Date(entry.at).toISOString()}>
                    {when.format(entry.at)}
                  </time>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </main>
  );
}
