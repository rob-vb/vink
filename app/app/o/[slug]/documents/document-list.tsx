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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/convex/_generated/api";
import { cn } from "cn";
import { DocumentTable } from "./document-table";
import { UploadDialog } from "./upload-dialog";

// Extracting has its own page: those Documents need nothing from anyone yet.
const tabs = [
  { state: "needs_review", label: "Needs Review", empty: "Nothing is waiting for review." },
  { state: "approved", label: "Approved", empty: "No Documents have been approved yet." },
  { state: "extraction_failed", label: "Failed", empty: "No Extractions have failed." },
  { state: "rejected", label: "Rejected", empty: "No Documents have been rejected." },
] as const;

type State = (typeof tabs)[number]["state"];

export function DocumentList({
  organisationSlug,
  organisationName,
  isAdmin,
}: {
  organisationSlug: string;
  organisationName: string;
  isAdmin: boolean;
}) {
  const [state, setState] = useState<State>("needs_review");
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

  const tab = tabs.find((t) => t.state === state)!;
  const extracting = list?.counts.extracting;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 md:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Documents</h1>
          <p className="text-sm text-muted-foreground">
            Status updates arrive here as soon as they happen.
          </p>
        </div>
        <div className="flex items-center gap-2">
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
          <UploadDialog organisationSlug={organisationSlug} forms={forms} />
        </div>
      </div>

      <Tabs value={state} onValueChange={(value) => setState(value as State)}>
        {/* Scrolls sideways on a narrow screen, without a visible scrollbar. The padding
            keeps the active tab's underline inside, so there is nothing to scroll down to. */}
        <div className="-mx-4 overflow-x-auto overflow-y-hidden px-4 pb-1 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden">
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
        <DocumentTable
          organisationSlug={organisationSlug}
          documents={list?.documents}
          retryable={state === "extraction_failed"}
          empty={tab.empty}
        />
      </div>
    </main>
  );
}
