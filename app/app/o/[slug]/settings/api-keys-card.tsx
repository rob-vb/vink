"use client";

import { useMutation, useQuery } from "convex/react";
import { Check, Copy, KeyRound, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
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
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useErrorText } from "../../../error-text";

/** Name a new key, then show it once with a copy button. */
function NewKeyDialog({
  organisationSlug,
  open,
  onOpenChange,
}: {
  organisationSlug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("appSettings.apiKeys");
  const errorText = useErrorText();
  const create = useMutation(api.apiKeys.create);
  const [name, setName] = useState("");
  const [making, setMaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The key itself: kept only while this dialog is open.
  const [made, setMade] = useState<{ name: string; key: string } | null>(null);
  const [copied, setCopied] = useState(false);

  function changeOpen(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setMade(null);
      setName("");
      setError(null);
      setCopied(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (making) return;
    setMaking(true);
    setError(null);
    try {
      const { key } = await create({ organisationSlug, name });
      setMade({ name: name.trim(), key });
    } catch (error) {
      setError(errorText(error, t("notMade")));
    } finally {
      setMaking(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="sm:max-w-lg">
        {made === null ? (
          <form onSubmit={onSubmit} className="flex flex-col gap-6">
            <DialogHeader>
              <DialogTitle>{t("newTitle")}</DialogTitle>
              <DialogDescription>{t("newDescription")}</DialogDescription>
            </DialogHeader>
            <Field>
              <FieldLabel htmlFor="api-key-name">{t("name")}</FieldLabel>
              <Input
                id="api-key-name"
                placeholder={t("namePlaceholder")}
                maxLength={100}
                required
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              {error && <FieldError>{error}</FieldError>}
            </Field>
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>{t("cancel")}</DialogClose>
              <Button type="submit" disabled={making || name.trim() === ""}>
                {making && <Spinner />}
                {t("make")}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="flex flex-col gap-6">
            <DialogHeader>
              <DialogTitle>{t("madeTitle", { name: made.name })}</DialogTitle>
              <DialogDescription>
                {t.rich("madeDescription", { code: (chunks) => <code className="font-mono text-xs">{chunks}</code> })}
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2">
              <code
                aria-label={t("keyLabel")}
                className="min-w-0 flex-1 rounded-md border bg-muted px-3 py-2 font-mono text-xs break-all select-all"
              >
                {made.key}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  navigator.clipboard.writeText(made.key).then(
                    () => setCopied(true),
                    () => toast.error(t("notCopied")),
                  )
                }
              >
                {copied ? <Check /> : <Copy />}
                {copied ? t("copied") : t("copy")}
              </Button>
            </div>
            <Alert>
              <KeyRound />
              <AlertDescription>{t("onlyOnce")}</AlertDescription>
            </Alert>
            <DialogFooter>
              <DialogClose render={<Button type="button" />}>{t("done")}</DialogClose>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Admin only (the Settings page is): make, list and revoke API Keys. */
export function ApiKeysCard({ organisationSlug }: { organisationSlug: string }) {
  const t = useTranslations("appSettings.apiKeys");
  const locale = useLocale();
  const errorText = useErrorText();
  const dateFormat = new Intl.DateTimeFormat(locale === "nl" ? "nl-NL" : "en-GB", { dateStyle: "medium" });
  const keys = useQuery(api.apiKeys.list, { organisationSlug });
  const revoke = useMutation(api.apiKeys.revoke);
  const [newOpen, setNewOpen] = useState(false);
  // Kept after closing so the dialog's text doesn't blank out while it fades.
  const [revoking, setRevoking] = useState<{ id: Id<"apiKeys">; name: string } | null>(null);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const reference = locale === "en" ? "/en/developers/api" : "/developers/api";

  async function onRevoke() {
    if (!revoking || busy) return;
    setBusy(true);
    try {
      await revoke({ organisationSlug, apiKeyId: revoking.id });
      toast.success(t("revoked", { name: revoking.name }));
    } catch (error) {
      toast.error(errorText(error, t("notRevoked")));
    } finally {
      setBusy(false);
      setRevokeOpen(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>
          {t.rich("description", {
            link: (chunks) => (
              <a href={reference} target="_blank" rel="noreferrer" className="underline underline-offset-3">
                {chunks}
              </a>
            ),
          })}
        </CardDescription>
        <CardAction>
          <Button variant="outline" onClick={() => setNewOpen(true)}>
            <Plus />
            {t("new")}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {keys === undefined ? (
          <Skeleton className="h-16" />
        ) : keys.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("none")}</p>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("name")}</TableHead>
                  <TableHead className="hidden sm:table-cell">{t("created")}</TableHead>
                  <TableHead>{t("lastUsed")}</TableHead>
                  <TableHead className="w-20">
                    <span className="sr-only">{t("actions")}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((key) => (
                  <TableRow key={key.id}>
                    <TableCell className="max-w-0 w-full">
                      <div className="truncate font-medium">{key.name}</div>
                      <div className="truncate font-mono text-xs text-muted-foreground">{key.hint}</div>
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap sm:table-cell">
                      {dateFormat.format(key.createdAt)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {key.lastUsedAt === null ? t("never") : dateFormat.format(key.lastUsedAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => {
                          setRevoking({ id: key.id, name: key.name });
                          setRevokeOpen(true);
                        }}
                      >
                        {t("revoke")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <NewKeyDialog organisationSlug={organisationSlug} open={newOpen} onOpenChange={setNewOpen} />

      <AlertDialog open={revokeOpen} onOpenChange={setRevokeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("revokeTitle", { name: revoking?.name ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>{t("revokeDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={busy} onClick={onRevoke}>
              {busy && <Spinner />}
              {t("revoke")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
