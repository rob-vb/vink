"use client";

import { useMutation, useQuery } from "convex/react";
import { ArrowRightLeft, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useErrorText } from "../../../../error-text";

/**
 * Change Form: pick another Form. Warns how many corrections will be lost,
 * then Vink reads the Submission against the new Form.
 */
export function ChangeFormButton({
  organisationSlug,
  submissionId,
  currentFormId,
  size = "default",
}: {
  organisationSlug: string;
  submissionId: Id<"submissions">;
  /** `null` for a Submission in No Form. */
  currentFormId: Id<"forms"> | null;
  size?: "default" | "sm";
}) {
  const t = useTranslations("appSubmissions");
  const errorText = useErrorText();
  const [open, setOpen] = useState(false);
  const [formId, setFormId] = useState<Id<"forms"> | null>(null);
  const [pending, setPending] = useState(false);
  const forms = useQuery(api.forms.list, open ? { organisationSlug } : "skip");
  const impact = useQuery(api.changeForm.impact, open ? { organisationSlug, submissionId } : "skip");
  const changeForm = useMutation(api.changeForm.changeForm);
  const others = (forms ?? [])
    .filter((f) => f.id !== currentFormId)
    .map((f) => ({ value: f.id, label: f.name }));

  async function submit() {
    if (formId === null) return;
    setPending(true);
    try {
      await changeForm({ organisationSlug, submissionId, formId });
      setOpen(false);
      setFormId(null);
    } catch (error) {
      toast.error(errorText(error, t("tryAgain")));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size={size} />}>
        <ArrowRightLeft />
        {t("changeForm.button")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("changeForm.title")}</DialogTitle>
          <DialogDescription>{t("changeForm.description")}</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="change-form">{t("changeForm.newForm")}</FieldLabel>
          <Select
            items={others}
            value={formId}
            onValueChange={(value) => setFormId(value as Id<"forms"> | null)}
          >
            <SelectTrigger id="change-form" className="w-full">
              <SelectValue placeholder={others.length ? t("chooseForm") : t("changeForm.noOtherForms")} />
            </SelectTrigger>
            <SelectContent>
              {others.map((form) => (
                <SelectItem key={form.value} value={form.value}>
                  {form.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {impact !== undefined && impact.corrections > 0 && (
          <p className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            {t("changeForm.lost", { count: impact.corrections })} {t("changeForm.dropped")}
          </p>
        )}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>{t("cancel")}</DialogClose>
          <Button disabled={formId === null || pending} onClick={submit}>
            {t("changeForm.button")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
