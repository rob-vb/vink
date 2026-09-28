"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { keyFromLabel } from "@/convex/lib/fieldKeys";
import { type DraftField, type FieldType, fieldTypes } from "./draft";

export function FieldDetail({
  field,
  parent,
  types,
  otherKeys,
  problems,
  onChange,
  onAddSubField,
}: {
  field: DraftField;
  /** The List Field this sub-Field belongs to; absent for a top-level Field. */
  parent?: DraftField;
  /** A sub-Field is offered every type but List. */
  types: typeof fieldTypes;
  otherKeys: string[];
  problems: string[];
  onChange: (field: DraftField) => void;
  onAddSubField: () => void;
}) {
  const set = (patch: Partial<DraftField>) => onChange({ ...field, ...patch });
  const setOption = (index: number, patch: Partial<DraftField["options"][number]>) =>
    set({
      options: field.options.map((o, i) => (i === index ? { ...o, ...patch } : o)),
    });

  return (
    <div className="flex flex-col gap-6">
      {parent && (
        <p className="text-sm text-muted-foreground">
          Sub-Field of{" "}
          <span className="font-medium text-foreground">{parent.label || "Untitled"}</span>.
          Every entry of the List has one.
        </p>
      )}
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="field-label">Label</FieldLabel>
          <Input
            id="field-label"
            value={field.label}
            placeholder="Kenteken"
            autoFocus={field.label === ""}
            onChange={(e) => {
              const label = e.target.value;
              set(
                field.keyFollowsLabel
                  ? { label, key: keyFromLabel(label, otherKeys) }
                  : { label },
              );
            }}
          />
          <FieldDescription>Shown to your team. Any language.</FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="field-key">Key</FieldLabel>
          <Input
            id="field-key"
            className="font-mono"
            value={field.key}
            spellCheck={false}
            autoComplete="off"
            readOnly={field.locked}
            onChange={(e) => set({ key: e.target.value.trim(), keyFollowsLabel: false })}
          />
          <FieldDescription>
            The name in the Payload your system receives, in camelCase.
            {field.locked && (
              <> Locked while an Integration is attached, so your system keeps receiving it.</>
            )}
            {!field.locked && !field.keyFollowsLabel && field.label.trim() !== "" && (
              <>
                {" "}
                <button
                  type="button"
                  className="underline underline-offset-4 hover:text-foreground"
                  onClick={() =>
                    set({ key: keyFromLabel(field.label, otherKeys), keyFollowsLabel: true })
                  }
                >
                  Derive from label
                </button>
              </>
            )}
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="field-type">Type</FieldLabel>
          <Select
            items={types}
            value={field.type}
            disabled={field.locked && field.type === "list"}
            onValueChange={(type) => type && set({ type: type as FieldType })}
          >
            <SelectTrigger id="field-type" className="w-full sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {types.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field>
          <FieldLabel htmlFor="field-description">Description</FieldLabel>
          <Textarea
            id="field-description"
            value={field.description}
            placeholder="Other words the paper may use, e.g. delivery date, Lieferdatum, date de livraison"
            onChange={(e) => set({ description: e.target.value })}
          />
          <FieldDescription>
            Optional. Synonyms and other languages help DocuHelper find this Field
            on differently worded documents.
          </FieldDescription>
        </Field>

        <Field orientation="horizontal">
          <Switch
            id="field-required"
            checked={field.required}
            onCheckedChange={(required) => set({ required })}
          />
          <FieldContent>
            <FieldLabel htmlFor="field-required">Required</FieldLabel>
            <FieldDescription>
              {field.type === "list"
                ? "A Document without at least one entry always needs review before it is sent."
                : parent
                  ? "An entry without it always needs review before the Document is sent."
                  : "A Document without it always needs review before it is sent."}
            </FieldDescription>
          </FieldContent>
        </Field>
      </FieldGroup>

      {field.type === "choice" && (
        <FieldSet>
          <FieldLegend>Options</FieldLegend>
          <FieldDescription>
            The value is what your system receives. The description lists what the
            paper may say instead: synonyms, abbreviations, other languages.
          </FieldDescription>
          <div className="flex flex-col gap-2">
            {field.options.map((option, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="grid flex-1 gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                  <Input
                    aria-label={`Option ${i + 1} value`}
                    className="font-mono"
                    placeholder="winter"
                    value={option.value}
                    onChange={(e) => setOption(i, { value: e.target.value })}
                  />
                  <Input
                    aria-label={`Option ${i + 1} description`}
                    placeholder="Optional: winterband, M+S, 3PMSF"
                    value={option.description}
                    onChange={(e) => setOption(i, { description: e.target.value })}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove option ${i + 1}`}
                  onClick={() => set({ options: field.options.filter((_, j) => j !== i) })}
                >
                  <X />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() =>
                set({ options: [...field.options, { value: "", description: "" }] })
              }
            >
              <Plus />
              Add option
            </Button>
          </div>
        </FieldSet>
      )}

      {field.type === "list" && (
        <FieldSet>
          <FieldLegend>Sub-Fields</FieldLegend>
          <FieldDescription>
            A List holds one entry per item on the document, for example per changed
            tyre or per invoice line. Each entry has these sub-Fields.
            {field.fields.length > 0 &&
              ` This List has ${field.fields.length}; select one in the Field list to edit it.`}
          </FieldDescription>
          <Button variant="outline" size="sm" className="self-start" onClick={onAddSubField}>
            <Plus />
            Add sub-Field
          </Button>
        </FieldSet>
      )}

      {problems.length > 0 && (
        <FieldError errors={problems.map((message) => ({ message }))} />
      )}
    </div>
  );
}
