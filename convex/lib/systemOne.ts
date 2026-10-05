"use node";
// One System One request (state + typed questions → probabilities), to Jev on
// TypeSafe or to Clef on Cloudflare Workers AI, which speaks the same API and
// can also see up to 4 page images. Spike: Clef in place of Jev (2026-10-03).
import { TypeSafeClient, type choice, type noul } from "@typesafe-ai/sdk";
import { usage } from "./usage";

export type Question = ReturnType<typeof choice> | ReturnType<typeof noul>;

export type ChoiceAnswer = { choice: string; probabilities: Record<string, number> };
export type NoulAnswer = { noul: number };

/** A rendered page of the Document, for a model that can see it. */
export type PageImage = { page: number; jpeg: Uint8Array };

// Clef's limits (schema-input.json, 2026-10-03).
export const CLEF_MAX_QUESTIONS = 64;
export const CLEF_MAX_IMAGES = 4;

// Workers AI refuses a request whose estimated tokens pass Clef's 64k window,
// and estimates an image by its base64 text (4 characters a token), though it
// bills about a thousand tokens for a 100 dpi page (2026-10-03). So a request
// with images holds only what fits under this estimate.
const CLEF_ESTIMATE_BUDGET = 60_000;

/** Workers AI's token estimate for an image, as it counts it before running. */
export const imageEstimate = (image: PageImage) => Math.ceil((image.jpeg.length * 4) / 3 / 4);

/** Whether a state with these images fits Workers AI's estimate (text cautiously at 3 characters a token). */
export const fitsClef = (state: unknown, images: PageImage[]) =>
  JSON.stringify(state).length / 3 + images.reduce((n, image) => n + imageEstimate(image), 0) <=
  CLEF_ESTIMATE_BUDGET;

export const isClef = (model: string) => /^clef(-flash)?$/.test(model);

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

type Request = {
  model: string;
  state: Parameters<TypeSafeClient["systemOne"]>[0]["state"];
  questions: Record<string, Question>;
  images?: PageImage[];
};

type Answers = Record<string, ChoiceAnswer & NoulAnswer>;

async function viaTypeSafe({ model, state, questions }: Request) {
  const result = await new TypeSafeClient().systemOne({ model, state, questions });
  usage.record({
    model: result.model,
    inputTokens: result.usage.input_tokens,
    outputTokens: result.usage.output_tokens,
  });
  return result.answers as unknown as Answers;
}

async function viaClef({ model, state, questions, images = [] }: Request) {
  if (images.length > CLEF_MAX_IMAGES) throw new Error(`Clef sees at most ${CLEF_MAX_IMAGES} images`);
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${requireEnv("CLOUDFLARE_ACCOUNT_ID")}/ai/run/@cf/cloudflare/${model}`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${requireEnv("CLOUDFLARE_API_TOKEN")}`,
        "content-type": "application/json",
        // Through an AI Gateway with Unified billing, prepaid credits pay.
        ...(process.env.CLOUDFLARE_AI_GATEWAY_ID
          ? { "cf-aig-gateway-id": process.env.CLOUDFLARE_AI_GATEWAY_ID }
          : {}),
      },
      body: JSON.stringify({
        model,
        state,
        questions,
        ...(images.length > 0
          ? {
              images: images.map((image) => ({
                content_type: "image/jpeg",
                base64: Buffer.from(image.jpeg).toString("base64"),
              })),
            }
          : {}),
      }),
    },
  );
  const body = (await response.json()) as {
    // The REST API wraps the model's answer in `result`.
    result?: { model: string; answers: Answers; usage: { input_tokens: number; output_tokens: number } };
    errors?: unknown[];
  };
  if (!response.ok || !body.result) {
    throw new Error(`Clef answered ${response.status}: ${JSON.stringify(body.errors ?? body)}`);
  }
  usage.record({
    model,
    inputTokens: body.result.usage.input_tokens,
    outputTokens: body.result.usage.output_tokens,
  });
  return body.result.answers;
}

/**
 * Asks the questions about the state. Clef takes at most 64 questions per
 * request, so more go over several requests, each with the whole state.
 */
export async function decide(request: Request): Promise<Answers> {
  const ids = Object.keys(request.questions);
  if (ids.length === 0) return {};
  if (!isClef(request.model)) {
    if (request.images?.length) throw new Error(`${request.model} can't see images`);
    return viaTypeSafe(request);
  }
  const groups: string[][] = [];
  for (let i = 0; i < ids.length; i += CLEF_MAX_QUESTIONS) groups.push(ids.slice(i, i + CLEF_MAX_QUESTIONS));
  const answers = await Promise.all(
    groups.map((group) =>
      viaClef({
        ...request,
        questions: Object.fromEntries(group.map((id) => [id, request.questions[id]])),
      }),
    ),
  );
  return Object.assign({}, ...answers);
}
