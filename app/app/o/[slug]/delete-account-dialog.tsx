"use client";

import { useAction, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import { authClient } from "@/lib/auth-client";

/** The text field of a delete dialog: the button stays off until `expected` is typed. */
export function TypeToConfirm({
  id,
  label,
  prompt,
  value,
  onChange,
}: {
  id: string;
  label: string;
  prompt: ReactNode;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id} className="font-normal text-muted-foreground [&_b]:font-semibold [&_b]:text-foreground">
        <span>{prompt}</span>
      </FieldLabel>
      <Input
        id={id}
        aria-label={label}
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

/** Whether what was typed matches, ignoring outer spaces (and case, for an email). */
export function typed(value: string, expected: string, { ignoreCase = false } = {}) {
  const a = value.trim();
  const b = expected.trim();
  return a !== "" && (ignoreCase ? a.toLowerCase() === b.toLowerCase() : a === b);
}

/**
 * Deletes the signed-in account after the email is typed. Shows first what
 * goes with it, or which Organisations block it (last Admin with Members).
 */
export function DeleteAccountDialog({
  open,
  onOpenChange,
  email,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: string;
}) {
  const t = useTranslations("appSettings.dangerZone");
  const router = useRouter();
  const plan = useQuery(api.deletion.accountDeletion, open ? {} : "skip");
  const deleteAccount = useAction(api.deletion.deleteAccount);
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const blocked = plan !== undefined && plan.blockedBy.length > 0;
  const b = (chunks: ReactNode) => <b>{chunks}</b>;

  async function onDelete() {
    setPending(true);
    try {
      await deleteAccount({});
    } catch {
      setPending(false);
      toast.error(t("account.failed"));
      return;
    }
    // The session is gone with the account; signing out clears the cookies.
    await authClient.signOut().catch(() => undefined);
    router.replace("/app/sign-in");
    router.refresh();
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        if (!next) setValue("");
        onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("account.title")}</AlertDialogTitle>
          <AlertDialogDescription>{t("account.body", { email })}</AlertDialogDescription>
        </AlertDialogHeader>
        {plan === undefined ? (
          <Skeleton className="h-16" />
        ) : blocked ? (
          <div className="text-sm">
            <p>{t("account.blocked")}</p>
            <ul className="mt-2 list-disc pl-5">
              {plan.blockedBy.map((organisation) => (
                <li key={organisation.slug}>
                  <Link href={`/app/o/${organisation.slug}/members`} className="underline underline-offset-3">
                    {organisation.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <>
            {plan.alsoDeleted.length > 0 && (
              <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                <p>{t("account.alsoDeleted")}</p>
                <ul className="mt-1 list-disc pl-5 font-medium">
                  {plan.alsoDeleted.map((name) => (
                    <li key={name}>{name}</li>
                  ))}
                </ul>
              </div>
            )}
            <TypeToConfirm
              id="confirm-account"
              label={t("account.confirmLabel")}
              prompt={t.rich("account.confirm", { email, b })}
              value={value}
              onChange={setValue}
            />
          </>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{t("cancel")}</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={plan === undefined || blocked || pending || !typed(value, email, { ignoreCase: true })}
            onClick={() => void onDelete()}
          >
            {pending ? t("account.deleting") : t("account.button")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
