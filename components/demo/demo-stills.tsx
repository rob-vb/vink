"use client";

import { useLocale } from "next-intl";
import { useState } from "react";
import type { ListedState } from "@/components/submissions/labels";
import type { ReviewFilter } from "@/components/submissions/review-view";
import type { DemoSubmissionId } from "./demo-papers";
import { DemoSubmissionsScreen, DemoLabels, DemoReviewScreen, type ReviewHandlers } from "./demo-screens";
import { demoReducer, initialSubmissions, type DemoAction, type Locale } from "./demo-state";

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
  onNoFormAction: nothing,
};

// A fixed moment, so the pictures render the same on the server and in the browser.
const AT = Date.UTC(2026, 8, 30, 6, 20);

function useSubmissions(steps: DemoAction[]) {
  const locale = useLocale() as Locale;
  const [submissions] = useState(() => steps.reduce(demoReducer, initialSubmissions(locale)));
  return submissions;
}

/** One demo Submission's review screen. */
export function ReviewStill({
  submissionId,
  selected = null,
  filter = "all",
}: {
  submissionId: DemoSubmissionId;
  selected?: string | null;
  filter?: ReviewFilter;
}) {
  const submissions = useSubmissions([]);
  const found = submissions.find((d) => d.id === submissionId)!;
  // Own ids, so the picture's inputs never share an id with the live demo's.
  const own = (id: string) => `still-${id}`;
  const submission = {
    ...found,
    fieldValues: found.fieldValues.map((f) => ({ ...f, id: own(f.id) })),
    lists: found.lists.map((l) => ({
      ...l,
      entries: l.entries.map((e) => ({ ...e, fieldValues: e.fieldValues.map((f) => ({ ...f, id: own(f.id) })) })),
    })),
  };
  selected = selected === null ? null : own(selected);
  const page = submission.fieldValues.find((f) => f.id === selected)?.pages[0] ?? 1;
  return (
    <DemoLabels>
      <DemoReviewScreen
        submission={submission}
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

/** The Submissions page on one tab; the invoice already approved by hand next to the Auto-Send receipt. */
export function SubmissionsStill({ tab }: { tab: ListedState }) {
  const submissions = useSubmissions([
    { type: "check", submissionId: "invoice", fieldValueId: "invoice.vat_amount", at: AT },
    { type: "approve", submissionId: "invoice", at: AT },
  ]);
  return (
    <DemoLabels>
      <DemoSubmissionsScreen
        submissions={submissions}
        tab={tab}
        onTabChange={nothing}
        onOpen={nothing}
        onAccountOnly={nothing}
      />
    </DemoLabels>
  );
}
