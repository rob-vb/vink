"use client";

import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { Ban, RotateCcw, Trash2 } from "lucide-react";
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

function failed(error: unknown) {
  toast.error(error instanceof ConvexError ? String(error.data) : "That didn't work. Try again.");
}

type Target = { organisationSlug: string; documentId: Id<"documents">; filename: string };

/** Reject with an optional reason: the Document is never approved or sent. */
export function RejectButton({
  organisationSlug,
  documentId,
  filename,
  size = "default",
}: Target & { size?: "default" | "sm" }) {
  const reject = useMutation(api.rejection.reject);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);

  async function submit() {
    setPending(true);
    try {
      await reject({ organisationSlug, documentId, reason: reason.trim() || undefined });
      setOpen(false);
      toast.success(`${filename} is rejected.`);
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
        Reject
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject this Document?</DialogTitle>
          <DialogDescription>
            {filename} will never be approved or sent. It stays in the Rejected list, and you can
            reopen it while its PDF is kept.
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="reject-reason">Reason (optional)</FieldLabel>
          <Textarea
            id="reject-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Blank scan, unreadable, not a work order…"
          />
          <FieldDescription>Shown to your team next to the Document.</FieldDescription>
        </Field>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button variant="destructive" disabled={pending} onClick={submit}>
            Reject Document
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ReopenButton({ organisationSlug, documentId }: Omit<Target, "filename">) {
  const reopen = useMutation(api.rejection.reopen);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => reopen({ organisationSlug, documentId }).catch(failed)}
    >
      <RotateCcw />
      Reopen
    </Button>
  );
}

/**
 * Delete now, Admin only: deletes the PDF and its data for good, Approved
 * included, and cancels Deliveries not yet sent. The short record stays.
 */
export function DeleteButton({
  organisationSlug,
  documentId,
  filename,
  variant = "destructive",
}: Target & { variant?: "destructive" | "outline" }) {
  const remove = useMutation(api.rejection.remove);
  const [open, setOpen] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={<Button variant={variant} size={variant === "outline" ? "default" : "sm"} />}
      >
        <Trash2 />
        Delete now
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {filename} for good?</AlertDialogTitle>
          <AlertDialogDescription>
            The PDF, what Vink read, every value and your system&apos;s replies are deleted now and
            can&apos;t be brought back. Deliveries that haven&apos;t gone out yet are cancelled.
            Only the filename, who uploaded and approved it, the dates, the history and the
            Delivery status stay, with a &quot;Deleted by you&quot; line.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() =>
              remove({ organisationSlug, documentId }).then(() => {
                setOpen(false);
                toast.success(`${filename} is deleted.`);
              }, failed)
            }
          >
            Delete now
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
