"use node";
// Which outside models an Extraction uses, pinned. Each can be overridden per
// deployment (`npx convex env set`) when a new version has been benchmarked.
import { AnthropicVertex } from "@anthropic-ai/vertex-sdk";
import { GoogleAuth } from "google-auth-library";
import { usage } from "./usage";

export const models = {
  /** Reads the PDF into a Reading (ADR 0003, Read). */
  reader: process.env.READER_MODEL ?? "claude-opus-5",
  /** Writes each Field Value from its source (ADR 0003, Fill). */
  filler: process.env.FILL_MODEL ?? "claude-haiku-4-5@20251001",
  /** Proposes a Form's Fields from a sample (ticket 36). */
  proposer: process.env.PROPOSER_MODEL ?? "claude-opus-5",
  /** Matches Fields to the Reading; never `jev-latest`. */
  jev: process.env.JEV_MODEL ?? "jev-1.13.0",
};

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set on this deployment`);
  return value;
}

/**
 * Claude on Vertex AI in the EU. GOOGLE_VERTEX_CREDENTIALS holds a service
 * account's JSON key; its project is the one billed.
 */
function vertex() {
  const credentials = JSON.parse(requireEnv("GOOGLE_VERTEX_CREDENTIALS"));
  return new AnthropicVertex({
    projectId: credentials.project_id,
    region: process.env.VERTEX_REGION ?? "eu",
    googleAuth: new GoogleAuth({
      credentials,
      scopes: "https://www.googleapis.com/auth/cloud-platform",
    }),
  });
}

/** The text of a finished response, refusing to go on from a cut-off or refused one. */
export function textOf(message: {
  stop_reason: string | null;
  content: Array<{ type: string; text?: string }>;
}) {
  if (message.stop_reason !== "end_turn") {
    throw new Error(`The model stopped early: ${message.stop_reason}`);
  }
  return message.content
    .flatMap((block) => (block.type === "text" ? [block.text ?? ""] : []))
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

/** One prompt to a Claude model: the PDF (if any), then the texts in order. */
export type Completion = {
  model: string;
  pdf?: Uint8Array;
  texts: string[];
  maxTokens: number;
  /** Adaptive thinking, for the vision steps. */
  thinking?: boolean;
  /** Structured output: the answer is JSON that fits this schema. */
  jsonSchema?: Record<string, unknown>;
};

/**
 * Asks Claude and returns its answer's text. With CLAUDE_BRIDGE_URL set, the
 * Claude bridge on the VPS answers with Claude Code (scripts/claude-bridge),
 * until Vertex is set up; otherwise Claude on Vertex EU.
 */
export async function complete(completion: Completion): Promise<string> {
  const { text, inputTokens, outputTokens } = process.env.CLAUDE_BRIDGE_URL
    ? await viaBridge(process.env.CLAUDE_BRIDGE_URL, completion)
    : await viaVertex(completion);
  usage.record({ model: completion.model, inputTokens, outputTokens });
  return text;
}

async function viaBridge(url: string, { model, pdf, texts, jsonSchema }: Completion) {
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
  return { text, ...usage };
}

async function viaVertex({ model, pdf, texts, maxTokens, thinking, jsonSchema }: Completion) {
  const document = pdf
    ? [
        {
          type: "document" as const,
          source: {
            type: "base64" as const,
            media_type: "application/pdf" as const,
            data: Buffer.from(pdf).toString("base64"),
          },
        },
      ]
    : [];
  const message = await vertex()
    .messages.stream({
      model,
      max_tokens: maxTokens,
      ...(thinking ? { thinking: { type: "adaptive" as const } } : {}),
      ...(jsonSchema
        ? { output_config: { format: { type: "json_schema" as const, schema: jsonSchema } } }
        : {}),
      messages: [
        {
          role: "user",
          content: [...document, ...texts.map((text) => ({ type: "text" as const, text }))],
        },
      ],
    })
    .finalMessage();
  return {
    text: textOf(message),
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  };
}
