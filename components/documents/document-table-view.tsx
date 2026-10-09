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
import { useDocumentsLabels, type DocumentState } from "./labels";

/** One row of the Documents table, as `api.documents.list` returns it. */
export type DocumentRowData = {
  id: string;
  filename: string;
  pageCount: number;
  state: DocumentState;
  formName: string;
  formVersion: number | null;
  uploadedBy: string;
  uploadedAt: number;
  rejection: { by: string; at: number; reason?: string | null } | null;
  approvalMode: "auto" | "manual" | null;
};

/**
 * The Documents in one state, as plain data. Used by the app's Documents and
 * Extracting pages (app/app/o/[slug]/documents/document-table.tsx) and by the
 * marketing demo (components/demo), so the demo's table is the app's table.
 *
 * A row opens its Document through `href` (a link) or `onOpen` (the demo).
 */
export function DocumentTableView({
  documents,
  retryable,
  empty,
  href,
  onOpen,
  onRetry,
}: {
  /** Undefined while loading. */
  documents: DocumentRowData[] | undefined;
  /** Extraction Failed: the last column offers Retry instead of the upload time. */
  retryable?: boolean;
  empty: string;
  href?: (id: string) => string;
  onOpen?: (id: string) => void;
  onRetry?: (id: string) => void;
}) {
  const { labels, format } = useDocumentsLabels();
  const t = labels.table;

  if (documents === undefined) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileText />
          </EmptyMedia>
          <EmptyTitle>{t.noDocuments}</EmptyTitle>
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
            <TableHead>{t.document}</TableHead>
            <TableHead className="hidden sm:table-cell">{t.form}</TableHead>
            <TableHead className="hidden text-right md:table-cell">{t.pages}</TableHead>
            <TableHead className="hidden md:table-cell">{t.uploadedBy}</TableHead>
            <TableHead className="text-right">
              {retryable ? <span className="sr-only">{t.retry}</span> : t.uploaded}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {documents.map((document) => (
            <TableRow key={document.id}>
              <TableCell className="w-full max-w-0">
                {href ? (
                  <Link href={href(document.id)} className={nameClass}>
                    {document.filename}
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => onOpen?.(document.id)}
                    className={`${nameClass} cursor-pointer text-left`}
                  >
                    {document.filename}
                  </button>
                )}
                {document.approvalMode === "auto" && (
                  <Badge variant="outline" className="mt-0.5">
                    {t.autoSend}
                  </Badge>
                )}
                <p className="truncate text-muted-foreground sm:hidden">
                  {document.formName}
                </p>
                {document.rejection && (
                  <p className="truncate text-xs text-muted-foreground">
                    {document.state === "deleted" ? t.deleted : ""}
                    {t.rejectedBy} {document.rejection.by}, {format.date(document.rejection.at)}
                    {document.rejection.reason && <>: {document.rejection.reason}</>}
                  </p>
                )}
              </TableCell>
              <TableCell className="hidden sm:table-cell">
                {document.formName || <span className="text-muted-foreground">–</span>}
                {document.formVersion !== null && (
                  <span className="text-muted-foreground"> v{document.formVersion}</span>
                )}
              </TableCell>
              <TableCell className="hidden text-right tabular-nums md:table-cell">
                {document.pageCount}
              </TableCell>
              <TableCell className="hidden md:table-cell">{document.uploadedBy}</TableCell>
              <TableCell className="text-right whitespace-nowrap text-muted-foreground">
                {retryable ? (
                  <Button size="sm" variant="outline" onClick={() => onRetry?.(document.id)}>
                    <RotateCcw />
                    {t.retry}
                  </Button>
                ) : (
                  format.dateTime(document.uploadedAt)
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
