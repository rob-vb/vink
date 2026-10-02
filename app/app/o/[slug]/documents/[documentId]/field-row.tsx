"use client";

import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { FieldRowView } from "@/components/documents/field-row-view";
import { api } from "@/convex/_generated/api";
import { useErrorText } from "../../../../error-text";

export { ConfidenceBar } from "@/components/documents/field-row-view";

export type FieldValueView = FunctionReturnType<
  typeof api.documents.get
>["fieldValues"][number];

/**
 * One Field Value, fed from Convex. The row itself is `FieldRowView`, which the
 * marketing demo renders with demo data: a change there shows up in both.
 */
export function FieldRow({
  organisationSlug,
  fieldValue,
  threshold,
  disabled,
  manual = false,
  selected,
  onSelect,
}: {
  organisationSlug: string;
  fieldValue: FieldValueView;
  threshold: number;
  disabled: boolean;
  /** In a List entry a user added: nothing was read, so there's no confidence to show. */
  manual?: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const t = useTranslations("appDocuments");
  const errorText = useErrorText();
  const correct = useMutation(api.review.correct);
  const check = useMutation(api.review.check);
  const undo = useMutation(api.review.undo);
  const on = { organisationSlug, fieldValueId: fieldValue.id };

  return (
    <FieldRowView
      fieldValue={fieldValue}
      threshold={threshold}
      disabled={disabled}
      manual={manual}
      selected={selected}
      onSelect={onSelect}
      onCorrect={(value) => correct({ ...on, value })}
      onCheck={() => check(on)}
      onUndo={() => undo(on)}
      onError={(error) => toast.error(errorText(error, t("tryAgain")))}
    />
  );
}
