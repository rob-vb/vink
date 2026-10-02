"use client";

import { Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
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
import { type DraftField, type FieldProblem, type FieldType, fieldTypes } from "./draft";

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
  problems: FieldProblem[];
  onChange: (field: DraftField) => void;
  onAddSubField: () => void;
}) {
  const t = useTranslations("appForms");
  const items = types.map((type) => ({ value: type, label: t(`types.${type}`) }));
  const set = (patch: Partial<DraftField>) => onChange({ ...field, ...patch });
  const setOption = (index: number, patch: Partial<DraftField["options"][number]>) =>
    set({
      options: field.options.map((o, i) => (i === index ? { ...o, ...patch } : o)),
    });

  return (
    <div className="flex flex-col gap-6">
      {parent && (
        <p className="text-sm text-muted-foreground">
          {t.rich("field.subFieldOf", {
            label: parent.label || t("untitled"),
            parent: (chunks) => <span className="font-medium text-foreground">{chunks}</span>,
          })}
        </p>
      )}
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="field-label">{t("field.label")}</FieldLabel>
          <Input
            id="field-label"
            value={field.label}
            placeholder={t("field.labelPlaceholder")}
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
          <FieldDescription>{t("field.labelDescription")}</FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="field-key">{t("field.key")}</FieldLabel>
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
            {t("field.keyDescription")}
            {field.locked && <> {t("field.keyLocked")}</>}
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
                  {t("field.deriveKey")}
                </button>
              </>
            )}
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="field-type">{t("field.type")}</FieldLabel>
          <Select
            items={items}
            value={field.type}
            disabled={field.locked && field.type === "list"}
            onValueChange={(type) => type && set({ type: type as FieldType })}
          >
            <SelectTrigger id="field-type" className="w-full sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {items.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field>
          <FieldLabel htmlFor="field-description">{t("field.description")}</FieldLabel>
          <Textarea
            id="field-description"
            value={field.description}
            placeholder={t("field.descriptionPlaceholder")}
            onChange={(e) => set({ description: e.target.value })}
          />
          <FieldDescription>{t("field.descriptionHelp")}</FieldDescription>
        </Field>

        <Field orientation="horizontal">
          <Switch
            id="field-required"
            checked={field.required}
            onCheckedChange={(required) => set({ required })}
          />
          <FieldContent>
            <FieldLabel htmlFor="field-required">{t("field.required")}</FieldLabel>
            <FieldDescription>
              {field.type === "list"
                ? t("field.requiredList")
                : parent
                  ? t("field.requiredSubField")
                  : t("field.requiredField")}
            </FieldDescription>
          </FieldContent>
        </Field>
      </FieldGroup>

      {field.type === "choice" && (
        <FieldSet>
          <FieldLegend>{t("field.options")}</FieldLegend>
          <FieldDescription>{t("field.optionsDescription")}</FieldDescription>
          <div className="flex flex-col gap-2">
            {field.options.map((option, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="grid flex-1 gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                  <Input
                    aria-label={t("field.optionValue", { number: i + 1 })}
                    className="font-mono"
                    placeholder="winter"
                    value={option.value}
                    onChange={(e) => setOption(i, { value: e.target.value })}
                  />
                  <Input
                    aria-label={t("field.optionDescription", { number: i + 1 })}
                    placeholder={t("field.optionDescriptionPlaceholder")}
                    value={option.description}
                    onChange={(e) => setOption(i, { description: e.target.value })}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("field.removeOption", { number: i + 1 })}
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
              {t("field.addOption")}
            </Button>
          </div>
        </FieldSet>
      )}

      {field.type === "list" && (
        <FieldSet>
          <FieldLegend>{t("field.subFields")}</FieldLegend>
          <FieldDescription>
            {t("field.subFieldsDescription")}
            {field.fields.length > 0 &&
              ` ${t("field.subFieldsCount", { count: field.fields.length })}`}
          </FieldDescription>
          <Button variant="outline" size="sm" className="self-start" onClick={onAddSubField}>
            <Plus />
            {t("field.addSubField")}
          </Button>
        </FieldSet>
      )}

      {problems.length > 0 && (
        <FieldError errors={problems.map((problem) => ({ message: t(`problems.${problem}`) }))} />
      )}
    </div>
  );
}
