"use client";

import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { FileStack, FileText, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { useState } from "react";
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
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
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
import { UploadDialog } from "./upload-dialog";

const tabs = [
  { state: "extracting", label: "Extracting", empty: "Nothing is being read right now." },
  { state: "needs_review", label: "Needs Review", empty: "Nothing is waiting for review." },
  { state: "approved", label: "Approved", empty: "No Documents have been approved yet." },
  { state: "extraction_failed", label: "Failed", empty: "No Extractions have failed." },
  { state: "rejected", label: "Rejected", empty: "No Documents have been rejected." },
] as const;

type State = (typeof tabs)[number]["state"];

const rejectedAt = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

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
  const [showRejected, setShowRejected] = useState(false);
  const forms = useQuery(api.forms.list, { organisationSlug });
  const list = useQuery(api.documents.list, { organisationSlug, state });
  const retry = useMutation(api.extraction.retry);
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
            {tabs.filter((t) => showRejected || t.state !== "rejected").map((t) => (
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
      <div className="mt-3 flex items-center gap-2">
        <Switch
          id="show-rejected"
          checked={showRejected}
          onCheckedChange={(checked) => {
            setShowRejected(checked);
            if (!checked && state === "rejected") setState("extracting");
          }}
        />
        <Label htmlFor="show-rejected" className="text-sm text-muted-foreground">
          Show rejected
        </Label>
      </div>

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
                  <TableHead className="text-right">
                    {state === "extraction_failed" ? <span className="sr-only">Retry</span> : "Uploaded"}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.documents.map((document) => (
                  <TableRow key={document.id}>
                    <TableCell className="w-full max-w-0">
                      <Link
                        href={`/o/${organisationSlug}/documents/${document.id}`}
                        className="block max-w-full truncate font-medium hover:underline"
                      >
                        {document.filename}
                      </Link>
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
                    <TableCell className="hidden md:table-cell">
                      {document.uploadedBy}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap text-muted-foreground">
                      {state === "extraction_failed" ? (
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
        )}
      </div>
    </main>
  );
}
