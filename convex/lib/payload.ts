// The Payload (spec, Payload and Delivery): the JSON built from a Submission's
// Field Values, keyed by the Form's Fields, and the envelope around it. Every
// key on the wire is snake_case (ADR 0005) and always there: `null` for no value, `[]` for a List without entries.
import type { Infer } from "convex/values";
import type { field } from "../schema";
import type { FilledValue, FlatField } from "./pipeline";

type Field = Infer<typeof field>;
type Entry = Record<string, FilledValue>;
export type Payload = Record<string, FilledValue | Entry[]>;

export function payloadOf(
  fields: Field[],
  values: { fields: Record<string, FilledValue>; lists: Record<string, Entry[]> },
): Payload {
  return Object.fromEntries(
    fields.map((f) =>
      f.type === "list"
        ? [
            f.key,
            (values.lists[f.key] ?? []).map((entry) =>
              Object.fromEntries(f.fields.map((s) => [s.key, entry[s.key] ?? null])),
            ),
          ]
        : [f.key, values.fields[f.key] ?? null],
    ),
  );
}

function example(f: FlatField): FilledValue {
  switch (f.type) {
    case "text":
      return `Example ${f.label}`;
    case "number":
      return 123.45;
    case "date":
      return "2026-01-31";
    case "boolean":
      return true;
    case "choice":
      return f.options[0]?.value ?? null;
  }
}

/**
 * Dummy data for a test-send: an example value of each Field's type, or with
 * `empty`, every optional value left out so the receiver sees `null` and `[]`.
 */
export function dummyPayload(fields: Field[], mode: "examples" | "empty"): Payload {
  const value = (f: FlatField) => (mode === "empty" && !f.required ? null : example(f));
  return Object.fromEntries(
    fields.map((f) =>
      f.type === "list"
        ? [
            f.key,
            mode === "empty" && !f.required
              ? []
              : [Object.fromEntries(f.fields.map((s) => [s.key, value(s)]))],
          ]
        : [f.key, value(f)],
    ),
  );
}

// The envelope as a JSON Schema, for platforms that build their fields from a
// schema (Power Automate's dynamic schema). Swagger 2.0 style, as Power
// Automate reads it: one `type` each, `x-nullable` for "can be null", and the
// label as `title` and `x-ms-summary` (what Power Automate shows).
type JsonSchema = Record<string, unknown>;

const titled = (summary: string, schema: JsonSchema, nullable = false): JsonSchema => ({
  ...schema,
  "x-ms-summary": summary,
  ...(nullable ? { "x-nullable": true } : {}),
});

function valueSchema(f: FlatField): JsonSchema {
  const type: JsonSchema =
    f.type === "date"
      ? { type: "string", format: "date" }
      : f.type === "choice"
        ? { type: "string", enum: f.options.map((o) => o.value) }
        : { type: f.type === "text" ? "string" : f.type };
  return { ...type, title: f.label, "x-ms-summary": f.label, "x-nullable": true };
}

function fieldSchema(f: Field): JsonSchema {
  if (f.type !== "list") return valueSchema(f);
  return {
    type: "array",
    title: f.label,
    "x-ms-summary": f.label,
    items: { type: "object", properties: Object.fromEntries(f.fields.map((s) => [s.key, valueSchema(s)])) },
  };
}

/** The JSON Schema of the envelope a Form's Approvals send, with one property per Field under `data`. */
export function envelopeSchema(fields: Field[]): JsonSchema {
  const object = (properties: Record<string, JsonSchema>) => ({ type: "object", properties });
  return object({
    event: titled("Event", { type: "string" }),
    delivery_id: titled("Delivery ID", { type: "string" }),
    test: titled("Test", { type: "boolean" }),
    submission: titled(
      "Submission",
      object({
        id: titled("Submission ID", { type: "string" }),
        filename: titled("Filename", { type: "string" }),
        uploaded_at: titled("Uploaded at", { type: "string", format: "date-time" }),
      }),
    ),
    form: titled(
      "Form",
      object({
        id: titled("Form ID", { type: "string" }),
        version: titled("Form version", { type: "integer" }),
      }),
    ),
    approval: titled(
      "Approval",
      object({
        mode: titled("Approval mode", { type: "string", enum: ["manual", "auto"] }),
        by: titled("Approved by", { type: "string" }, true),
        at: titled("Approved at", { type: "string", format: "date-time" }),
      }),
    ),
    data: titled("Data", object(Object.fromEntries(fields.map((f) => [f.key, fieldSchema(f)])))),
  });
}

const iso = (ms: number) => new Date(ms).toISOString();

export function envelopeOf(delivery: {
  deliveryId: string;
  test: boolean;
  submission: { id: string; filename: string; uploadedAt: number };
  form: { id: string; version: number };
  approval: { mode: "manual" | "auto"; by: string | null; at: number };
  data: Payload;
}) {
  return {
    event: "submission.approved",
    delivery_id: delivery.deliveryId,
    test: delivery.test,
    submission: {
      id: delivery.submission.id,
      filename: delivery.submission.filename,
      uploaded_at: iso(delivery.submission.uploadedAt),
    },
    form: delivery.form,
    approval: { ...delivery.approval, at: iso(delivery.approval.at) },
    data: delivery.data,
  };
}
