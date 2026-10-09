"use client";

import { useMutation } from "convex/react";
import { Ban, RotateCcw, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useErrorText } from "../../../../error-text";

function useFailed() {
  const t = useTranslations("appSubmissions");
  const errorText = useErrorText();
  return (error: unknown) => {
    toast.error(errorText(error, t("tryAgain")));
  };
}

type Target = { organisationSlug: string; submissionId: Id<"submissions">; filename: string };

/** Reject with an optional reason: the Submission is never approved or sent. */
export function RejectButton({
  organisationSlug,
  submissionId,
  filename,
  size = "default",
}: Target & { size?: "default" | "sm" }) {
  const t = useTranslations("appSubmissions");
  const failed = useFailed();
  const reject = useMutation(api.rejection.reject);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);

  async function submit() {
    setPending(true);
    try {
      await reject({ organisationSlug, submissionId, reason: reason.trim() || undefined });
      setOpen(false);
      toast.success(t("reject.toast", { filename }));
    } catch (error) {
      failed(error);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size={size} />}>
        <Ban />
        {t("reject.button")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("reject.title")}</DialogTitle>
          <DialogDescription>{t("reject.description", { filename })}</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="reject-reason">{t("reject.reason")}</FieldLabel>
          <Textarea
            id="reject-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t("reject.placeholder")}
          />
          <FieldDescription>{t("reject.reasonHelp")}</FieldDescription>
        </Field>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>{t("cancel")}</DialogClose>
          <Button variant="destructive" disabled={pending} onClick={submit}>
            {t("reject.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ReopenButton({ organisationSlug, submissionId }: Omit<Target, "filename">) {
  const t = useTranslations("appSubmissions");
  const failed = useFailed();
  const reopen = useMutation(api.rejection.reopen);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => reopen({ organisationSlug, submissionId }).catch(failed)}
    >
      <RotateCcw />
      {t("reject.reopen")}
    </Button>
  );
}

/**
 * Delete now, Admin only: deletes the PDF and its data for good, Approved
 * included, and cancels Deliveries not yet sent. The short record stays.
 */
export function DeleteButton({
  organisationSlug,
  submissionId,
  filename,
  variant = "destructive",
}: Target & { variant?: "destructive" | "outline" }) {
  const t = useTranslations("appSubmissions");
  const failed = useFailed();
  const remove = useMutation(api.rejection.remove);
  const [open, setOpen] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={<Button variant={variant} size={variant === "outline" ? "default" : "sm"} />}
      >
        <Trash2 />
        {t("delete.button")}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("delete.title", { filename })}</AlertDialogTitle>
          <AlertDialogDescription>{t("delete.description")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() =>
              remove({ organisationSlug, submissionId }).then(() => {
                setOpen(false);
                toast.success(t("delete.toast", { filename }));
              }, failed)
            }
          >
            {t("delete.button")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
