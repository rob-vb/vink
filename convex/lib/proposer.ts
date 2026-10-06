"use node";
// Form Proposal (ticket 14): one vision-model call gets a sample's Reading
// plus its pages (images and text layer) and proposes the Form's Fields.
import { ThinkingLevel } from "@google/genai";
import { isValidKey } from "./fieldKeys";
import { complete, models, parseJsonObject } from "./models";
import type { ProposedField, Proposer } from "./pipeline";

const PROMPT = `You design a data-entry Form from one sample Document. You get the PDF, its text layer, and the Reading: a JSON description of everything the Document says, with English keys.

Propose one Field per piece of data in the Reading. List everything, and set "ticked" on the Fields that serve the Document's purpose; leave things like bank details, phone numbers and page footers unticked.

- "label": the term as printed on the Document, in its language (e.g. "Kilometerstand").
- "key": English snake_case from the meaning (e.g. "mileage_km").
- "description": English, with the printed terms as synonyms (e.g. "Odometer reading in km (Kilometerstand, Km. stand)").
- "type": text, number (amounts and measures), date, boolean (ticks), choice or list. Use "choice" only when the options are printed on the paper (pre-printed boxes or a list), never from one filled-in value; give them as "options". Use "list" for repeated objects (one entry per delivery note line, per invoice line), with their "fields" (never lists themselves).

Answer with {"fields": [...]} only.`;

type Proposed = {
  label: string;
  key: string;
  description?: string;
  type: "text" | "number" | "date" | "boolean" | "choice" | "list";
  options?: string[];
  fields?: Proposed[];
  ticked?: boolean;
};

function toField(p: Proposed, list: boolean): ProposedField["field"] | null {
  if (!isValidKey(p.key) || !p.label?.trim()) return null;
  const base = { label: p.label.trim(), key: p.key, description: p.description, required: false };
  if (p.type === "list" && !list) {
    const fields = (p.fields ?? []).flatMap((s) => {
      const field = toField(s, true);
      return field && field.type !== "list" ? [field] : [];
    });
    return fields.length > 0 ? { ...base, type: "list", fields } : null;
  }
  if (p.type === "choice") {
    const options = [...new Set(p.options ?? [])].filter((o) => o.trim());
    return options.length > 0
      ? { ...base, type: "choice", options: options.map((value) => ({ value })) }
      : { ...base, type: "text" };
  }
  const type = ["number", "date", "boolean"].includes(p.type) ? p.type : "text";
  return { ...base, type: type as "text" | "number" | "date" | "boolean" };
}

export const proposer: Proposer = {
  async propose({ pdf, reading, textLayer }) {
    const answer = await complete({
      model: models.proposer,
      pdf,
      maxTokens: 32000,
      thinking: ThinkingLevel.HIGH,
      texts: [
        `# Text layer\n\n${textLayer.map((p) => `## Page ${p.page}\n\n${p.text}`).join("\n\n") || "(none: a scan)"}`,
        `# Reading\n\n${JSON.stringify(reading, null, 2)}`,
        PROMPT,
      ],
    });
    const { fields } = parseJsonObject(answer) as { fields?: Proposed[] };
    return (fields ?? []).flatMap((p) => {
      const field = toField(p, false);
      return field ? [{ field, ticked: p.ticked ?? false }] : [];
    });
  },
};
