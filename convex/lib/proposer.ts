"use node";
// Form Proposal (ticket 14): one vision-model call gets a sample's Reading
// plus its pages (images and text layer) and proposes the Form's Fields.
import { ThinkingLevel } from "@google/genai";
import { isValidKey } from "./fieldKeys";
import { complete, models, parseJsonObject } from "./models";
import { filesOf, type ProposedField, type Proposer, type ReaderInput } from "./pipeline";

// The rules for one Field, shared by a sample's prompt and a description's.
const FIELD_RULES = `- "label": the term as printed on the Submission, in its language (e.g. "Leverdatum").
- "key": English snake_case from the meaning (e.g. "delivery_date").
- "description": English, with the printed terms as synonyms (e.g. "Date the goods were delivered (Leverdatum, Afleverdatum)").
- "type": text, number (amounts and measures), date, boolean (ticks), choice or list. Use "choice" only when the options are printed on the paper (pre-printed boxes or a list), never from one filled-in value; give them as "options". Use "list" for repeated objects (one entry per delivery note line, per invoice line), with their "fields" (never lists themselves).`;

const PROMPT = `You design a data-entry Form from one sample Submission. You get the PDF, its text layer, and the Reading: a JSON description of everything the Submission says, with English keys.

Propose one Field per piece of data in the Reading. List everything, and set "ticked" on the Fields that serve the Submission's purpose; leave things like bank details, phone numbers and page footers unticked.

${FIELD_RULES}

Answer with {"fields": [...]} only.`;

// What the Proposer gets, by kind. The PDF words are the benchmarked ones.
const GETS_PDF = "You get the PDF, its text layer, and the Reading";
const GETS = {
  pdf: GETS_PDF,
  image: "You get the photo (it has no text layer) and the Reading",
  email:
    "You get the email as text (page 1 of the text layer: its headers and body), its attachments, and the Reading",
};
const promptFor = (kind: ReaderInput["kind"]) => PROMPT.replace(GETS_PDF, GETS[kind]);

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

// "Describe in words": no sample, so no Reading and no files; the Admin's text is all there is.
const DESCRIBE_PROMPT = `You design a data-entry Form from a description. An Admin wrote what kind of document it is and which data they need from it. You have no sample.

Propose one Field per piece of data the description names or clearly implies, and set "ticked" on them. You may add a few more Fields that documents of this kind usually carry, with "ticked" left false. Never invent Fields that have nothing to do with the description. If the description is not about a submission or data to capture, answer {"fields": []}.

${FIELD_RULES.replace(
  "the term as printed on the Submission, in its language",
  "the term as the Admin would say it, in the description's language",
).replace(
  "only when the options are printed on the paper (pre-printed boxes or a list), never from one filled-in value",
  "only when the description names the options",
)}

Answer with {"fields": [...]} only.`;

function proposedFields(answer: string): ProposedField[] {
  const { fields } = parseJsonObject(answer) as { fields?: Proposed[] };
  return (fields ?? []).flatMap((p) => {
    const field = toField(p, false);
    return field ? [{ field, ticked: p.ticked ?? false }] : [];
  });
}

export const proposer: Proposer = {
  async propose({ input, reading, textLayer }) {
    const answer = await complete({
      model: models.proposer,
      files: filesOf(input),
      maxTokens: 32000,
      thinking: ThinkingLevel.HIGH,
      texts: [
        `# Text layer\n\n${textLayer.map((p) => `## Page ${p.page}\n\n${p.text}`).join("\n\n") || "(none: a scan)"}`,
        `# Reading\n\n${JSON.stringify(reading, null, 2)}`,
        promptFor(input.kind),
      ],
    });
    return proposedFields(answer);
  },

  async describe(description) {
    const answer = await complete({
      model: models.proposer,
      maxTokens: 16000,
      thinking: ThinkingLevel.MEDIUM,
      texts: [`# Description\n\n${description}`, DESCRIBE_PROMPT],
    });
    return proposedFields(answer);
  },
};
