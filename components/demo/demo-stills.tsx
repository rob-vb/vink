"use client";

import { useLocale } from "next-intl";
import { useState } from "react";
import type { ListedState } from "@/components/documents/labels";
import type { ReviewFilter } from "@/components/documents/review-view";
import type { DemoDocumentId } from "./demo-papers";
import { DemoDocumentsScreen, DemoLabels, DemoReviewScreen, type ReviewHandlers } from "./demo-screens";
import { demoReducer, initialDocuments, type DemoAction, type Locale } from "./demo-state";

/*
 * The demo's screens frozen in one state, for the Features page's pictures.
 * The same app parts as the demo, so the pictures follow the app too.
 */

const nothing = () => {};
const inert: ReviewHandlers = {
  onBack: nothing,
  onPageChange: nothing,
  onSelect: nothing,
  onFilterChange: nothing,
  onCorrect: nothing,
  onCheck: nothing,
  onUndo: nothing,
  onConfirmEntries: nothing,
  onUndoConfirmEntries: nothing,
  onRemoveEntry: nothing,
  onRestoreEntry: nothing,
  onAddEntry: nothing,
  onApprove: nothing,
};

// A fixed moment, so the pictures render the same on the server and in the browser.
const AT = Date.UTC(2026, 8, 30, 6, 20);

function useDocuments(steps: DemoAction[]) {
  const locale = useLocale() as Locale;
  const [documents] = useState(() => steps.reduce(demoReducer, initialDocuments(locale)));
  return documents;
}

/** One demo Document's review screen. */
export function ReviewStill({
  documentId,
  selected = null,
  filter = "all",
}: {
  documentId: DemoDocumentId;
  selected?: string | null;
  filter?: ReviewFilter;
}) {
  const documents = useDocuments([]);
  const found = documents.find((d) => d.id === documentId)!;
  // Own ids, so the picture's inputs never share an id with the live demo's.
  const own = (id: string) => `still-${id}`;
  const document = {
    ...found,
    fieldValues: found.fieldValues.map((f) => ({ ...f, id: own(f.id) })),
    lists: found.lists.map((l) => ({
      ...l,
      entries: l.entries.map((e) => ({ ...e, fieldValues: e.fieldValues.map((f) => ({ ...f, id: own(f.id) })) })),
    })),
  };
  selected = selected === null ? null : own(selected);
  const page = document.fieldValues.find((f) => f.id === selected)?.pages[0] ?? 1;
  return (
    <DemoLabels>
      <DemoReviewScreen
        document={document}
        page={page}
        selected={selected}
        filter={filter}
        handlers={inert}
        // Below lg the app stacks the page above the Fields; the picture keeps to the Fields there.
        paneClassName="hidden lg:block lg:h-[600px]"
        approveBar={false}
      />
    </DemoLabels>
  );
}

/** The Documents page on one tab; the invoice already approved by hand next to the Auto-Send receipt. */
export function DocumentsStill({ tab }: { tab: ListedState }) {
  const documents = useDocuments([
    { type: "check", documentId: "invoice", fieldValueId: "invoice.vat_amount", at: AT },
    { type: "approve", documentId: "invoice", at: AT },
  ]);
  return (
    <DemoLabels>
      <DemoDocumentsScreen
        documents={documents}
        tab={tab}
        onTabChange={nothing}
        onOpen={nothing}
        onAccountOnly={nothing}
      />
    </DemoLabels>
  );
}
