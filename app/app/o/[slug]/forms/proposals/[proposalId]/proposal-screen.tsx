"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ArrowLeft, CircleAlert, CircleCheck, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { useErrorText } from "../../../../../error-text";
import { type FieldType, toDraft } from "../../draft";
import { FormEditor } from "../../form-editor";

type Proposal = FunctionReturnType<typeof api.formProposals.get>;
type Proposed = Proposal["fields"][number];

function Progress({ proposal }: { proposal: Proposal }) {
  const t = useTranslations("appForms.proposal");
  // A description has no sample to read: it goes straight to proposing.
  const steps = [
    ...(proposal.hasSample
      ? [{ label: t("reading", { filename: proposal.filename }), done: proposal.state !== "reading" }]
      : []),
    { label: t("proposing"), done: false },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t(proposal.hasSample ? "progressTitle" : "progressTitleDescribed")}</CardTitle>
        <CardDescription>{t(proposal.hasSample ? "progressDescription" : "progressDescriptionDescribed")}</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col gap-3 text-sm">
          {steps.map((step, i) => {
            const active = !step.done && (i === 0 || steps[i - 1].done);
            return (
              <li key={step.label} className="flex items-center gap-2">
                {step.done ? (
                  <CircleCheck className="size-4 text-emerald-600" />
                ) : active ? (
                  <Spinner />
                ) : (
                  <span className="size-4 rounded-full border" />
                )}
                <span className={cn(!step.done && !active && "text-muted-foreground")}>
                  {step.label}
                </span>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}

function ProposedRow({
  proposed,
  checked,
  onCheckedChange,
}: {
  proposed: Proposed;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const t = useTranslations("appForms");
  const { field } = proposed;
  const id = `proposed-${field.key}`;
  return (
    <li className="flex gap-3 border-b px-4 py-3 last:border-b-0">
      <Checkbox id={id} checked={checked} onCheckedChange={(c) => onCheckedChange(c === true)} className="mt-0.5" />
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{field.label}</span>
          <span className="font-mono text-xs text-muted-foreground">{field.key}</span>
          <Badge variant="secondary">{t(`types.${field.type as FieldType}`)}</Badge>
        </span>
        {field.description && (
          <span className="mt-0.5 block text-sm text-muted-foreground">{field.description}</span>
        )}
        {field.type === "choice" && (
          <span className="mt-1 block text-xs text-muted-foreground">
            {t("proposal.options", { options: field.options.map((o) => o.value).join(", ") })}
          </span>
        )}
        {field.type === "list" && (
          <span className="mt-1 flex flex-wrap gap-1">
            {field.fields.map((sub) => (
              <Badge key={sub.key} variant="outline" className="font-normal">
                {sub.label} <span className="font-mono text-muted-foreground">{sub.key}</span>
              </Badge>
            ))}
          </span>
        )}
      </label>
    </li>
  );
}

/**
 * A Form Proposal: progress while the sample is read, then every proposed
 * Field to keep or untick, then the Form editor with the kept ones.
 */
export function ProposalScreen({
  organisationSlug,
  proposalId,
}: {
  organisationSlug: string;
  proposalId: Id<"formProposals">;
}) {
  const t = useTranslations("appForms");
  const errorText = useErrorText();
  const failed = (error: unknown) => toast.error(errorText(error, t("tryAgain")));
  const router = useRouter();
  const proposal = useQuery(api.formProposals.get, { organisationSlug, proposalId });
  const form = useQuery(
    api.forms.get,
    proposal?.formId ? { organisationSlug, formId: proposal.formId } : "skip",
  );
  const retry = useMutation(api.formProposals.retry);
  const discard = useMutation(api.formProposals.discard);
  const [unticked, setUnticked] = useState<Set<string> | null>(null);
  const [editing, setEditing] = useState(false);

  if (proposal === undefined || (proposal.formId && form === undefined)) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 md:px-6">
        <Skeleton className="h-64" />
      </main>
    );
  }

  // Ticked by the model until the Admin changes it.
  const isChecked = (p: Proposed) => (unticked ? !unticked.has(p.field.key) : p.ticked);
  const toggle = (p: Proposed, checked: boolean) => {
    const next = new Set(unticked ?? proposal.fields.filter((f) => !f.ticked).map((f) => f.field.key));
    if (checked) next.delete(p.field.key);
    else next.add(p.field.key);
    setUnticked(next);
  };
  const kept = proposal.fields.filter(isChecked).map((p) => p.field);

  if (editing) {
    return form ? (
      <FormEditor
        organisationSlug={organisationSlug}
        form={{ id: form.id, version: form.version }}
        initial={toDraft({ ...form, fields: [...form.fields, ...kept] })}
        proposal={{ id: proposalId, filename: proposal.filename, hasSample: proposal.hasSample }}
      />
    ) : (
      <FormEditor
        organisationSlug={organisationSlug}
        initial={toDraft({ name: "", description: proposal.description ?? undefined, fields: kept })}
        proposal={{ id: proposalId, filename: proposal.filename, hasSample: proposal.hasSample }}
      />
    );
  }

  async function startBlank() {
    await discard({ organisationSlug, proposalId }).catch(failed);
    router.push(`/app/o/${organisationSlug}/forms/new?blank=1`);
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-8 md:px-6">
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2"
          nativeButton={false}
          render={<Link href={`/app/o/${organisationSlug}/forms`} />}
        >
          <ArrowLeft />
          {t("proposal.back")}
        </Button>
        <h1 className="text-xl font-semibold">
          {form ? t("proposal.newFieldsFor", { form: form.name }) : t("proposal.title")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {proposal.hasSample
            ? t("proposal.from", { filename: proposal.filename })
            : t("proposal.fromDescription")}
        </p>
      </div>

      {(proposal.state === "reading" || proposal.state === "proposing") && <Progress proposal={proposal} />}

      {proposal.state === "failed" && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>{t("proposal.failedTitle")}</AlertTitle>
          <AlertDescription>
            <p>{t(proposal.failure === "unreadable" ? "proposal.failedUnreadable" : "proposal.failedText")}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => retry({ organisationSlug, proposalId }).catch(failed)}>
                <RotateCcw />
                {t("proposal.retry")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => void startBlank()}>
                {t("proposal.startBlank")}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {proposal.state === "ready" && proposal.fields.length === 0 && !proposal.hasSample && (
        <Alert>
          <CircleAlert />
          <AlertTitle>{t("proposal.noFieldsDescribed")}</AlertTitle>
          <AlertDescription>
            <p>{t("proposal.noFieldsDescribedText")}</p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={() =>
                discard({ organisationSlug, proposalId }).then(
                  () => router.push(`/app/o/${organisationSlug}/forms/new`),
                  failed,
                )
              }
            >
              {t("proposal.describeAgain")}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {proposal.state === "ready" && proposal.fields.length === 0 && proposal.hasSample && (
        <Alert>
          <CircleCheck />
          <AlertTitle>{t("proposal.nothingNew")}</AlertTitle>
          <AlertDescription>
            <p>{t("proposal.nothingNewText", { form: form?.name ?? t("proposal.theForm") })}</p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={() =>
                discard({ organisationSlug, proposalId }).then(
                  () => router.push(`/app/o/${organisationSlug}/forms${form ? `/${form.id}` : ""}`),
                  failed,
                )
              }
            >
              {t("proposal.done")}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {proposal.state === "ready" && proposal.fields.length > 0 && (
        <>
          <p className="text-sm text-muted-foreground">
            {form
              ? t("proposal.onlyNew", { form: form.name })
              : t(proposal.hasSample ? "proposal.everything" : "proposal.everythingDescribed")}{" "}
            {t("proposal.explanation")}
          </p>
          <ul className="overflow-hidden rounded-lg border bg-card">
            {proposal.fields.map((p) => (
              <ProposedRow
                key={p.field.key}
                proposed={p}
                checked={isChecked(p)}
                onCheckedChange={(checked) => toggle(p, checked)}
              />
            ))}
          </ul>
          <div className="sticky bottom-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background p-3 shadow-md">
            <p className="text-sm text-muted-foreground tabular-nums">
              {t("proposal.kept", { kept: kept.length, total: proposal.fields.length })}
            </p>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                onClick={() =>
                  discard({ organisationSlug, proposalId }).then(
                    () => router.push(`/app/o/${organisationSlug}/forms`),
                    failed,
                  )
                }
              >
                {t("proposal.discard")}
              </Button>
              <Button disabled={kept.length === 0} onClick={() => setEditing(true)}>
                {t("proposal.continue")}
              </Button>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
