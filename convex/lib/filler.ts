"use node";
// Fill (ADR 0003): a small text model writes each Field Value from the one
// source Match picked for it. It never sees the PDF or the rest of the Reading.
import { complete, models, parseJsonObject } from "./models";
import type { FilledValue, FillRequest, Filler, FlatField } from "./pipeline";

const PROMPT = `You get, for every Field, the text Match picked as its source on the Submission. Write each Field's value from its source, in the form the Field's type and description ask for.

- A source can be several values of one object, as \`key: value\` lines: take from them what the Field asks for and leave the rest (e.g. brand and model together, without size or article number). When the source holds only part of what the Field asks for (a model without its brand), write that part.
- Write only what the source says. Normalising is allowed: an ISO code from "658.08 EUR", a brand written out in full from a common abbreviation ("B&D" → "Black & Decker"), a size formatted as the description shows, an IBAN without spaces. Never invent a value that isn't in the source; write null then.
- number: a plain JSON number. date: ISO yyyy-mm-dd. boolean: true or false. choice: the value of the option the source means, or null if none fits.

Answer with one JSON object with one property per Field, named by its id.`;

function valueSchema(field: FlatField) {
  const nullable = (schema: object) => ({ anyOf: [schema, { type: "null" }] });
  switch (field.type) {
    case "number":
      return nullable({ type: "number" });
    case "boolean":
      return nullable({ type: "boolean" });
    case "choice":
      return nullable({ type: "string", enum: field.options.map((o) => o.value) });
    default:
      return nullable({ type: "string" });
  }
}

// The model answers with one property per request, named `v<index>`, which
// is safe as a JSON schema property name where `list[0].key` might not be.
function describe({ field, source }: FillRequest, i: number) {
  return {
    id: `v${i}`,
    key: field.key,
    label: field.label,
    type: field.type,
    description: field.description ?? null,
    options:
      field.type === "choice"
        ? field.options.map((o) => ({ value: o.value, description: o.description ?? null }))
        : undefined,
    source: source.text,
  };
}

export const filler: Filler = {
  async fill(requests) {
    const answer = await complete({
      model: models.filler,
      maxTokens: 16000,
      jsonSchema: {
        type: "object",
        properties: Object.fromEntries(requests.map((r, i) => [`v${i}`, valueSchema(r.field)])),
        required: requests.map((_, i) => `v${i}`),
        additionalProperties: false,
      },
      texts: [`${PROMPT}\n\n${JSON.stringify(requests.map(describe), null, 2)}`],
    });
    const values = parseJsonObject(answer);
    return Object.fromEntries(
      requests.map((r, i) => [r.id, (values[`v${i}`] ?? null) as FilledValue]),
    );
  },
};
