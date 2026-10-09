"use client";

import { useMutation } from "convex/react";
import { Check, FileUp, KeyRound } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "cn";
import { toast } from "sonner";
import { useErrorText } from "../../../error-text";
import { IntakePanel } from "../forms/intake-panel";
import { UploadDialog } from "./upload-dialog";

export type SetupStep = 1 | 2 | 3;
const STEPS = ["form", "system", "input"] as const;

/**
 * The guided setup an Admin sees on Submissions until a Form exists, the System
 * is connected or skipped, and the Input is chosen. Which step is current comes
 * from the server (convex/onboarding.ts), so a refresh resumes here.
 */
export function SetupGuide({
  organisationSlug,
  organisationName,
  step,
  forms,
}: {
  organisationSlug: string;
  organisationName: string;
  step: SetupStep;
  forms: Array<{ id: Id<"forms">; name: string }>;
}) {
  const t = useTranslations("appSubmissions.setup");
  const errorText = useErrorText();
  const failed = (error: unknown) => toast.error(errorText(error, t("tryAgain")));
  const skipSystem = useMutation(api.onboarding.skipSystem);
  const finishInput = useMutation(api.onboarding.finishInput);
  const base = `/app/o/${organisationSlug}`;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 md:px-6">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">
        {t("welcome", { organisation: organisationName })}
      </h1>
      <p className="mt-1 text-muted-foreground">{t("intro")}</p>

      <ol aria-label={t("label")} className="mt-6 flex flex-col gap-2 sm:flex-row sm:gap-3">
        {STEPS.map((name, index) => {
          const number = (index + 1) as SetupStep;
          const status = number < step ? "done" : number === step ? "current" : "todo";
          return (
            <li
              key={name}
              aria-current={status === "current" ? "step" : undefined}
              className={cn(
                "flex flex-1 items-center gap-3 rounded-lg border px-3 py-2 text-sm",
                status === "current" && "border-foreground bg-muted/40 font-medium",
                status === "todo" && "text-muted-foreground",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs tabular-nums",
                  status === "done" && "border-transparent bg-foreground text-background",
                  status === "current" && "border-foreground",
                )}
              >
                {status === "done" ? <Check className="size-3.5" /> : number}
              </span>
              <span>
                {t(`steps.${name}.name`)}
                <span className="sr-only"> ({t(`status.${status}`)})</span>
              </span>
            </li>
          );
        })}
      </ol>
      {/* Announces the new step when the server moves it on. */}
      <p aria-live="polite" className="sr-only">
        {t("announce", { step, name: t(`steps.${STEPS[step - 1]}.name`) })}
      </p>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>{t(`steps.${STEPS[step - 1]}.title`)}</CardTitle>
          <CardDescription>{t(`steps.${STEPS[step - 1]}.description`)}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {step === 1 && (
            <div>
              <Button nativeButton={false} render={<Link href={`${base}/forms/new`} />}>
                {t("steps.form.action")}
              </Button>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-wrap gap-2">
              <Button nativeButton={false} render={<Link href={`${base}/integrations`} />}>
                {t("steps.system.action")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => skipSystem({ organisationSlug }).catch(failed)}
              >
                {t("steps.system.skip")}
              </Button>
            </div>
          )}

          {step === 3 && (
            <>
              <IntakePanel organisationSlug={organisationSlug} formId={null} isAdmin />
              <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
                <div className="flex min-w-0 items-start gap-3">
                  <FileUp className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div>
                    <h3 className="text-sm font-medium">{t("steps.input.uploadTitle")}</h3>
                    <p className="text-sm text-muted-foreground">{t("steps.input.uploadDescription")}</p>
                  </div>
                </div>
                <UploadDialog organisationSlug={organisationSlug} forms={forms} isAdmin />
              </section>
              <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
                <div className="flex min-w-0 items-start gap-3">
                  <KeyRound className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div>
                    <h3 className="text-sm font-medium">{t("steps.input.apiTitle")}</h3>
                    <p className="text-sm text-muted-foreground">{t("steps.input.apiDescription")}</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  nativeButton={false}
                  render={<Link href={`${base}/settings`} />}
                >
                  {t("steps.input.apiAction")}
                </Button>
              </section>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" onClick={() => finishInput({ organisationSlug }).catch(failed)}>
                  {t("steps.input.finish")}
                </Button>
                <p className="text-sm text-muted-foreground">{t("steps.input.finishHint")}</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
