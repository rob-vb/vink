// The Webhook adapter: POSTs the envelope to the Integration's endpoint with
// its static headers, signed with its own secret (lib/signing.ts).
import { http, HttpFailure } from "./http";
import type { IntegrationAdapter, Outcome } from "./integrationAdapters";
import { decryptSecret } from "./secrets";
import { SIGNATURE_HEADER, signatureOf } from "./signing";

/** How an answer (or the lack of one) settles an attempt. */
function outcomeOf(status: number | null, retryAfter: string | null, error: string | null): Outcome {
  if (status === null) return { kind: "retry", reason: error!, retryAfter: null };
  if (status >= 200 && status < 300) return { kind: "delivered" };
  if (status === 408 || status === 429 || status >= 500) {
    return { kind: "retry", reason: `The receiver answered ${status}`, retryAfter };
  }
  return { kind: "failed", reason: `The receiver refused it (${status})` };
}

export const webhookAdapter: IntegrationAdapter<"webhook"> = {
  async send(integration, envelope) {
    const body = JSON.stringify(envelope);
    const headers = {
      ...Object.fromEntries(
        await Promise.all(
          integration.headers.map(async (h) => [h.name, h.secret ? await decryptSecret(h.value) : h.value]),
        ),
      ),
      "Content-Type": "application/json",
      [SIGNATURE_HEADER]: await signatureOf(await decryptSecret(integration.signingSecret), body),
    };
    try {
      const answer = await http.post(integration.url, headers, body);
      return {
        outcome: outcomeOf(answer.status, answer.retryAfter, null),
        status: answer.status,
        body: answer.body,
        error: null,
      };
    } catch (error) {
      if (!(error instanceof HttpFailure)) throw error;
      return { outcome: outcomeOf(null, null, error.message), status: null, body: null, error: error.message };
    }
  },
};
