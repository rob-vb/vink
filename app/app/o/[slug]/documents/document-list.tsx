"use client";

import { useQuery } from "convex/react";
import { FileStack, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
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
import { useDocumentsLabels, type ListedState } from "@/components/documents/labels";
import { api } from "@/convex/_generated/api";
import { cn } from "cn";
import { ItemsLeft, ItemsWarning } from "../items-usage";
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
  const t = useTranslations("appDocuments.list");
  const { labels } = useDocumentsLabels();
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
            <EmptyTitle>{t("welcome", { organisation: organisationName })}</EmptyTitle>
            <EmptyDescription>{isAdmin ? t("adminIntro") : t("memberIntro")}</EmptyDescription>
          </EmptyHeader>
          {isAdmin && (
            <EmptyContent>
              <Button
                nativeButton={false}
                render={<Link href={`/app/o/${organisationSlug}/forms`} />}
              >
                {t("goToForms")}
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
            <ItemsLeft organisationSlug={organisationSlug} />
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={`/app/o/${organisationSlug}/documents/extracting`} />}
            >
              <LoaderCircle className={cn(extracting ? "animate-spin" : "text-muted-foreground")} />
              {t("extracting")}
              <Badge variant="secondary" className="tabular-nums">
                {extracting ?? "–"}
              </Badge>
            </Button>
            <EmailInDialog organisationSlug={organisationSlug} forms={forms} isAdmin={isAdmin} />
            <UploadDialog organisationSlug={organisationSlug} forms={forms} isAdmin={isAdmin} />
          </>
        }
      />

      {isAdmin && <ItemsWarning organisationSlug={organisationSlug} />}

      <DocumentStateTabs value={state} onValueChange={setState} counts={list?.counts} />

      <div className="mt-4">
        <DocumentTable
          organisationSlug={organisationSlug}
          documents={list?.documents}
          retryable={state === "extraction_failed"}
          empty={labels.documents.empty[state]}
        />
      </div>
    </main>
  );
}
