// The Payload (spec, Payload and Delivery): the JSON built from a Document's
// Field Values, keyed by the Form's Fields, and the envelope around it. Every
// key is always there: `null` for no value, `[]` for a List without entries.
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

const iso = (ms: number) => new Date(ms).toISOString();

export function envelopeOf(delivery: {
  deliveryId: string;
  test: boolean;
  document: { id: string; filename: string; uploadedAt: number };
  form: { id: string; version: number };
  approval: { mode: "manual" | "auto"; by: string | null; at: number };
  data: Payload;
}) {
  return {
    event: "document.approved",
    deliveryId: delivery.deliveryId,
    test: delivery.test,
    document: { ...delivery.document, uploadedAt: iso(delivery.document.uploadedAt) },
    form: delivery.form,
    approval: { ...delivery.approval, at: iso(delivery.approval.at) },
    data: delivery.data,
  };
}
