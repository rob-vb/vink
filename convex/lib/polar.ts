"use node";
// The one Polar client. Tests replace this module with a fake.
import { createPolar, webhooks, type Polar } from "@polar-sh/sdk/2026-10";

let client: Polar | undefined;

export function polar() {
  client ??= createPolar({
    accessToken: process.env.POLAR_ACCESS_TOKEN!,
    // "sandbox" on dev; production is the default.
    environment: process.env.POLAR_SERVER === "sandbox" ? "sandbox" : "production",
  });
  return client;
}

/** The `webhook-id`, `webhook-timestamp` and `webhook-signature` headers. */
export type WebhookHeaders = { id: string; timestamp: string; signature: string };

/**
 * The verified event; `"bad_signature"`, or `"unknown_type"` for a signed event
 * this API version doesn't know (nothing to do, so no retry either).
 */
export async function webhookEvent(payload: string, { id, timestamp, signature }: WebhookHeaders) {
  const headers = { "webhook-id": id, "webhook-timestamp": timestamp, "webhook-signature": signature };
  try {
    return await webhooks.validateEvent(payload, headers, process.env.POLAR_WEBHOOK_SECRET!);
  } catch (error) {
    if (error instanceof webhooks.PolarWebhookVerificationError) return "bad_signature" as const;
    if (error instanceof webhooks.PolarWebhookUnknownTypeError) return "unknown_type" as const;
    throw error;
  }
}
