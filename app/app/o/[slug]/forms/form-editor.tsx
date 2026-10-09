"use client";

import { useMutation } from "convex/react";
import {
  ArrowLeft,
  Asterisk,
  Calendar,
  ChevronDown,
  ChevronUp,
  CircleDot,
  Hash,
  type LucideIcon,
  Plus,
  Rows3,
  Search,
  Sparkles,
  ToggleLeft,
  Trash2,
  Type,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "cn";
import { useErrorText } from "../../../error-text";
import {
  allProblems,
  type Draft,
  type DraftField,
  type FieldType,
  fieldTypes,
  newField,
  subFieldTypes,
  toContent,
} from "./draft";
import { FieldDetail } from "./field-detail";
import { SampleUpload } from "./sample-upload";

const typeIcons: Record<FieldType, LucideIcon> = {
  text: Type,
  number: Hash,
  date: Calendar,
  boolean: ToggleLeft,
  choice: CircleDot,
  list: Rows3,
};

type Props = {
  organisationSlug: string;
  /** Absent for a new Form: the first save creates it as version 1. */
  form?: { id: Id<"forms">; version: number };
  initial: Draft;
  settings?: React.ReactNode;
  /**
   * From a Form Proposal: a new Form (saving can also process the sample, if
   * it has one: a description in words has none), or with `form`, the Form
   * extended by "Suggest Fields from PDF".
   */
  proposal?: { id: Id<"formProposals">; filename: string; hasSample: boolean };
};

/**
 * Two tabs: the Fields, as a searchable list next to the selected Field, each
 * scrolling on its own so a Form with dozens of Fields stays workable; and the
 * Settings, with the name and description and the Form's review settings.
 */
export function FormEditor({ organisationSlug, form, initial, settings, proposal }: Props) {
  const t = useTranslations("appForms.editor");
  const tForms = useTranslations("appForms");
  const errorText = useErrorText();
  const router = useRouter();
  const create = useMutation(api.forms.create);
  const save = useMutation(api.forms.save);
  const saveProposal = useMutation(api.formProposals.save);
  const saveSuggestions = useMutation(api.formProposals.saveToForm);
  const [processSample, setProcessSample] = useState(true);
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [selectedId, setSelectedId] = useState(initial.fields[0]?.id);
  const [saving, setSaving] = useState(false);
  // A new Form starts where it gets its name.
  const [tab, setTab] = useState(initial.name.trim() === "" ? "settings" : "fields");
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);

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
  const unnamed = draft.name.trim() === "";
  const invalidFields = [...problems.values()].filter((p) => p.length > 0).length;
  const invalid = unnamed || invalidFields > 0;
  const parent = draft.fields.find(
    (f) => f.type === "list" && f.fields.some((sub) => sub.id === selectedId),
  );
  const siblings = parent ? parent.fields : draft.fields;
  const selected = siblings.find((f) => f.id === selectedId);

  // Fields and sub-Fields in list order, as far as the search leaves them.
  const needle = query.trim().toLowerCase();
  const matches = (f: DraftField) =>
    f.label.toLowerCase().includes(needle) || f.key.toLowerCase().includes(needle);
  const visible = draft.fields.flatMap((f) => {
    const subs = f.fields.filter((sub) => needle === "" || matches(f) || matches(sub));
    return needle === "" || matches(f) || subs.length > 0 ? [{ field: f, subs }] : [];
  });
  const order = visible.flatMap(({ field, subs }) => [field, ...subs]);
  const position = order.findIndex((f) => f.id === selectedId);

  // Keep the selected Field in view in the list, e.g. after "next" or adding one.
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-field-id="${selectedId}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  function select(id: string, { focus = false, reveal = false } = {}) {
    setSelectedId(id);
    if (focus) {
      listRef.current?.querySelector<HTMLElement>(`[data-field-id="${id}"]`)?.focus();
    }
    // Stacked on a narrow screen: the detail is below the list.
    if (reveal && !window.matchMedia("(min-width: 768px)").matches) {
      detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function step(by: number, options?: { focus?: boolean }) {
    const next = order[position + by];
    if (next) select(next.id, options);
  }

  function addField() {
    const field = newField(draft.fields.map((f) => f.key));
    setDraft({ ...draft, fields: [...draft.fields, field] });
    setQuery("");
    select(field.id, { reveal: true });
  }

  function addSubField(list: DraftField) {
    const sub = newField(list.fields.map((f) => f.key));
    replaceField({ ...list, fields: [...list.fields, sub] });
    setQuery("");
    select(sub.id, { reveal: true });
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
      onSelect={() => select(field.id, { reveal: true })}
    />
  );

  async function onSave() {
    setSaving(true);
    try {
      const content = toContent(draft);
      if (form && proposal) {
        const { version } = await saveSuggestions({ organisationSlug, proposalId: proposal.id, ...content });
        setSaved(draft);
        toast.success(t("savedAsVersion", { version }));
        router.replace(`/app/o/${organisationSlug}/forms/${form.id}`);
      } else if (form) {
        const { version } = await save({ organisationSlug, formId: form.id, ...content });
        setSaved(draft);
        toast.success(t("savedAsVersion", { version }));
      } else if (proposal) {
        const { formId, submissionId } = await saveProposal({
          organisationSlug,
          proposalId: proposal.id,
          ...content,
          // A description has no sample to process.
          processSample: proposal.hasSample && processSample,
        });
        setSaved(draft);
        toast.success(
          submissionId
            ? t("createdWithSample", { filename: proposal.filename })
            : t("created"),
        );
        router.replace(`/app/o/${organisationSlug}/forms/${formId}`);
      } else {
        const { formId } = await create({ organisationSlug, ...content });
        setSaved(draft);
        toast.success(t("created"));
        router.replace(`/app/o/${organisationSlug}/forms/${formId}`);
      }
    } catch (error) {
      toast.error(errorText(error, t("saveFailed")));
    } finally {
      setSaving(false);
    }
  }

  // Why Save is disabled, or what saving will do.
  const status = unnamed
    ? t("nameInSettings")
    : invalidFields > 0
      ? t("fieldsNeedFixing", { count: invalidFields })
      : dirty || proposal
        ? form
          ? t("savingCreates", { version: form.version + 1 })
          : t("unsaved")
        : null;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-4 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("back")}
            nativeButton={false}
            render={<Link href={`/app/o/${organisationSlug}/forms`} />}
          >
            <ArrowLeft />
          </Button>
          <h1 className="truncate text-xl font-semibold">
            {form ? saved.name : draft.name.trim() || t("newForm")}
          </h1>
          {form && <Badge variant="outline">v{form.version}</Badge>}
        </div>
        <div className="flex items-center gap-3">
          {form && !proposal && (
            <Dialog>
              <DialogTrigger render={<Button variant="outline" />}>
                <Sparkles />
                {t("suggest")}
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("suggestTitle")}</DialogTitle>
                  <DialogDescription>{t("suggestDescription")}</DialogDescription>
                </DialogHeader>
                <SampleUpload organisationSlug={organisationSlug} formId={form.id} />
              </DialogContent>
            </Dialog>
          )}
          {status && (
            <span
              className={cn(
                "hidden text-sm sm:inline",
                invalidFields > 0 ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {status}
            </span>
          )}
          <Button onClick={() => void onSave()} disabled={saving || invalid || (form && !proposal && !dirty)}>
            {saving && <Spinner />}
            {form ? t("save") : t("create")}
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="gap-4">
        <TabsList variant="line">
          <TabsTrigger value="fields">
            {t("fieldsTab")}
            <Badge variant="secondary" className="tabular-nums">
              {draft.fields.length}
            </Badge>
            {invalidFields > 0 && <ProblemDot label={t("fieldsProblem")} />}
          </TabsTrigger>
          <TabsTrigger value="settings">
            {t("settingsTab")}
            {unnamed && <ProblemDot label={t("settingsProblem")} />}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="fields">
          {/* From md up, both panes fill the rest of the viewport and scroll on their own. */}
          <div className="grid gap-4 md:h-[calc(100dvh-11.5rem-1px)] md:min-h-96 md:grid-cols-[18rem_minmax(0,1fr)]">
            <div className="flex max-h-96 min-h-0 flex-col rounded-lg border md:max-h-none">
              <div className="flex items-center gap-2 border-b p-2">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="search"
                    aria-label={t("search")}
                    placeholder={t("search")}
                    className="pl-8"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button variant="outline" size="icon" aria-label={t("addField")} onClick={addField} />
                    }
                  >
                    <Plus />
                  </TooltipTrigger>
                  <TooltipContent>{t("addField")}</TooltipContent>
                </Tooltip>
              </div>
              <div
                ref={listRef}
                className="min-h-0 flex-1 overflow-y-auto p-2"
                onKeyDown={(e) => {
                  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
                  if (!(e.target instanceof HTMLElement) || !e.target.dataset.fieldId) return;
                  e.preventDefault();
                  step(e.key === "ArrowDown" ? 1 : -1, { focus: true });
                }}
              >
                {draft.fields.length > 0 && visible.length === 0 && (
                  <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                    {t("noMatch", { query: query.trim() })}
                  </p>
                )}
                <ul className="flex flex-col gap-0.5">
                  {visible.map(({ field, subs }) => (
                    <li key={field.id}>
                      {row(field)}
                      {field.type === "list" && (
                        <ul
                          aria-label={t("subFieldsOf", { label: field.label || tForms("untitled") })}
                          className="my-0.5 ml-4 flex flex-col gap-0.5 border-l pl-2"
                        >
                          {subs.map((sub) => (
                            <li key={sub.id}>{row(sub)}</li>
                          ))}
                          {needle === "" && (
                            <li>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-muted-foreground"
                                onClick={() => addSubField(field)}
                              >
                                <Plus />
                                {t("addSubField")}
                              </Button>
                            </li>
                          )}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
                {needle === "" && draft.fields.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-1 text-muted-foreground"
                    onClick={addField}
                  >
                    <Plus />
                    {t("addField")}
                  </Button>
                )}
              </div>
            </div>

            <div
              ref={detailRef}
              className="flex min-h-0 scroll-mt-4 flex-col rounded-lg border"
            >
              {selected ? (
                <>
                  <div className="flex items-center gap-2 border-b py-2 pr-2 pl-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {selected.label || (
                          <span className="text-muted-foreground">{tForms("untitled")}</span>
                        )}
                      </p>
                      <p className="truncate font-mono text-xs text-muted-foreground">
                        {selected.key}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("previous")}
                      disabled={position <= 0}
                      onClick={() => step(-1)}
                    >
                      <ChevronUp />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("next")}
                      disabled={position < 0 || position >= order.length - 1}
                      onClick={() => step(1)}
                    >
                      <ChevronDown />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      disabled={selected.locked}
                      title={selected.locked ? t("locked") : undefined}
                      onClick={() => removeSelected(selected)}
                    >
                      <Trash2 />
                      {t("remove")}
                    </Button>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
                    <FieldDetail
                      key={selected.id}
                      field={selected}
                      parent={parent}
                      types={parent ? subFieldTypes : fieldTypes}
                      otherKeys={siblings.filter((f) => f.id !== selected.id).map((f) => f.key)}
                      problems={problems.get(selected.id)!}
                      onChange={replaceField}
                      onAddSubField={() => addSubField(selected)}
                    />
                  </div>
                </>
              ) : (
                <Empty className="flex-1">
                  <EmptyHeader>
                    <EmptyTitle>{t("noneSelected")}</EmptyTitle>
                    <EmptyDescription>{t("noneSelectedDescription")}</EmptyDescription>
                  </EmptyHeader>
                  <EmptyContent>
                    <Button variant="outline" onClick={addField}>
                      <Plus />
                      {t("addField")}
                    </Button>
                  </EmptyContent>
                </Empty>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Kept mounted, so unsaved settings survive a look at the Fields. */}
        <TabsContent value="settings" keepMounted className="flex max-w-2xl flex-col gap-6">
          <section className="rounded-lg border p-4 md:p-6">
            <FieldSet>
              <FieldLegend>{t("general")}</FieldLegend>
              <FieldDescription>{form ? t("generalVersioned") : t("generalNew")}</FieldDescription>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="form-name">{t("name")}</FieldLabel>
                  <Input
                    id="form-name"
                    value={draft.name}
                    placeholder={t("namePlaceholder")}
                    autoFocus={unnamed}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="form-description">{t("description")}</FieldLabel>
                  <Textarea
                    id="form-description"
                    value={draft.description}
                    placeholder={t("descriptionPlaceholder")}
                    className="min-h-16"
                    onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  />
                </Field>
                {proposal?.hasSample && !form && (
                  <Field orientation="horizontal">
                    <Checkbox
                      id="process-sample"
                      checked={processSample}
                      onCheckedChange={(checked) => setProcessSample(checked === true)}
                    />
                    <FieldContent>
                      <FieldLabel htmlFor="process-sample">{t("processSample")}</FieldLabel>
                      <FieldDescription>
                        {t(processSample ? "processSampleOn" : "processSampleOff", {
                          filename: proposal.filename,
                        })}
                      </FieldDescription>
                    </FieldContent>
                  </Field>
                )}
              </FieldGroup>
            </FieldSet>
          </section>
          {settings}
        </TabsContent>
      </Tabs>
    </main>
  );
}

function ProblemDot({ label }: { label: string }) {
  return (
    <span className="size-1.5 rounded-full bg-destructive" role="img" aria-label={label} />
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
  const t = useTranslations("appForms");
  const Icon = typeIcons[field.type];
  return (
    <button
      type="button"
      data-field-id={field.id}
      onClick={onSelect}
      aria-current={selected}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50",
        selected && "bg-muted font-medium",
        invalid && "text-destructive",
      )}
    >
      <Icon
        className={cn("size-4 shrink-0", !invalid && "text-muted-foreground")}
        aria-label={t(`types.${field.type}`)}
      />
      <span className="min-w-0 flex-1 truncate">
        {field.label || <span className="text-muted-foreground">{t("untitled")}</span>}
      </span>
      {field.required && (
        <Asterisk className="size-3 shrink-0 text-destructive" aria-label={t("editor.required")} />
      )}
    </button>
  );
}
