import { isValidKey, keyFromLabel } from "@/convex/lib/fieldKeys";
import type { Doc } from "@/convex/_generated/dataModel";

// The Form editor's working copy. A save turns it into the next Form Version.

export type Field = Doc<"formVersions">["fields"][number];
export type FieldType = Field["type"];
export type Option = { value: string; description: string };

export type DraftField = {
  id: string;
  label: string;
  key: string;
  /** Once the Admin edits a key, or the Field was saved, the label no longer moves it. */
  keyFollowsLabel: boolean;
  type: FieldType;
  description: string;
  required: boolean;
  // Kept while the type changes, so switching to text and back loses nothing.
  options: Option[];
};

export type Draft = { name: string; description: string; fields: DraftField[] };

export const fieldTypes: { value: FieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "boolean", label: "Yes / no" },
  { value: "choice", label: "Choice" },
];

export function newField(taken: string[]): DraftField {
  return {
    id: crypto.randomUUID(),
    label: "",
    key: keyFromLabel("", taken),
    keyFollowsLabel: true,
    type: "text",
    description: "",
    required: false,
    options: [],
  };
}

export function toDraft(form: {
  name: string;
  description?: string;
  fields: Field[];
}): Draft {
  return {
    name: form.name,
    description: form.description ?? "",
    fields: form.fields.map((field) => ({
      id: crypto.randomUUID(),
      label: field.label,
      key: field.key,
      keyFollowsLabel: false,
      type: field.type,
      description: field.description ?? "",
      required: field.required,
      options:
        field.type === "choice"
          ? field.options.map((o) => ({ value: o.value, description: o.description ?? "" }))
          : [],
    })),
  };
}

const optional = (text: string) => (text.trim() === "" ? undefined : text.trim());

/** What the backend receives on save. */
export function toContent(draft: Draft) {
  return {
    name: draft.name.trim(),
    description: optional(draft.description),
    fields: draft.fields.map((f): Field => {
      const base = {
        label: f.label.trim(),
        key: f.key,
        description: optional(f.description),
        required: f.required,
      };
      return f.type === "choice"
        ? {
            ...base,
            type: "choice",
            options: f.options.map((o) => ({
              value: o.value.trim(),
              description: optional(o.description),
            })),
          }
        : { ...base, type: f.type };
    }),
  };
}

/** The same rules the backend enforces, shown next to the Field while editing. */
export function fieldProblems(field: DraftField, fields: DraftField[]) {
  const problems: string[] = [];
  if (field.label.trim() === "") problems.push("Add a label.");
  if (!isValidKey(field.key)) {
    problems.push("A key is camelCase letters and digits, starting with a lowercase letter.");
  } else if (fields.some((f) => f.id !== field.id && f.key === field.key)) {
    problems.push("Another Field already uses this key.");
  }
  if (field.type === "choice") {
    const values = field.options.map((o) => o.value.trim());
    if (values.length === 0) problems.push("Add at least one option.");
    if (values.some((v) => v === "")) problems.push("Every option needs a value.");
    if (new Set(values).size !== values.length) problems.push("Two options share a value.");
  }
  return problems;
}
