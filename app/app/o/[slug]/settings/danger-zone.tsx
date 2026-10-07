"use client";

import { useAction } from "convex/react";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { DeleteAccountDialog, TypeToConfirm, typed } from "../delete-account-dialog";

function Row({ title, body, action }: { title: string; body: string; action: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{body}</p>
      </div>
      {action}
    </div>
  );
}

function DeleteOrganisationDialog({
  open,
  onOpenChange,
  organisationSlug,
  name,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organisationSlug: string;
  name: string;
}) {
  const t = useTranslations("appSettings.dangerZone");
  const router = useRouter();
  const deleteOrganisation = useAction(api.deletion.deleteOrganisation);
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const b = (chunks: ReactNode) => <b>{chunks}</b>;

  async function onDelete() {
    setPending(true);
    try {
      await deleteOrganisation({ organisationSlug, confirmName: value });
    } catch {
      setPending(false);
      toast.error(t("organisation.failed"));
      return;
    }
    // /app sends the user to another Organisation, or to Welcome.
    router.replace("/app");
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
          <AlertDialogTitle>{t("organisation.title")}</AlertDialogTitle>
          <AlertDialogDescription>{t("organisation.body", { name })}</AlertDialogDescription>
        </AlertDialogHeader>
        <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{t("organisation.plan")}</p>
        <TypeToConfirm
          id="confirm-organisation"
          label={t("organisation.confirmLabel")}
          prompt={t.rich("organisation.confirm", { name, b })}
          value={value}
          onChange={setValue}
        />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{t("cancel")}</AlertDialogCancel>
          <Button variant="destructive" disabled={pending || !typed(value, name)} onClick={() => void onDelete()}>
            {pending ? t("organisation.deleting") : t("organisation.button")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** The bottom of Settings: deleting the Organisation, or your own account. */
export function DangerZone({ organisationSlug, name }: { organisationSlug: string; name: string }) {
  const t = useTranslations("appSettings.dangerZone");
  const { data: session } = authClient.useSession();
  const [open, setOpen] = useState<"organisation" | "account" | null>(null);
  const toggle = (which: "organisation" | "account") => (next: boolean) => setOpen(next ? which : null);

  return (
    <Card className="ring-destructive/30">
      <CardHeader>
        <CardTitle className="text-destructive">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="divide-y">
        <Row
          title={t("organisation.title")}
          body={t("organisation.row", { name })}
          action={
            <Button variant="destructive" className="shrink-0" onClick={() => setOpen("organisation")}>
              {t("organisation.button")}
            </Button>
          }
        />
        <Row
          title={t("account.title")}
          body={t("account.row")}
          action={
            <Button variant="destructive" className="shrink-0" onClick={() => setOpen("account")}>
              {t("account.button")}
            </Button>
          }
        />
      </CardContent>
      <DeleteOrganisationDialog
        open={open === "organisation"}
        onOpenChange={toggle("organisation")}
        organisationSlug={organisationSlug}
        name={name}
      />
      <DeleteAccountDialog open={open === "account"} onOpenChange={toggle("account")} email={session?.user.email ?? ""} />
    </Card>
  );
}
