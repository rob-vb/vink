// The Worker's two side effects, apart from Cloudflare so they can be tested:
// put the attachments in R2, then tell Vink. Files are removed here only when the
// outcome is certain: storing failed before Vink was called, or Vink answered 404.
// Once Vink was called, Vink removes what it did not accept (`intake.receive`);
// the Worker never removes then, because a lost answer may hide a committed mail
// whose Submissions point at these very keys.
import type { Plan } from "./map";

export type Delivery = {
  put: (key: string, bytes: Uint8Array, mimeType: string) => Promise<void>;
  remove: (keys: string[]) => Promise<void>;
  /** The request to Vink's POST /intake/email. */
  send: (body: string) => Promise<{ status: number; ok: boolean }>;
};

/** What the sender's server should do with the mail. */
export type Result = "accepted" | "unknown_address";

/**
 * Stores the plan's attachments and calls Vink. Returns `unknown_address` when
 * Vink answers 404. Throws when storing fails, or when Vink fails or cannot be
 * reached, so the sending server retries (under new keys).
 */
export async function deliver(plan: Plan, receivedAt: number, delivery: Delivery): Promise<Result> {
  const keys = plan.store.map((object) => object.key);
  try {
    for (const object of plan.store) await delivery.put(object.key, object.bytes, object.mimeType);
  } catch (error) {
    await removeQuietly(delivery, keys);
    throw error;
  }
  const response = await delivery.send(
    JSON.stringify({
      token: plan.token,
      from: plan.from,
      receivedAt,
      subject: plan.subject,
      date: plan.date,
      body: plan.body,
      bodyTooLarge: plan.bodyTooLarge,
      attachments: plan.entries,
    }),
  );
  if (response.status === 404) {
    // No such Intake Address (or it was replaced): bounce, like any unknown mailbox.
    await removeQuietly(delivery, keys);
    return "unknown_address";
  }
  if (!response.ok) throw new Error(`Vink answered ${response.status}`);
  return "accepted";
}

/** A failing clean-up must not hide the error that made it necessary. */
async function removeQuietly(delivery: Delivery, keys: string[]) {
  if (keys.length === 0) return;
  try {
    await delivery.remove(keys);
  } catch (error) {
    console.error("Could not remove the stored attachments", error);
  }
}
