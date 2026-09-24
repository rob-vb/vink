"use node";
// Fill (ADR 0003): a small text model writes each Field Value from the one
// source Match picked for it. It never sees the PDF or the rest of the Reading.
import { models, parseJsonObject, textOf, vertex } from "./models";
import type { FilledValue, FillRequest, Filler, FlatField } from "./pipeline";

const PROMPT = `You get, for every Field, the text Match picked as its source on the Document. Write each Field's value from its source, in the form the Field's type and description ask for.

- Write only what the source says. Normalising is allowed: an ISO code from "658.08 EUR", a brand written out in full from a common abbreviation ("Bridge" → "Bridgestone"), a size formatted as the description shows, a plate without spaces. Never invent a value that isn't in the source; write null then.
- number: a plain JSON number. date: ISO yyyy-mm-dd. boolean: true or false. choice: the value of the option the source means, or null if none fits.

Answer with one JSON object with one key per Field key.`;

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

function describe({ field, source }: FillRequest) {
  return {
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
    const message = await vertex().messages.create({
      model: models.filler,
      max_tokens: 16000,
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: Object.fromEntries(requests.map((r) => [r.field.key, valueSchema(r.field)])),
            required: requests.map((r) => r.field.key),
            additionalProperties: false,
          },
        },
      },
      messages: [
        {
          role: "user",
          content: `${PROMPT}\n\n${JSON.stringify(requests.map(describe), null, 2)}`,
        },
      ],
    });
    const values = parseJsonObject(textOf(message));
    return Object.fromEntries(
      requests.map((r) => [r.field.key, (values[r.field.key] ?? null) as FilledValue]),
    );
  },
};
