"use client";

import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useErrorText } from "../../../error-text";

/** Form settings live outside the Form Version, so saving them doesn't make one. */
export function FormSettings({
  organisationSlug,
  formId,
  initial,
}: {
  organisationSlug: string;
  formId: Id<"forms">;
  initial: { reviewThreshold: number; autoSend: boolean };
}) {
  const t = useTranslations("appForms.settings");
  const errorText = useErrorText();
  const updateSettings = useMutation(api.forms.updateSettings);
  const [saved, setSaved] = useState(initial);
  const [threshold, setThreshold] = useState(String(initial.reviewThreshold));
  const [autoSend, setAutoSend] = useState(initial.autoSend);
  const [saving, setSaving] = useState(false);

  const reviewThreshold = Number(threshold);
  const valid = threshold.trim() !== "" && reviewThreshold >= 0 && reviewThreshold <= 1;
  const dirty = reviewThreshold !== saved.reviewThreshold || autoSend !== saved.autoSend;

  async function onSave() {
    setSaving(true);
    try {
      await updateSettings({ organisationSlug, formId, reviewThreshold, autoSend });
      setSaved({ reviewThreshold, autoSend });
      toast.success(t("saved"));
    } catch (error) {
      toast.error(errorText(error, t("saveFailed")));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-lg border p-4 md:p-6">
      <FieldSet>
        <FieldLegend>{t("legend")}</FieldLegend>
        <FieldDescription>{t("description")}</FieldDescription>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="review-threshold">{t("reviewThreshold")}</FieldLabel>
            <Input
              id="review-threshold"
              type="number"
              inputMode="decimal"
              min={0}
              max={1}
              step={0.05}
              className="max-w-32 tabular-nums"
              value={threshold}
              aria-invalid={!valid}
              onChange={(e) => setThreshold(e.target.value)}
            />
            <FieldDescription>{t("reviewThresholdDescription")}</FieldDescription>
          </Field>
          <Field orientation="horizontal">
            <Switch id="auto-send" checked={autoSend} onCheckedChange={setAutoSend} />
            <FieldContent>
              <FieldLabel htmlFor="auto-send">{t("autoSend")}</FieldLabel>
              <FieldDescription>{t("autoSendDescription")}</FieldDescription>
            </FieldContent>
          </Field>
        </FieldGroup>
        <Button
          className="self-start"
          variant="outline"
          disabled={!valid || !dirty || saving}
          onClick={() => void onSave()}
        >
          {saving && <Spinner />}
          {t("save")}
        </Button>
      </FieldSet>
    </section>
  );
}
