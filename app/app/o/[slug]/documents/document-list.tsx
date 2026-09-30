"use client";

import { useQuery } from "convex/react";
import { FileStack, LoaderCircle } from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { DocumentStateTabs, DocumentsHeading } from "@/components/documents/document-tabs";
import { englishLabels, type ListedState } from "@/components/documents/labels";
import { api } from "@/convex/_generated/api";
import { cn } from "cn";
import { PagesLeft, PagesWarning } from "../pages-usage";
import { DocumentTable } from "./document-table";
import { EmailInDialog } from "./email-in-dialog";
import { UploadDialog } from "./upload-dialog";

// The heading, tabs and table are shared with the marketing demo
// (components/documents, used by components/demo): a change here shows up there.
export function DocumentList({
  organisationSlug,
  organisationName,
  isAdmin,
}: {
  organisationSlug: string;
  organisationName: string;
  isAdmin: boolean;
}) {
  const [state, setState] = useState<ListedState>("needs_review");
  const forms = useQuery(api.forms.list, { organisationSlug });
  const list = useQuery(api.documents.list, { organisationSlug, state });
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
                ? "Set up a Form for each kind of document you receive, and Vink will fill it from your PDFs."
                : "An Admin first sets up a Form for each kind of document you receive. Then you can upload PDFs here."}
            </EmptyDescription>
          </EmptyHeader>
          {isAdmin && (
            <EmptyContent>
              <Button
                nativeButton={false}
                render={<Link href={`/app/o/${organisationSlug}/forms`} />}
              >
                Go to Forms
              </Button>
            </EmptyContent>
          )}
        </Empty>
      </main>
    );
  }

  const extracting = list?.counts.extracting;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 md:px-6">
      <DocumentsHeading
        actions={
          <>
            <PagesLeft organisationSlug={organisationSlug} />
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={`/app/o/${organisationSlug}/documents/extracting`} />}
            >
              <LoaderCircle className={cn(extracting ? "animate-spin" : "text-muted-foreground")} />
              Extracting
              <Badge variant="secondary" className="tabular-nums">
                {extracting ?? "–"}
              </Badge>
            </Button>
            <EmailInDialog organisationSlug={organisationSlug} forms={forms} isAdmin={isAdmin} />
            <UploadDialog organisationSlug={organisationSlug} forms={forms} />
          </>
        }
      />

      {isAdmin && <PagesWarning organisationSlug={organisationSlug} />}

      <DocumentStateTabs value={state} onValueChange={setState} counts={list?.counts} />

      <div className="mt-4">
        <DocumentTable
          organisationSlug={organisationSlug}
          documents={list?.documents}
          retryable={state === "extraction_failed"}
          empty={englishLabels.documents.empty[state]}
        />
      </div>
    </main>
  );
}
