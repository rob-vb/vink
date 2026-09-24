"use node";
// Verify (ADR 0003): Jev checks every filled value of a Document in one
// request. Fit: does the value fit its Field and the rest of the Document?
// Support: does its pages' text layer hold it? Asked only when there is one.
import { TypeSafeClient, noul } from "@typesafe-ai/sdk";
import { models } from "./models";
import type { Verification, Verifier } from "./pipeline";
import { usage } from "./usage";

// Terms and conditions pages are long and carry nothing for the Form.
const PAGE_TEXT_MAX = 6000;

export const verifier: Verifier = {
  async verify({ formName, formDescription, reading }, requests) {
    const state = {
      form: { name: formName, description: formDescription },
      document: reading,
      values: requests.map((r) => ({
        field: r.label,
        key: r.field.key,
        type: r.field.type,
        description: r.field.description ?? null,
        options: r.field.type === "choice" ? r.field.options.map((o) => o.value) : null,
        value: r.value,
        readText: r.readText,
        pages: r.pages,
        pageText: r.pageText?.slice(0, PAGE_TEXT_MAX) ?? null,
      })),
    };
    const questions: Record<string, ReturnType<typeof noul>> = {};
    requests.forEach((r, i) => {
      questions[`fit_${i}`] = noul(
        `Consider \`values[${i}]\`: a value extracted for the Field \`values[${i}].field\` of this Form, described as \`values[${i}].description\`. Does \`values[${i}].value\` fit what that Field asks for, and is it plausible given the other values in \`values\` and the rest of \`document\`?`,
        {
          true: "The value is the kind of thing the Field asks for and is consistent with the rest of the Document",
          false: "The value belongs to another Field, has the wrong kind or format, or conflicts with the rest of the Document",
        },
      );
      if (r.pageText !== null) {
        questions[`support_${i}`] = noul(
          `Consider \`values[${i}]\`, read from page(s) \`values[${i}].pages\`. Does \`values[${i}].pageText\`, the text layer of those pages, contain \`values[${i}].readText\` and support \`values[${i}].value\` as the value for Field \`values[${i}].field\`?`,
          {
            true: "The page text contains this value for this Field (allowing for normalisation such as date or number format)",
            false: "The page text lacks the value, shows a different value, or shows it for a different Field",
          },
        );
      }
    });
    const { answers, model, usage: used } = await new TypeSafeClient().systemOne({
      model: models.jev,
      state,
      questions,
    });
    usage.record({ model, inputTokens: used.input_tokens, outputTokens: used.output_tokens });
    return Object.fromEntries(
      requests.map((r, i): [string, Verification] => [
        r.id,
        {
          fit: answers[`fit_${i}`].noul,
          support: r.pageText === null ? null : answers[`support_${i}`].noul,
        },
      ]),
    );
  },
};
