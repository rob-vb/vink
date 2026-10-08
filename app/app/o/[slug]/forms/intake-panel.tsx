"use client";

import { useMutation, useQuery } from "convex/react";
import { Check, Copy, Mail } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
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
import { FieldDescription, FieldLegend, FieldSet } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Locale } from "@/i18n/routing";
import { serverErrorText } from "@/lib/server-errors";
import { useErrorText } from "../../../error-text";

/** Copies the address; shows a tick for a moment. */
export function CopyAddress({ address }: { address: string }) {
  const t = useTranslations("appForms.intake");
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg border bg-muted/40 py-1 pr-1 pl-3">
      <Mail className="size-4 shrink-0 text-muted-foreground" />
      <code className="min-w-0 flex-1 truncate font-mono text-sm">{address}</code>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={t("copy")}
        onClick={() =>
          navigator.clipboard.writeText(address).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
        }
      >
        {copied ? <Check /> : <Copy />}
      </Button>
    </div>
  );
}

/**
 * A Form's Intake Address, or with no Form the Organisation's: Admins switch it
 * on, off or replace it; every Member can copy it and see what happened to the
 * last 50 emails.
 */
export function IntakePanel({
  organisationSlug,
  formId,
  isAdmin,
}: {
  organisationSlug: string;
  /** `null`: the Organisation Intake Address, whose mail the Router sends to a Form. */
  formId: Id<"forms"> | null;
  isAdmin: boolean;
}) {
  const t = useTranslations("appForms");
  const errorText = useErrorText();
  const failed = (error: unknown) => toast.error(errorText(error, t("tryAgain")));
  const on = formId === null ? { organisationSlug } : { organisationSlug, formId };
  const scope = formId === null ? "organisation" : "";
  const word = (key: "Legend" | "Description" | "AdminCanSwitchOn" | "ReplaceDescription") =>
    scope ? t(`intake.organisation${key}`) : null;
  const intake = useQuery(api.intake.get, on);
  const switchOn = useMutation(api.intake.switchOn);
  const switchOff = useMutation(api.intake.switchOff);
  const replace = useMutation(api.intake.replace);
  const enabled = intake !== undefined && (intake.address !== null || intake.pendingDomain);

  return (
    <section className="rounded-lg border p-4 md:p-6">
      <FieldSet>
        <FieldLegend>{word("Legend") ?? t("intake.legend")}</FieldLegend>
        <FieldDescription>{word("Description") ?? t("intake.description")}</FieldDescription>
        {intake === undefined ? (
          <Skeleton className="h-10" />
        ) : !enabled ? (
          isAdmin ? (
            <div>
              <Button type="button" variant="outline" onClick={() => switchOn(on).catch(failed)}>
                <Mail />
                {t("intake.switchOn")}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{word("AdminCanSwitchOn") ?? t("intake.adminCanSwitchOn")}</p>
          )
        ) : (
          <div className="flex flex-col gap-3">
            {intake.address ? (
              <CopyAddress address={intake.address} />
            ) : (
              <p className="text-sm text-muted-foreground">{t("intake.pending")}</p>
            )}
            {isAdmin && (
              <div className="flex flex-wrap gap-2">
                <AlertDialog>
                  <AlertDialogTrigger render={<Button type="button" variant="outline" size="sm" />}>
                    {t("intake.replace")}
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("intake.replaceTitle")}</AlertDialogTitle>
                      <AlertDialogDescription>{word("ReplaceDescription") ?? t("intake.replaceDescription")}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("intake.cancel")}</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() =>
                          replace(on).then(() => toast.success(t("intake.replaced")), failed)
                        }
                      >
                        {t("intake.replaceConfirm")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => switchOff(on).then(() => toast.success(t("intake.switchedOff")), failed)}
                >
                  {t("intake.switchOff")}
                </Button>
              </div>
            )}
            <RecentEmails emails={intake.recentEmails} />
          </div>
        )}
      </FieldSet>
    </section>
  );
}

type RecentEmail = {
  id: string;
  from: string;
  receivedAt: number;
  attachments: Array<{ filename: string; outcome: "created" | "refused"; reason: string | null }>;
};

function RecentEmails({ emails }: { emails: RecentEmail[] }) {
  const t = useTranslations("appForms.intake");
  const locale = useLocale() as Locale;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">{t("recent")}</h3>
      {emails.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noEmails")}</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border text-sm">
          {emails.map((email) => (
            <li key={email.id} className="flex flex-col gap-1 px-3 py-2">
              <div className="flex flex-wrap justify-between gap-x-4">
                <span className="min-w-0 truncate font-medium">{email.from}</span>
                <time className="text-muted-foreground tabular-nums">
                  {new Date(email.receivedAt).toLocaleString(locale === "nl" ? "nl-NL" : "en-GB", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </div>
              {email.attachments.length === 0 ? (
                <p className="text-muted-foreground">{t("noAttachments")}</p>
              ) : (
                <ul className="flex flex-col gap-0.5">
                  {email.attachments.map((a, i) => (
                    <li key={i} className="flex flex-wrap gap-x-2">
                      <span className="min-w-0 truncate">{a.filename}</span>
                      <span
                        className={
                          a.outcome === "created" ? "text-green-700 dark:text-green-500" : "text-destructive"
                        }
                      >
                        {a.outcome === "created"
                          ? t("created")
                          : a.reason && serverErrorText(a.reason, locale)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
