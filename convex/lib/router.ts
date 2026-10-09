"use node";
// The Router (ADR 0010): for a Submission that came without a Form, Jev picks
// the Form from the Reading and each Form's name, description and Field names,
// `none` included. Jev decides here, as in Match; the vision model only read.
// The pick is not final: Match and the fit check (lib/fit.ts) gate it.
import { TypeSafeClient, choice } from "@typesafe-ai/sdk";
import { models } from "./models";
import type { Router } from "./pipeline";
import { ROUTER_QUESTION, routerRequest } from "./routerPlan";
import { usage } from "./usage";

export const router: Router = {
  async route(reading, forms) {
    if (forms.length === 0) return { formId: null, probability: 1 };
    // Cut to fit Jev's cap; a Submission too big even then has no Form, not a failed run.
    const request = routerRequest(reading, forms);
    if (request === null) {
      console.warn(`Router: the Reading and ${forms.length} Forms do not fit one request; No Form`);
      return { formId: null, probability: 1 };
    }
    const { listed } = request;
    const result = await new TypeSafeClient().systemOne({
      model: models.jev,
      state: request.state,
      questions: { form: choice(ROUTER_QUESTION, request.criteria) },
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
