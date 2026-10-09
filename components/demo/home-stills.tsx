"use client";

import { useLocale } from "next-intl";
import { useState } from "react";
import { FieldRowView } from "@/components/submissions/field-row-view";
import { useSubmissionsLabels } from "@/components/submissions/labels";
import { ListGroupView } from "@/components/submissions/list-group-view";
import { ScaledStill } from "@/components/features/scaled-still";
import { DEMO_THRESHOLD } from "./demo-data";
import { demoPages, type DemoSubmissionId, type DemoPdfId } from "./demo-papers";
import { DemoLabels } from "./demo-screens";
import { demoReducer, initialSubmissions, type DemoAction, type DemoSubmission, type Locale } from "./demo-state";

/*
 * Home's pictures of the review screen's Fields: the demo's Submissions drawn
 * with the app's own rows (components/submissions), in the page's language.
 * Pictures only: nothing inside can be clicked or typed in.
 */

const nothing = () => {};

function useDemoSubmission(submissionId: DemoSubmissionId, steps: DemoAction[] = []) {
  const locale = useLocale() as Locale;
  const [submissions] = useState(() => steps.reduce(demoReducer, initialSubmissions(locale)));
  return submissions.find((d) => d.id === submissionId)!;
}

/** A Submission's Field rows, as on the review screen. */
function Fields({
  submission,
  keys,
  prefix,
  lists = false,
}: {
  submission: DemoSubmission;
  /** Only these Fields, in this order; all Fields when left out. */
  keys?: string[];
  /** Keeps the inputs' ids apart from other pictures of the same Submission. */
  prefix: string;
  /** Also the Submission's Lists, after its Fields. */
  lists?: boolean;
}) {
  const own = <F extends { id: string }>(f: F) => ({ ...f, id: `${prefix}-${f.id}` });
  const rows = keys
    ? keys.map((key) => submission.fieldValues.find((f) => f.key === key)!)
    : submission.fieldValues;
  const field = (fieldValue: DemoSubmission["fieldValues"][number], manual = false) => (
    <FieldRowView
      key={fieldValue.id}
      fieldValue={own(fieldValue)}
      threshold={DEMO_THRESHOLD}
      disabled={false}
      manual={manual}
      selected={false}
      onSelect={nothing}
      onCorrect={nothing}
      onCheck={nothing}
      onUndo={nothing}
    />
  );
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="overflow-hidden rounded-lg border bg-card">{rows.map((f) => field(f))}</div>
      {lists &&
        submission.lists.map((list) => (
          <ListGroupView
            key={list.key}
            list={list}
            threshold={DEMO_THRESHOLD}
            disabled={false}
            filter="all"
            selected={null}
            renderField={field}
            onConfirm={nothing}
            onUndoConfirm={nothing}
            onRemove={nothing}
            onRestore={nothing}
            onAdd={nothing}
          />
        ))}
    </div>
  );
}

function FirstPage({ submissionId }: { submissionId: DemoPdfId }) {
  const Page = demoPages[submissionId][0];
  return <Page />;
}

/** "Needs Review · filename", for a screenshot frame's title bar. */
export function ReviewFrameTitle({ submissionId }: { submissionId: DemoSubmissionId }) {
  return (
    <DemoLabels>
      <FrameTitle submissionId={submissionId} />
    </DemoLabels>
  );
}

function FrameTitle({ submissionId }: { submissionId: DemoSubmissionId }) {
  const { labels } = useSubmissionsLabels();
  const submission = useDemoSubmission(submissionId);
  return (
    <>
      {labels.review.states[submission.state]} · {submission.filename}
    </>
  );
}

/** The demo's papers side by side, as they arrive. */
export function PapersRow({ submissionIds, label }: { submissionIds: DemoPdfId[]; label: string }) {
  return (
    <ScaledStill width={1440} always fade={false} label={label} className="bg-transparent">
      <div className="grid grid-flow-col gap-10 p-2">
        {submissionIds.map((id) => (
          <FirstPage key={id} submissionId={id} />
        ))}
      </div>
    </ScaledStill>
  );
}

/** One Submission's first page next to all its Fields. */
export function SubmissionFieldsStill({ submissionId, label }: { submissionId: DemoPdfId; label: string }) {
  const submission = useDemoSubmission(submissionId);
  return (
    <ScaledStill width={800} fade={false} label={label} className="bg-transparent">
      <DemoLabels>
        <div className="grid items-start gap-5 p-1 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <div className="mx-auto w-fit [zoom:0.6] sm:[zoom:0.8]">
            <FirstPage submissionId={submissionId} />
          </div>
          <Fields submission={submission} prefix={`home-${submissionId}`} />
        </div>
      </DemoLabels>
    </ScaledStill>
  );
}

/** The damage claim's Fields around its vague cause, the one value to check. */
export function CheckStill({ label }: { label: string }) {
  const submission = useDemoSubmission("claim");
  return (
    <ScaledStill width={760} fade={false} label={label} className="bg-transparent">
      <DemoLabels>
        <div className="p-4">
          <Fields submission={submission} keys={["damage_date", "cause", "total_claimed"]} prefix="home-check" />
        </div>
      </DemoLabels>
    </ScaledStill>
  );
}
