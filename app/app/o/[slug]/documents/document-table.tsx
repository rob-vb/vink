"use client";

import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import { toast } from "sonner";
import { DocumentTableView } from "@/components/documents/document-table-view";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

type Listed = FunctionReturnType<typeof api.documents.list>["documents"];

/**
 * The Documents in one state, as the Documents and Extracting pages list them.
 * The table itself is `DocumentTableView`, which the marketing demo renders
 * with demo data: a change there shows up in both.
 */
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

  return (
    <DocumentTableView
      documents={documents}
      retryable={retryable}
      empty={empty}
      href={(id) => `/app/o/${organisationSlug}/documents/${id}`}
      onRetry={(id) =>
        retry({ organisationSlug, documentId: id as Id<"documents"> }).catch((error) =>
          toast.error(
            error instanceof ConvexError ? String(error.data) : "The retry didn't start. Try again.",
          ),
        )
      }
    />
  );
}
