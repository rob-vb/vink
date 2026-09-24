"use client";

import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { ArrowLeft, Asterisk, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "cn";
import {
  allProblems,
  type Draft,
  type DraftField,
  fieldTypes,
  newField,
  subFieldTypes,
  toContent,
} from "./draft";
import { FieldDetail } from "./field-detail";

type Props = {
  organisationSlug: string;
  /** Absent for a new Form: the first save creates it as version 1. */
  form?: { id: Id<"forms">; version: number };
  initial: Draft;
  settings?: React.ReactNode;
  /** A new Form from a Form Proposal: saving it can also process the sample. */
  proposal?: { id: Id<"formProposals">; filename: string };
};

export function FormEditor({ organisationSlug, form, initial, settings, proposal }: Props) {
  const router = useRouter();
  const create = useMutation(api.forms.create);
  const save = useMutation(api.forms.save);
  const saveProposal = useMutation(api.formProposals.save);
  const [processSample, setProcessSample] = useState(true);
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [selectedId, setSelectedId] = useState(initial.fields[0]?.id);
  const [saving, setSaving] = useState(false);

  const dirty = useMemo(
    () => JSON.stringify(toContent(draft)) !== JSON.stringify(toContent(saved)),
    [draft, saved],
  );
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const problems = allProblems(draft.fields);
  const invalid =
    draft.name.trim() === "" || [...problems.values()].some((p) => p.length > 0);
  const parent = draft.fields.find(
    (f) => f.type === "list" && f.fields.some((sub) => sub.id === selectedId),
  );
  const siblings = parent ? parent.fields : draft.fields;
  const selected = siblings.find((f) => f.id === selectedId);

  function addField() {
    const field = newField(draft.fields.map((f) => f.key));
    setDraft({ ...draft, fields: [...draft.fields, field] });
    setSelectedId(field.id);
  }

  function addSubField(list: DraftField) {
    const sub = newField(list.fields.map((f) => f.key));
    replaceField({ ...list, fields: [...list.fields, sub] });
    setSelectedId(sub.id);
  }

  /** Replaces a Field or sub-Field, found by its id. */
  function replaceField(field: DraftField) {
    const replace = (fields: DraftField[]): DraftField[] =>
      fields.map((f) =>
        f.id === field.id ? field : { ...f, fields: replace(f.fields) },
      );
    setDraft({ ...draft, fields: replace(draft.fields) });
  }

  function removeSelected(selected: DraftField) {
    const index = siblings.indexOf(selected);
    const rest = siblings.filter((f) => f.id !== selected.id);
    if (parent) {
      replaceField({ ...parent, fields: rest });
      setSelectedId(rest[Math.min(index, rest.length - 1)]?.id ?? parent.id);
    } else {
      setDraft({ ...draft, fields: rest });
      setSelectedId(rest[Math.min(index, rest.length - 1)]?.id);
    }
  }

  const row = (field: DraftField) => (
    <FieldRow
      field={field}
      selected={field.id === selectedId}
      invalid={problems.get(field.id)!.length > 0}
      onSelect={() => setSelectedId(field.id)}
    />
  );

  async function onSave() {
    setSaving(true);
    try {
      const content = toContent(draft);
      if (form) {
        const { version } = await save({ organisationSlug, formId: form.id, ...content });
        setSaved(draft);
        toast.success(`Saved as version ${version}`);
      } else if (proposal) {
        const { formId, documentId } = await saveProposal({
          organisationSlug,
          proposalId: proposal.id,
          ...content,
          processSample,
        });
        setSaved(draft);
        toast.success(
          documentId ? `Form created. ${proposal.filename} is being read as its first Document.` : "Form created as version 1",
        );
        router.replace(`/o/${organisationSlug}/forms/${formId}`);
      } else {
        const { formId } = await create({ organisationSlug, ...content });
        setSaved(draft);
        toast.success("Form created as version 1");
        router.replace(`/o/${organisationSlug}/forms/${formId}`);
      }
    } catch (error) {
      toast.error(error instanceof ConvexError ? String(error.data) : "Couldn't save the Form");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Back to Forms"
            nativeButton={false}
            render={<Link href={`/o/${organisationSlug}/forms`} />}
          >
            <ArrowLeft />
          </Button>
          <h1 className="truncate text-xl font-semibold">
            {form ? saved.name : "New Form"}
          </h1>
          {form && <Badge variant="outline">v{form.version}</Badge>}
        </div>
        <div className="flex items-center gap-3">
          {dirty && (
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {form ? `Saving creates version ${form.version + 1}` : "Unsaved"}
            </span>
          )}
          <Button onClick={() => void onSave()} disabled={saving || invalid || (form && !dirty)}>
            {saving && <Spinner />}
            {form ? "Save" : "Create Form"}
          </Button>
        </div>
      </div>

      <FieldGroup className="max-w-2xl">
        <Field>
          <FieldLabel htmlFor="form-name">Name</FieldLabel>
          <Input
            id="form-name"
            value={draft.name}
            placeholder="Tyre service report"
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="form-description">Description</FieldLabel>
          <Textarea
            id="form-description"
            value={draft.description}
            placeholder="Optional. Which documents this Form is for."
            className="min-h-16"
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
        </Field>
        {proposal && (
          <Field orientation="horizontal">
            <Checkbox
              id="process-sample"
              checked={processSample}
              onCheckedChange={(checked) => setProcessSample(checked === true)}
            />
            <FieldContent>
              <FieldLabel htmlFor="process-sample">Also process this sample as a Document</FieldLabel>
              <FieldDescription>
                {processSample
                  ? `${proposal.filename} becomes this Form's first Document, from what DocuHelper already read.`
                  : `${proposal.filename} and what DocuHelper read from it are deleted when you create the Form.`}
              </FieldDescription>
            </FieldContent>
          </Field>
        )}
      </FieldGroup>

      <section className="grid gap-4 md:grid-cols-[18rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">
              Fields <span className="text-muted-foreground">{draft.fields.length}</span>
            </h2>
            <Button variant="outline" size="sm" onClick={addField}>
              <Plus />
              Add Field
            </Button>
          </div>
          <ul className="flex flex-col gap-1">
            {draft.fields.map((field) => (
              <li key={field.id}>
                {row(field)}
                {field.type === "list" && (
                  <ul
                    aria-label={`Sub-Fields of ${field.label || "Untitled"}`}
                    className="mt-1 ml-3 flex flex-col gap-1 border-l pl-3"
                  >
                    {field.fields.map((sub) => (
                      <li key={sub.id}>{row(sub)}</li>
                    ))}
                    <li>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground"
                        onClick={() => addSubField(field)}
                      >
                        <Plus />
                        Add sub-Field
                      </Button>
                    </li>
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg border p-4 md:p-6">
          {selected ? (
            <FieldDetail
              key={selected.id}
              field={selected}
              parent={parent}
              types={parent ? subFieldTypes : fieldTypes}
              otherKeys={siblings.filter((f) => f.id !== selected.id).map((f) => f.key)}
              problems={problems.get(selected.id)!}
              onChange={replaceField}
              onAddSubField={() => addSubField(selected)}
              onRemove={() => removeSelected(selected)}
            />
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No Field selected</EmptyTitle>
                <EmptyDescription>
                  Add a Field for each piece of data you want from the document:
                  a license plate, a date, an amount.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button variant="outline" onClick={addField}>
                  <Plus />
                  Add Field
                </Button>
              </EmptyContent>
            </Empty>
          )}
        </div>
      </section>

      {settings}
    </main>
  );
}

function FieldRow({
  field,
  selected,
  invalid,
  onSelect,
}: {
  field: DraftField;
  selected: boolean;
  invalid: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors hover:bg-muted",
        selected && "border-primary bg-muted",
        invalid && "border-destructive/60",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 truncate text-sm font-medium">
          {field.label || <span className="text-muted-foreground">Untitled</span>}
          {field.required && (
            <Asterisk className="size-3 text-destructive" aria-label="Required" />
          )}
        </span>
        <span className="block truncate font-mono text-xs text-muted-foreground">
          {field.key}
        </span>
      </span>
      <Badge variant="secondary">
        {fieldTypes.find((t) => t.value === field.type)!.label}
      </Badge>
    </button>
  );
}
