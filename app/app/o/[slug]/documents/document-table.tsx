"use client";

import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import { FileText, RotateCcw } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
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
import { api } from "@/convex/_generated/api";

type Listed = FunctionReturnType<typeof api.documents.list>["documents"];

const rejectedAt = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

const uploadedAt = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

/** The Documents in one state, as the Documents and Extracting pages list them. */
export function DocumentTable({
  organisationSlug,
  documents,
  retryable,
  empty,
}: {
  organisationSlug: string;
  /** Undefined while loading. */
  documents: Listed | undefined;
  /** Extraction Failed: the last column offers Retry instead of the upload time. */
  retryable?: boolean;
  empty: string;
}) {
  const retry = useMutation(api.extraction.retry);

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
          <EmptyTitle>No Documents</EmptyTitle>
          <EmptyDescription>{empty}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Document</TableHead>
            <TableHead className="hidden sm:table-cell">Form</TableHead>
            <TableHead className="hidden text-right md:table-cell">Pages</TableHead>
            <TableHead className="hidden md:table-cell">Uploaded by</TableHead>
            <TableHead className="text-right">
              {retryable ? <span className="sr-only">Retry</span> : "Uploaded"}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {documents.map((document) => (
            <TableRow key={document.id}>
              <TableCell className="w-full max-w-0">
                <Link
                  href={`/app/o/${organisationSlug}/documents/${document.id}`}
                  className="block max-w-full truncate font-medium hover:underline"
                >
                  {document.filename}
                </Link>
                {document.approvalMode === "auto" && (
                  <Badge variant="outline" className="mt-0.5">
                    Auto-Send
                  </Badge>
                )}
                <p className="truncate text-muted-foreground sm:hidden">
                  {document.formName}
                </p>
                {document.rejection && (
                  <p className="truncate text-xs text-muted-foreground">
                    {document.state === "deleted" ? "Deleted · " : ""}Rejected by{" "}
                    {document.rejection.by}, {rejectedAt.format(document.rejection.at)}
                    {document.rejection.reason && <>: {document.rejection.reason}</>}
                  </p>
                )}
              </TableCell>
              <TableCell className="hidden sm:table-cell">
                {document.formName}{" "}
                <span className="text-muted-foreground">v{document.formVersion}</span>
              </TableCell>
              <TableCell className="hidden text-right tabular-nums md:table-cell">
                {document.pageCount}
              </TableCell>
              <TableCell className="hidden md:table-cell">{document.uploadedBy}</TableCell>
              <TableCell className="text-right whitespace-nowrap text-muted-foreground">
                {retryable ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      retry({ organisationSlug, documentId: document.id }).catch((error) =>
                        toast.error(
                          error instanceof ConvexError
                            ? String(error.data)
                            : "The retry didn't start. Try again.",
                        ),
                      )
                    }
                  >
                    <RotateCcw />
                    Retry
                  </Button>
                ) : (
                  uploadedAt.format(document.uploadedAt)
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
