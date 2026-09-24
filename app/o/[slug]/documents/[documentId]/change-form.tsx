"use client";

import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { ArrowRightLeft, TriangleAlert } from "lucide-react";
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

/**
 * Change Form: pick another Form. Warns how many corrections will be lost,
 * then DocuHelper reads the Document against the new Form.
 */
export function ChangeFormButton({
  organisationSlug,
  documentId,
  currentFormId,
  size = "default",
}: {
  organisationSlug: string;
  documentId: Id<"documents">;
  currentFormId: Id<"forms">;
  size?: "default" | "sm";
}) {
  const [open, setOpen] = useState(false);
  const [formId, setFormId] = useState<Id<"forms"> | null>(null);
  const [pending, setPending] = useState(false);
  const forms = useQuery(api.forms.list, open ? { organisationSlug } : "skip");
  const impact = useQuery(api.changeForm.impact, open ? { organisationSlug, documentId } : "skip");
  const changeForm = useMutation(api.changeForm.changeForm);
  const others = (forms ?? [])
    .filter((f) => f.id !== currentFormId)
    .map((f) => ({ value: f.id, label: f.name }));

  async function submit() {
    if (formId === null) return;
    setPending(true);
    try {
      await changeForm({ organisationSlug, documentId, formId });
      setOpen(false);
      setFormId(null);
    } catch (error) {
      toast.error(error instanceof ConvexError ? String(error.data) : "That didn't work. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size={size} />}>
        <ArrowRightLeft />
        Change Form
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change the Form</DialogTitle>
          <DialogDescription>
            DocuHelper fills the new Form from what it already read on the PDF. Only when it
            hasn&apos;t read it yet does it read the PDF again.
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="change-form">New Form</FieldLabel>
          <Select
            items={others}
            value={formId}
            onValueChange={(value) => setFormId(value as Id<"forms"> | null)}
          >
            <SelectTrigger id="change-form" className="w-full">
              <SelectValue placeholder={others.length ? "Choose a Form" : "No other Forms"} />
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
            {impact.corrections === 1
              ? "1 correction will be lost."
              : `${impact.corrections} corrections will be lost.`}{" "}
            The values for the current Form are dropped.
          </p>
        )}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button disabled={formId === null || pending} onClick={submit}>
            Change Form
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
