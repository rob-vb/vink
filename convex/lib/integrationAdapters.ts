// How a Payload reaches an Integration: one adapter per kind (GLOSSARY:
// Integration). A Delivery's attempts, retries and re-send, and a test-send,
// work the same for every kind; only the send itself is the adapter's.
// A new kind is a new member of the `integrations` table plus an adapter here.
import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { excelAdapter } from "./excelAdapter";
import { googleSheetsAdapter } from "./googleSheetsAdapter";
import type { envelopeOf } from "./payload";
import { webhookAdapter } from "./webhookAdapter";

export type Integration = Doc<"integrations">;
export type IntegrationKind = NonNullable<Integration["kind"]>;

/** The Integration's kind; one made before kinds existed is a Webhook. */
export function kindOf(integration: Integration): IntegrationKind {
  return integration.kind ?? "webhook";
}

export type Envelope = ReturnType<typeof envelopeOf>;

/** How one send settles a Delivery attempt. */
export type Outcome =
  | { kind: "delivered" }
  // Tried again on the backoff schedule, not before `retryAfter` (a Retry-After value) if given.
  | { kind: "retry"; reason: string; retryAfter: string | null }
  // Not tried again until an Admin re-sends it. `access_expired`: the
  // connected account no longer lets Vink in (a spreadsheet kind), so it
  // needs connecting again before a re-send can work.
  | { kind: "failed"; reason: string; cause?: "access_expired" };

/** What a send needs besides the envelope, which leaves it out. */
export type SendDetails = {
  // The approver's email, for a spreadsheet's `approved_by` column; null for Auto-Send or a dummy test.
  approverEmail: string | null;
  // Stores a new refresh token the provider handed out (Microsoft rotates
  // them); see lib/accounts.ts `refreshTokenKeeper`.
  keepRefreshToken(refreshToken: string): Promise<void>;
};

/** One send: its Outcome, and what the attempt log and the test-send panel show of it. */
export type SendResult = {
  outcome: Outcome;
  // The receiver's answer: a status and the start of its body; null when there was none.
  status: number | null;
  body: string | null;
  // Why there was no answer (timeout, network).
  error: string | null;
};

export type IntegrationAdapter<K extends IntegrationKind = IntegrationKind> = {
  /**
   * Sends one envelope to the Integration as it is configured now, decrypting
   * its secrets itself. Runs in an action. Every answer, and the lack of one,
   * is settled as an Outcome; it throws only on a bug.
   */
  send(
    integration: Extract<Integration, { kind?: K }>,
    envelope: Envelope,
    details: SendDetails,
  ): Promise<SendResult>;
};

const adapters: { [K in IntegrationKind]: IntegrationAdapter<K> } = {
  webhook: webhookAdapter,
  google_sheets: googleSheetsAdapter,
  excel: excelAdapter,
};

export function adapterFor(kind: string): IntegrationAdapter {
  if (!Object.hasOwn(adapters, kind)) {
    throw new ConvexError(`Vink can't send to an Integration of kind "${kind}"`);
  }
  return adapters[kind as IntegrationKind] as IntegrationAdapter;
}

/** Sends an envelope through the adapter of the Integration's kind. */
export async function sendTo(integration: Integration, envelope: Envelope, details: SendDetails) {
  return await adapterFor(kindOf(integration)).send(integration, envelope, details);
}
