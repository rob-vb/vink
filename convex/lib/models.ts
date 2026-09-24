"use node";
// Which outside models an Extraction uses, pinned. Each can be overridden per
// deployment (`npx convex env set`) when a new version has been benchmarked.
import { AnthropicVertex } from "@anthropic-ai/vertex-sdk";
import { GoogleAuth } from "google-auth-library";

export const models = {
  /** Reads the PDF into a Reading (ADR 0003, Read). */
  reader: process.env.READER_MODEL ?? "claude-opus-5",
  /** Writes each Field Value from its source (ADR 0003, Fill). */
  filler: process.env.FILL_MODEL ?? "claude-haiku-4-5@20251001",
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
export function vertex() {
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
