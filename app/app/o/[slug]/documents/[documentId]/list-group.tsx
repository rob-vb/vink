"use client";

import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";
import { toast } from "sonner";
import { ListGroupView } from "@/components/documents/list-group-view";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { FieldRow } from "./field-row";

type ListView = FunctionReturnType<typeof api.documents.get>["lists"][number];

/**
 * A List Field on the review screen, fed from Convex. The group itself is
 * `ListGroupView`, which the marketing demo renders with demo data.
 */
export function ListGroup({
  organisationSlug,
  documentId,
  list,
  threshold,
  disabled,
  filter,
  selected,
  onSelect,
}: {
  organisationSlug: string;
  documentId: Id<"documents">;
  list: ListView;
  threshold: number;
  disabled: boolean;
  filter: "all" | "needs_review";
  selected: string | null;
  onSelect: (id: string, pages: number[]) => void;
}) {
  const addEntry = useMutation(api.review.addEntry);
  const removeEntry = useMutation(api.review.removeEntry);
  const restoreEntry = useMutation(api.review.restoreEntry);
  const confirmEntries = useMutation(api.review.confirmEntries);
  const undoConfirmEntries = useMutation(api.review.undoConfirmEntries);
  const on = { organisationSlug, documentId, listKey: list.key };

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
    } catch (error) {
      toast.error(error instanceof ConvexError ? String(error.data) : "That didn't work. Try again.");
    }
  }

  return (
    <ListGroupView
      list={list}
      threshold={threshold}
      disabled={disabled}
      filter={filter}
      selected={selected}
      renderField={(fieldValue, manual) => (
        <FieldRow
          organisationSlug={organisationSlug}
          fieldValue={fieldValue}
          threshold={threshold}
          disabled={disabled}
          manual={manual}
          selected={selected === fieldValue.id}
          onSelect={() => onSelect(fieldValue.id, fieldValue.pages)}
        />
      )}
      onConfirm={() => run(() => confirmEntries(on))}
      onUndoConfirm={() => run(() => undoConfirmEntries(on))}
      onRemove={(entry) => run(() => removeEntry({ ...on, entry }))}
      onRestore={(entry) => run(() => restoreEntry({ ...on, entry }))}
      onAdd={() => run(() => addEntry(on))}
    />
  );
}
