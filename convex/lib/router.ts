"use node";
// The Router (ADR 0010): for a Document that came without a Form, Jev picks
// the Form from the Reading and each Form's name, description and Field names,
// `none` included. Jev decides here, as in Match; the vision model only read.
// The pick is not final: Match and the fit check (lib/fit.ts) gate it.
import { TypeSafeClient, choice } from "@typesafe-ai/sdk";
import { MAX_ROUTABLE_FORMS } from "./matchPlan";
import { models } from "./models";
import type { RoutableForm, Router } from "./pipeline";
import { usage } from "./usage";

// Keeps one Form's criterion short, so many Forms and the Reading still fit under Jev's cap.
const MAX_DESCRIPTION = 300;
const MAX_FIELDS = 30;

function criterion(form: RoutableForm) {
  const description = form.description ? `: ${form.description.slice(0, MAX_DESCRIPTION)}` : "";
  const fields = form.fields.slice(0, MAX_FIELDS).join(", ");
  return `Form "${form.name}"${description}. Fields: ${fields}${form.fields.length > MAX_FIELDS ? ", …" : ""}`;
}

export const router: Router = {
  async route(reading, forms) {
    if (forms.length === 0) return { formId: null, probability: 1 };
    const listed = forms.slice(0, MAX_ROUTABLE_FORMS);
    const criteria: Record<string, string> = {
      none: "None of these Forms is made for this document",
      ...Object.fromEntries(listed.map((form, i) => [`f${i}`, criterion(form)])),
    };
    const result = await new TypeSafeClient().systemOne({
      model: models.jev,
      state: { document: reading },
      questions: {
        form: choice(
          "Which Form is the document in `document` made for? Pick a Form only when this kind of document is what the Form collects; otherwise pick none.",
          criteria,
        ),
      },
    });
    usage.record({
      model: result.model,
      inputTokens: result.usage.input_tokens,
      outputTokens: result.usage.output_tokens,
    });
    const answer = result.answers.form;
    return {
      formId: answer.choice === "none" ? null : listed[Number(answer.choice.slice(1))].id,
      probability: answer.probabilities[answer.choice],
    };
  },
};
