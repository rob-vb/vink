"use client";

import { useMutation, useQuery } from "convex/react";
import { FileStack, FileText } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { UploadDialog } from "./upload-dialog";

const tabs = [
  { state: "extracting", label: "Extracting", empty: "Nothing is being read right now." },
  { state: "needs_review", label: "Needs Review", empty: "Nothing is waiting for review." },
  { state: "approved", label: "Approved", empty: "No Documents have been approved yet." },
  { state: "extraction_failed", label: "Failed", empty: "No Extractions have failed." },
] as const;

type State = (typeof tabs)[number]["state"];

const uploadedAt = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export function DocumentList({
  organisationSlug,
  organisationName,
  isAdmin,
}: {
  organisationSlug: string;
  organisationName: string;
  isAdmin: boolean;
}) {
  const [state, setState] = useState<State>("extracting");
  const forms = useQuery(api.forms.list, { organisationSlug });
  const list = useQuery(api.documents.list, { organisationSlug, state });
  const pdfUrl = useMutation(api.documents.pdfUrl);

  async function openPdf(documentId: Id<"documents">) {
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

  if (forms === undefined) {
    return (
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 md:px-6">
        <Skeleton className="mb-6 h-10 w-48" />
        <Skeleton className="h-40" />
      </main>
    );
  }

  if (forms.length === 0) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <Empty className="max-w-xl border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileStack />
            </EmptyMedia>
            <EmptyTitle>Welcome to {organisationName}</EmptyTitle>
            <EmptyDescription>
              {isAdmin
                ? "Set up a Form for each kind of document you receive, and DocuHelper will fill it from your PDFs."
                : "An Admin first sets up a Form for each kind of document you receive. Then you can upload PDFs here."}
            </EmptyDescription>
          </EmptyHeader>
          {isAdmin && (
            <EmptyContent>
              <Button
                nativeButton={false}
                render={<Link href={`/o/${organisationSlug}/forms`} />}
              >
                Go to Forms
              </Button>
            </EmptyContent>
          )}
        </Empty>
      </main>
    );
  }

  const tab = tabs.find((t) => t.state === state)!;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 md:px-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Documents</h1>
          <p className="text-sm text-muted-foreground">
            Status updates arrive here as soon as they happen.
          </p>
        </div>
        <UploadDialog organisationSlug={organisationSlug} forms={forms} />
      </div>

      <Tabs value={state} onValueChange={(value) => setState(value as State)}>
        <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <TabsList variant="line">
            {tabs.map((t) => (
              <TabsTrigger key={t.state} value={t.state}>
                {t.label}
                <Badge variant="secondary" className="tabular-nums">
                  {list?.counts[t.state] ?? "–"}
                </Badge>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

      <div className="mt-4">
        {list === undefined ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : list.documents.length === 0 ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileText />
              </EmptyMedia>
              <EmptyTitle>No Documents</EmptyTitle>
              <EmptyDescription>{tab.empty}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document</TableHead>
                  <TableHead className="hidden sm:table-cell">Form</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Pages</TableHead>
                  <TableHead className="hidden md:table-cell">Uploaded by</TableHead>
                  <TableHead className="text-right">Uploaded</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.documents.map((document) => (
                  <TableRow key={document.id}>
                    <TableCell className="w-full max-w-0">
                      <button
                        type="button"
                        onClick={() => openPdf(document.id)}
                        className="block max-w-full truncate text-left font-medium hover:underline"
                      >
                        {document.filename}
                      </button>
                      <p className="truncate text-muted-foreground sm:hidden">
                        {document.formName}
                      </p>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {document.formName}{" "}
                      <span className="text-muted-foreground">v{document.formVersion}</span>
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">
                      {document.pageCount}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {document.uploadedBy}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap text-muted-foreground">
                      {uploadedAt.format(document.uploadedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </main>
  );
}
