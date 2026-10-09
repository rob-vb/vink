import { isValidKey, keyFromLabel } from "@/convex/lib/fieldKeys";
import type { Doc } from "@/convex/_generated/dataModel";

// The Form editor's working copy. A save turns it into the next Form Version.

export type Field = Doc<"formVersions">["fields"][number];
export type FieldType = Field["type"];
type FlatField = Exclude<Field, { type: "list" }>;
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
  // Both kept while the type changes, so switching to text and back loses nothing.
  options: Option[];
  /** A List Field's sub-Fields. They are never lists themselves. */
  fields: DraftField[];
  /** Saved while an Integration is attached: its key can't change and it can't be removed. */
  locked?: boolean;
};

export type Draft = { name: string; description: string; fields: DraftField[] };

/** In the editor's order; their names are `appForms.types.<type>`. */
export const fieldTypes: FieldType[] = ["text", "number", "date", "boolean", "choice", "list"];

/** A sub-Field can be any type but a list. */
export const subFieldTypes = fieldTypes.filter((t) => t !== "list");

/** What can be wrong with a Field; the words are `appForms.problems.<problem>`. */
export type FieldProblem =
  | "label"
  | "key"
  | "duplicate"
  | "duplicateSub"
  | "noOptions"
  | "emptyOption"
  | "sharedOption"
  | "noSubFields";

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
    fields: [],
  };
}

export function toDraft(form: {
  name: string;
  description?: string;
  fields: Field[];
  keysLocked?: boolean;
}): Draft {
  return {
    name: form.name,
    description: form.description ?? "",
    fields: form.fields.map((f) => toDraftField(f, form.keysLocked ?? false)),
  };
}

function toDraftField(field: Field, locked: boolean): DraftField {
  return {
    locked,
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
    fields: field.type === "list" ? field.fields.map((f) => toDraftField(f, locked)) : [],
  };
}

const optional = (text: string) => (text.trim() === "" ? undefined : text.trim());

/** What the backend receives on save. */
export function toContent(draft: Draft) {
  return {
    name: draft.name.trim(),
    description: optional(draft.description),
    fields: draft.fields.map(toField),
  };
}

function toField(f: DraftField): Field {
  return f.type === "list"
    ? { ...toBase(f), type: "list", fields: f.fields.map(toFlatField) }
    : toFlatField(f);
}

function toFlatField(f: DraftField): FlatField {
  const base = toBase(f);
  if (f.type === "choice") {
    return {
      ...base,
      type: "choice",
      options: f.options.map((o) => ({
        value: o.value.trim(),
        description: optional(o.description),
      })),
    };
  }
  // The editor never offers a list sub-Field; the backend refuses one too.
  return { ...base, type: f.type as Exclude<FieldType, "choice" | "list"> };
}

function toBase(f: DraftField) {
  return {
    label: f.label.trim(),
    key: f.key,
    description: optional(f.description),
    required: f.required,
  };
}

/**
 * The same rules the backend enforces, shown next to the Field while editing.
 * `siblings` are the top-level Fields, or the sub-Fields of the same List Field.
 */
export function fieldProblems(
  field: DraftField,
  siblings: DraftField[],
  duplicate: FieldProblem = "duplicate",
) {
  const problems: FieldProblem[] = [];
  if (field.label.trim() === "") problems.push("label");
  // A locked key can't change, so one saved before keys were snake_case stays.
  if (!isValidKey(field.key) && !field.locked) {
    problems.push("key");
  } else if (siblings.some((f) => f.id !== field.id && f.key === field.key)) {
    problems.push(duplicate);
  }
  if (field.type === "choice") {
    const values = field.options.map((o) => o.value.trim());
    if (values.length === 0) problems.push("noOptions");
    if (values.some((v) => v === "")) problems.push("emptyOption");
    if (new Set(values).size !== values.length) problems.push("sharedOption");
  }
  if (field.type === "list" && field.fields.length === 0) {
    problems.push("noSubFields");
  }
  return problems;
}

/** Every Field and sub-Field, each with the siblings its key must differ from. */
export function allProblems(fields: DraftField[]) {
  const problems = new Map<string, FieldProblem[]>();
  for (const field of fields) {
    problems.set(field.id, fieldProblems(field, fields));
    if (field.type !== "list") continue;
    for (const sub of field.fields) {
      problems.set(
        sub.id,
        fieldProblems(sub, field.fields, "duplicateSub"),
      );
    }
  }
  return problems;
}
