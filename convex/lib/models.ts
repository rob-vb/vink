"use node";
// Which outside models an Extraction uses, pinned. Each can be overridden per
// deployment (`npx convex env set`) when a new version has been benchmarked.
import { FinishReason, GoogleGenAI, ThinkingLevel } from "@google/genai";
import { usage } from "./usage";

export const models = {
  /** Reads the PDF into a Reading (ADR 0003, Read). */
  reader: process.env.READER_MODEL ?? "gemini-3.8-flash",
  /** How hard the reader thinks (ticket 39). */
  readerThinking: (process.env.READER_THINKING ?? "HIGH") as ThinkingLevel,
  /** Writes each Field Value from its source (ADR 0003, Fill). */
  filler: process.env.FILL_MODEL ?? "gemini-3.8-flash",
  /** Proposes a Form's Fields from a sample (ticket 36). */
  proposer: process.env.PROPOSER_MODEL ?? "gemini-3.8-flash",
  /** Matches Fields to the Reading; never `jev-latest`. */
  jev: process.env.JEV_MODEL ?? "jev-1.13.0",
};

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set on this deployment`);
  return value;
}

/**
 * Gemini through the LiteLLM gateway when LITELLM_URL is set (it holds the
 * Vertex credentials; LITELLM_API_KEY is this app's virtual key), else Gemini
 * on Vertex AI in the EU multi-region. GOOGLE_VERTEX_CREDENTIALS holds a
 * service account's JSON key; its project is the one billed.
 */
function vertex() {
  if (process.env.LITELLM_URL) {
    return new GoogleGenAI({
      apiKey: requireEnv("LITELLM_API_KEY"),
      httpOptions: { baseUrl: process.env.LITELLM_URL },
    });
  }
  const credentials = JSON.parse(requireEnv("GOOGLE_VERTEX_CREDENTIALS"));
  return new GoogleGenAI({
    vertexai: true,
    project: credentials.project_id,
    location: process.env.VERTEX_REGION ?? "eu",
    googleAuthOptions: {
      credentials,
      scopes: "https://www.googleapis.com/auth/cloud-platform",
    },
  });
}

type Chunk = {
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: Array<{ text?: string; thought?: boolean }> };
  }>;
};

/** The text of a finished streamed response, refusing to go on from a cut-off or blocked one. */
export function textOf(chunks: Chunk[]) {
  const finishReason = chunks.findLast((c) => c.candidates?.[0]?.finishReason)?.candidates?.[0]
    ?.finishReason;
  if (finishReason !== FinishReason.STOP) {
    throw new Error(`The model stopped early: ${finishReason ?? "no answer"}`);
  }
  return chunks
    .flatMap((chunk) => chunk.candidates?.[0]?.content?.parts ?? [])
    .flatMap((part) => (part.text && !part.thought ? [part.text] : []))
    .join("");
}

/** A JSON object from a model's answer, with or without a ```json fence. */
export function parseJsonObject(text: string): Record<string, unknown> {
  const body = text.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] ?? text;
  const parsed = JSON.parse(body.slice(body.indexOf("{"), body.lastIndexOf("}") + 1));
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("The model didn't answer with a JSON object");
  }
  return parsed;
}

/** One prompt to a model: the PDF (if any), then the texts in order. */
export type Completion = {
  model: string;
  pdf?: Uint8Array;
  texts: string[];
  maxTokens: number;
  /** How hard the model thinks; LOW when left out. */
  thinking?: ThinkingLevel;
  /** Structured output: the answer is JSON that fits this schema. */
  jsonSchema?: Record<string, unknown>;
};

/**
 * Asks the model and returns its answer's text: Gemini on Vertex EU. With
 * CLAUDE_BRIDGE_URL set, the Claude bridge on the VPS answers with Claude Code
 * instead (scripts/claude-bridge), for testing without Vertex.
 */
export async function complete(completion: Completion): Promise<string> {
  const { model, text, inputTokens, outputTokens } = process.env.CLAUDE_BRIDGE_URL
    ? await viaBridge(process.env.CLAUDE_BRIDGE_URL, completion)
    : { model: completion.model, ...(await viaVertex(completion)) };
  usage.record({ model, inputTokens, outputTokens });
  return text;
}

/**
 * The Claude model the bridge runs for a step: the pinned one when it's Claude,
 * else Opus for the vision steps and Haiku for Fill, as benchmarked in ticket 26.
 */
function bridgeModel(model: string, pdf: Uint8Array | undefined) {
  if (model.startsWith("claude")) return model;
  return pdf ? "claude-opus-5" : "claude-haiku-4-5@20251001";
}

async function viaBridge(url: string, { model: pinned, pdf, texts, jsonSchema }: Completion) {
  const model = bridgeModel(pinned, pdf);
  const response = await fetch(`${url}/complete`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${requireEnv("CLAUDE_BRIDGE_SECRET")}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      prompt: texts.join("\n\n"),
      pdf: pdf && Buffer.from(pdf).toString("base64"),
      jsonSchema,
    }),
  });
  if (!response.ok) throw new Error(await response.text());
  const { text, usage } = (await response.json()) as {
    text: string;
    usage: { inputTokens: number; outputTokens: number };
  };
  return { model, text, ...usage };
}

async function viaVertex({ model, pdf, texts, maxTokens, thinking, jsonSchema }: Completion) {
  const document = pdf
    ? [{ inlineData: { mimeType: "application/pdf", data: Buffer.from(pdf).toString("base64") } }]
    : [];
  // Streamed, so a long Read isn't cut off by Node's 5-minute wait for a first byte.
  const stream = await vertex().models.generateContentStream({
    model,
    contents: [{ role: "user", parts: [...document, ...texts.map((text) => ({ text }))] }],
    config: {
      maxOutputTokens: maxTokens,
      thinkingConfig: { thinkingLevel: thinking ?? ThinkingLevel.LOW },
      ...(jsonSchema
        ? { responseMimeType: "application/json", responseJsonSchema: jsonSchema }
        : {}),
    },
  });
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const tokens = chunks.findLast((c) => c.usageMetadata)?.usageMetadata;
  return {
    text: textOf(chunks),
    inputTokens: tokens?.promptTokenCount ?? 0,
    // Thinking is billed as output.
    outputTokens: (tokens?.candidatesTokenCount ?? 0) + (tokens?.thoughtsTokenCount ?? 0),
  };
}
