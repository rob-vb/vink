"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";
import { ArrowLeft, CircleAlert, CircleCheck, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { fieldTypes, toDraft } from "../../draft";
import { FormEditor } from "../../form-editor";

type Proposal = FunctionReturnType<typeof api.formProposals.get>;
type Proposed = Proposal["fields"][number];

const typeLabel = (type: string) => fieldTypes.find((t) => t.value === type)?.label ?? type;

function failed(error: unknown) {
  toast.error(error instanceof ConvexError ? String(error.data) : "That didn't work. Try again.");
}

function Progress({ proposal }: { proposal: Proposal }) {
  const steps = [
    { label: `Reading ${proposal.filename}`, done: proposal.state !== "reading" },
    { label: "Proposing Fields", done: false },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Vink is reading your sample</CardTitle>
        <CardDescription>
          This takes a minute or two. You can leave this page: the proposal waits for you under
          Forms.
        </CardDescription>
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
  const { field } = proposed;
  const id = `proposed-${field.key}`;
  return (
    <li className="flex gap-3 border-b px-4 py-3 last:border-b-0">
      <Checkbox id={id} checked={checked} onCheckedChange={(c) => onCheckedChange(c === true)} className="mt-0.5" />
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{field.label}</span>
          <span className="font-mono text-xs text-muted-foreground">{field.key}</span>
          <Badge variant="secondary">{typeLabel(field.type)}</Badge>
        </span>
        {field.description && (
          <span className="mt-0.5 block text-sm text-muted-foreground">{field.description}</span>
        )}
        {field.type === "choice" && (
          <span className="mt-1 block text-xs text-muted-foreground">
            Options: {field.options.map((o) => o.value).join(", ")}
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
        proposal={{ id: proposalId, filename: proposal.filename }}
      />
    ) : (
      <FormEditor
        organisationSlug={organisationSlug}
        initial={toDraft({ name: "", fields: kept })}
        proposal={{ id: proposalId, filename: proposal.filename }}
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
          Forms
        </Button>
        <h1 className="text-xl font-semibold">
          {form ? `New Fields for ${form.name}` : "Proposed Fields"}
        </h1>
        <p className="text-sm text-muted-foreground">From {proposal.filename}</p>
      </div>

      {(proposal.state === "reading" || proposal.state === "proposing") && <Progress proposal={proposal} />}

      {proposal.state === "failed" && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Vink couldn&apos;t propose Fields from this sample</AlertTitle>
          <AlertDescription>
            {proposal.error && (
              <p className="line-clamp-2 font-mono text-xs break-all opacity-80">{proposal.error}</p>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => retry({ organisationSlug, proposalId }).catch(failed)}>
                <RotateCcw />
                Retry
              </Button>
              <Button size="sm" variant="outline" onClick={() => void startBlank()}>
                Start blank
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {proposal.state === "ready" && proposal.fields.length === 0 && (
        <Alert>
          <CircleCheck />
          <AlertTitle>Nothing new</AlertTitle>
          <AlertDescription>
            <p>{form?.name ?? "The Form"} already places everything Vink found on this sample.</p>
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
              Done
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {proposal.state === "ready" && proposal.fields.length > 0 && (
        <>
          <p className="text-sm text-muted-foreground">
            {form
              ? `Only what ${form.name} can't place yet is listed.`
              : "Everything on the sample is listed."}{" "}
            What serves this kind of document is ticked; untick
            what your system doesn&apos;t need. You can still edit every Field next. None is
            required yet: decide that on purpose, because a required Field blocks Auto-Send.
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
              {kept.length} of {proposal.fields.length} Fields kept
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
                Discard
              </Button>
              <Button disabled={kept.length === 0} onClick={() => setEditing(true)}>
                Continue to the Form editor
              </Button>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
