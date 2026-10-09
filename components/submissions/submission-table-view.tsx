"use client";

import { FileText, RotateCcw } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useSubmissionsLabels, type SubmissionState } from "./labels";

/** One row of the Submissions table, as `api.submissions.list` returns it. */
export type SubmissionRowData = {
  id: string;
  filename: string;
  pageCount: number;
  state: SubmissionState;
  formName: string;
  formVersion: number | null;
  uploadedBy: string;
  uploadedAt: number;
  rejection: { by: string; at: number; reason?: string | null } | null;
  approvalMode: "auto" | "manual" | null;
};

/**
 * The Submissions in one state, as plain data. Used by the app's Submissions and
 * Extracting pages (app/app/o/[slug]/submissions/submission-table.tsx) and by the
 * marketing demo (components/demo), so the demo's table is the app's table.
 *
 * A row opens its Submission through `href` (a link) or `onOpen` (the demo).
 */
export function SubmissionTableView({
  submissions,
  retryable,
  empty,
  href,
  onOpen,
  onRetry,
}: {
  /** Undefined while loading. */
  submissions: SubmissionRowData[] | undefined;
  /** Extraction Failed: the last column offers Retry instead of the upload time. */
  retryable?: boolean;
  empty: string;
  href?: (id: string) => string;
  onOpen?: (id: string) => void;
  onRetry?: (id: string) => void;
}) {
  const { labels, format } = useSubmissionsLabels();
  const t = labels.table;

  if (submissions === undefined) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
      </div>
    );
  }

  if (submissions.length === 0) {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileText />
          </EmptyMedia>
          <EmptyTitle>{t.noSubmissions}</EmptyTitle>
          <EmptyDescription>{empty}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const nameClass = "block max-w-full truncate font-medium hover:underline";

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t.submission}</TableHead>
            <TableHead className="hidden sm:table-cell">{t.form}</TableHead>
            <TableHead className="hidden text-right md:table-cell">{t.pages}</TableHead>
            <TableHead className="hidden md:table-cell">{t.uploadedBy}</TableHead>
            <TableHead className="text-right">
              {retryable ? <span className="sr-only">{t.retry}</span> : t.uploaded}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {submissions.map((submission) => (
            <TableRow key={submission.id}>
              <TableCell className="w-full max-w-0">
                {href ? (
                  <Link href={href(submission.id)} className={nameClass}>
                    {submission.filename}
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => onOpen?.(submission.id)}
                    className={`${nameClass} cursor-pointer text-left`}
                  >
                    {submission.filename}
                  </button>
                )}
                {submission.approvalMode === "auto" && (
                  <Badge variant="outline" className="mt-0.5">
                    {t.autoSend}
                  </Badge>
                )}
                <p className="truncate text-muted-foreground sm:hidden">
                  {submission.formName}
                </p>
                {submission.rejection && (
                  <p className="truncate text-xs text-muted-foreground">
                    {submission.state === "deleted" ? t.deleted : ""}
                    {t.rejectedBy} {submission.rejection.by}, {format.date(submission.rejection.at)}
                    {submission.rejection.reason && <>: {submission.rejection.reason}</>}
                  </p>
                )}
              </TableCell>
              <TableCell className="hidden sm:table-cell">
                {submission.formName || <span className="text-muted-foreground">–</span>}
                {submission.formVersion !== null && (
                  <span className="text-muted-foreground"> v{submission.formVersion}</span>
                )}
              </TableCell>
              <TableCell className="hidden text-right tabular-nums md:table-cell">
                {submission.pageCount}
              </TableCell>
              <TableCell className="hidden md:table-cell">{submission.uploadedBy}</TableCell>
              <TableCell className="text-right whitespace-nowrap text-muted-foreground">
                {retryable ? (
                  <Button size="sm" variant="outline" onClick={() => onRetry?.(submission.id)}>
                    <RotateCcw />
                    {t.retry}
                  </Button>
                ) : (
                  format.dateTime(submission.uploadedAt)
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
