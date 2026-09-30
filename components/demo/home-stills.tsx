"use client";

import { useLocale } from "next-intl";
import { useState } from "react";
import { FieldRowView } from "@/components/documents/field-row-view";
import { useDocumentsLabels } from "@/components/documents/labels";
import { ListGroupView } from "@/components/documents/list-group-view";
import { ScaledStill } from "@/components/features/scaled-still";
import { cn } from "cn";
import { DEMO_THRESHOLD } from "./demo-data";
import { demoPages, type DemoDocumentId } from "./demo-papers";
import { DemoLabels } from "./demo-screens";
import { demoReducer, initialDocuments, type DemoAction, type DemoDocument, type Locale } from "./demo-state";

/*
 * Home's pictures of the review screen's Fields: the demo's Documents drawn
 * with the app's own rows (components/documents), in the page's language.
 * Pictures only: nothing inside can be clicked or typed in.
 */

const nothing = () => {};
// A fixed moment, so the pictures render the same on the server and in the browser.
const AT = Date.UTC(2026, 8, 30, 6, 20);

function useDemoDocument(documentId: DemoDocumentId, steps: DemoAction[] = []) {
  const locale = useLocale() as Locale;
  const [documents] = useState(() => steps.reduce(demoReducer, initialDocuments(locale)));
  return documents.find((d) => d.id === documentId)!;
}

/** A Document's Field rows, as on the review screen. */
function Fields({
  document,
  keys,
  prefix,
  lists = false,
}: {
  document: DemoDocument;
  /** Only these Fields, in this order; all Fields when left out. */
  keys?: string[];
  /** Keeps the inputs' ids apart from other pictures of the same Document. */
  prefix: string;
  /** Also the Document's Lists, after its Fields. */
  lists?: boolean;
}) {
  const own = <F extends { id: string }>(f: F) => ({ ...f, id: `${prefix}-${f.id}` });
  const rows = keys
    ? keys.map((key) => document.fieldValues.find((f) => f.key === key)!)
    : document.fieldValues;
  const field = (fieldValue: DemoDocument["fieldValues"][number], manual = false) => (
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
        document.lists.map((list) => (
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

function FirstPage({ documentId }: { documentId: DemoDocumentId }) {
  const Page = demoPages[documentId][0];
  return <Page />;
}

/** "Needs Review · filename", for a screenshot frame's title bar. */
export function ReviewFrameTitle({ documentId }: { documentId: DemoDocumentId }) {
  return (
    <DemoLabels>
      <FrameTitle documentId={documentId} />
    </DemoLabels>
  );
}

function FrameTitle({ documentId }: { documentId: DemoDocumentId }) {
  const { labels } = useDocumentsLabels();
  const document = useDemoDocument(documentId);
  return (
    <>
      {labels.review.states[document.state]} · {document.filename}
    </>
  );
}

/** The demo's papers side by side, as they arrive. */
export function PapersRow({ documentIds, label }: { documentIds: DemoDocumentId[]; label: string }) {
  return (
    <ScaledStill width={1440} always fade={false} label={label} className="bg-transparent">
      <div className="grid grid-flow-col gap-10 p-2">
        {documentIds.map((id) => (
          <FirstPage key={id} documentId={id} />
        ))}
      </div>
    </ScaledStill>
  );
}

/** One Document's first page next to all its Fields. */
export function DocumentFieldsStill({ documentId, label }: { documentId: DemoDocumentId; label: string }) {
  const document = useDemoDocument(documentId);
  return (
    <ScaledStill width={800} fade={false} label={label} className="bg-transparent">
      <DemoLabels>
        <div className="grid items-start gap-5 p-1 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <div className="mx-auto w-fit [zoom:0.6] sm:[zoom:0.8]">
            <FirstPage documentId={documentId} />
          </div>
          <Fields document={document} prefix={`home-${documentId}`} />
        </div>
      </DemoLabels>
    </ScaledStill>
  );
}

/** The delivery note's flagged Fields, one of them already checked. */
export function CheckStill({ label }: { label: string }) {
  const document = useDemoDocument("delivery", [
    { type: "check", documentId: "delivery", fieldValueId: "delivery.received_by", at: AT },
  ]);
  return (
    <ScaledStill width={760} fade={false} label={label} className="bg-transparent">
      <DemoLabels>
        <div className="p-4">
          <Fields document={document} keys={["customer_reference", "pallets", "received_by"]} prefix="home-check" />
        </div>
      </DemoLabels>
    </ScaledStill>
  );
}

/** The blurred picture behind the video's placeholder. */
export function VideoBackdrop({ label, className }: { label: string; className?: string }) {
  const document = useDemoDocument("delivery");
  return (
    <ScaledStill width={1000} always fade={false} label={label} className={cn("bg-transparent", className)}>
      <DemoLabels>
        <div className="grid grid-cols-[2fr_3fr] gap-6 p-8">
          <div className="[zoom:0.85]">
            <FirstPage documentId="delivery" />
          </div>
          <Fields
            document={document}
            keys={["delivery_number", "delivery_date", "customer_reference", "pallets"]}
            prefix="home-video"
          />
        </div>
      </DemoLabels>
    </ScaledStill>
  );
}
