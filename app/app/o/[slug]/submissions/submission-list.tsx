"use client";

import { useMutation, useQuery } from "convex/react";
import { FileStack, LoaderCircle, Unplug } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { SubmissionStateTabs, SubmissionsHeading } from "@/components/submissions/submission-tabs";
import { useSubmissionsLabels, type ListedState } from "@/components/submissions/labels";
import { api } from "@/convex/_generated/api";
import { cn } from "cn";
import { ItemsLeft, ItemsWarning } from "../items-usage";
import { SubmissionTable } from "./submission-table";
import { EmailInDialog } from "./email-in-dialog";
import { SetupGuide } from "./setup-guide";
import { UploadDialog } from "./upload-dialog";

// The heading, tabs and table are shared with the marketing demo
// (components/submissions, used by components/demo): a change here shows up there.
export function SubmissionList({
  organisationSlug,
  organisationName,
  isAdmin,
}: {
  organisationSlug: string;
  organisationName: string;
  isAdmin: boolean;
}) {
  const t = useTranslations("appSubmissions.list");
  const { labels } = useSubmissionsLabels();
  const [state, setState] = useState<ListedState>("needs_review");
  const forms = useQuery(api.forms.list, { organisationSlug });
  const list = useQuery(api.submissions.list, { organisationSlug, state });
  const setup = useQuery(api.onboarding.state, { organisationSlug });
  const start = useMutation(api.onboarding.start);
  const needsStart = setup?.needsStart === true;
  useEffect(() => {
    // An Organisation from before the setup, with no Form yet: track it from now on.
    if (needsStart) start({ organisationSlug }).catch(() => {});
  }, [needsStart, start, organisationSlug]);

  if (forms === undefined || setup === undefined) {
    return (
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 md:px-6">
        <Skeleton className="mb-6 h-10 w-48" />
        <Skeleton className="h-40" />
      </main>
    );
  }

  if (setup.setup && setup.step !== null) {
    return (
      <SetupGuide
        organisationSlug={organisationSlug}
        organisationName={organisationName}
        step={setup.step}
        forms={forms}
      />
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
      <SubmissionsHeading
        actions={
          <>
            <ItemsLeft organisationSlug={organisationSlug} />
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={`/app/o/${organisationSlug}/submissions/extracting`} />}
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

      {setup.systemNotice && (
        <Alert role="status" className="mb-6">
          <Unplug />
          <AlertTitle>{t("noSystem.title")}</AlertTitle>
          <AlertDescription>{t("noSystem.description")}</AlertDescription>
          <AlertAction>
            <Button
              size="sm"
              nativeButton={false}
              render={<Link href={`/app/o/${organisationSlug}/integrations`} />}
            >
              {t("noSystem.action")}
            </Button>
          </AlertAction>
        </Alert>
      )}

      <SubmissionStateTabs value={state} onValueChange={setState} counts={list?.counts} />

      <div className="mt-4">
        <SubmissionTable
          organisationSlug={organisationSlug}
          submissions={list?.submissions}
          retryable={state === "extraction_failed"}
          empty={labels.submissions.empty[state]}
        />
      </div>
    </main>
  );
}
