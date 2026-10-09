"use client";

import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { SubmissionTableView } from "@/components/submissions/submission-table-view";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useErrorText } from "../../../error-text";

type Listed = FunctionReturnType<typeof api.submissions.list>["submissions"];

/**
 * The Submissions in one state, as the Submissions and Extracting pages list them.
 * The table itself is `SubmissionTableView`, which the marketing demo renders
 * with demo data: a change there shows up in both.
 */
export function SubmissionTable({
  organisationSlug,
  submissions,
  retryable,
  empty,
}: {
  organisationSlug: string;
  /** Undefined while loading. */
  submissions: Listed | undefined;
  /** Extraction Failed: the last column offers Retry instead of the upload time. */
  retryable?: boolean;
  empty: string;
}) {
  const t = useTranslations("appSubmissions");
  const errorText = useErrorText();
  const retry = useMutation(api.extraction.retry);

  return (
    <SubmissionTableView
      submissions={submissions}
      retryable={retryable}
      empty={empty}
      href={(id) => `/app/o/${organisationSlug}/submissions/${id}`}
      onRetry={(id) =>
        retry({ organisationSlug, submissionId: id as Id<"submissions"> }).catch((error) =>
          toast.error(errorText(error, t("retryFailed"))),
        )
      }
    />
  );
}
