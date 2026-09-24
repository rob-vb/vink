"use client";

import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, ExternalLink } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const stateLabels = {
  extracting: "Extracting",
  needs_review: "Needs Review",
  approved: "Approved",
  extraction_failed: "Extraction Failed",
  rejected: "Rejected",
  deleted: "Deleted",
} as const;

function formatValue(value: string | number | boolean | null) {
  if (value === null) return <span className="text-muted-foreground">No value</span>;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function pagesLabel(pages: number[]) {
  return pages.length === 1 ? `page ${pages[0]}` : `pages ${pages.join(", ")}`;
}

/** A Document and its Field Values. Updates live while the Extraction runs. */
export function DocumentView({
  organisationSlug,
  documentId,
}: {
  organisationSlug: string;
  documentId: Id<"documents">;
}) {
  const document = useQuery(api.documents.get, { organisationSlug, documentId });
  const pdfUrl = useMutation(api.documents.pdfUrl);

  async function openPdf() {
    // Open the tab first, so the browser doesn't block it as a pop-up.
    const tab = window.open("", "_blank");
    try {
      const url = await pdfUrl({ organisationSlug, documentId });
      (tab ?? window).location.assign(url);
    } catch {
      tab?.close();
      toast.error("We couldn't open the PDF.");
    }
  }

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 md:px-6">
      <Button
        variant="ghost"
        size="sm"
        className="mb-4 -ml-2"
        nativeButton={false}
        render={<Link href={`/o/${organisationSlug}`} />}
      >
        <ArrowLeft />
        Documents
      </Button>

      {document === undefined ? (
        <>
          <Skeleton className="mb-6 h-10 w-64" />
          <Skeleton className="h-40" />
        </>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-semibold">{document.filename}</h1>
                <Badge variant={document.state === "needs_review" ? "default" : "secondary"}>
                  {stateLabels[document.state]}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {document.formName} v{document.formVersion} · {document.pageCount}{" "}
                {document.pageCount === 1 ? "page" : "pages"}
              </p>
            </div>
            <Button variant="outline" onClick={openPdf}>
              <ExternalLink />
              Open PDF
            </Button>
          </div>

          {document.state === "extracting" ? (
            <div className="flex items-center gap-3 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
              <Spinner />
              DocuHelper is reading this Document. Its Field Values appear here when it&apos;s
              done.
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Field</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead className="hidden md:table-cell">Read on the Document</TableHead>
                    <TableHead className="text-right">Match</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {document.fieldValues.map((fieldValue) => (
                    <TableRow key={fieldValue.key}>
                      <TableCell className="align-top">
                        <p className="font-medium">{fieldValue.label}</p>
                        <p className="font-mono text-xs text-muted-foreground">
                          {fieldValue.key}
                        </p>
                      </TableCell>
                      <TableCell className="align-top whitespace-normal">
                        {formatValue(fieldValue.value)}
                        {fieldValue.readText !== null && (
                          <p className="text-xs text-muted-foreground md:hidden">
                            Read on {pagesLabel(fieldValue.pages)}: {fieldValue.readText}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="hidden align-top whitespace-normal md:table-cell">
                        {fieldValue.readText === null ? (
                          <span className="text-muted-foreground">Not found</span>
                        ) : (
                          <>
                            <span className="text-muted-foreground">
                              Read on {pagesLabel(fieldValue.pages)}:
                            </span>{" "}
                            {fieldValue.readText}
                          </>
                        )}
                      </TableCell>
                      {/* A ranking score, never shown as a percentage. */}
                      <TableCell className="text-right align-top tabular-nums">
                        {fieldValue.matchProbability.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}
    </main>
  );
}
