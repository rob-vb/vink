"use node";
// The one Stripe client. Tests replace `stripe` with a fake; webhook
// signatures are checked without a client, so tests check them for real.
import Stripe from "stripe";

let client: Stripe | undefined;

export function stripe() {
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY!);
  return client;
}

/** The verified event; throws for a bad signature. */
export function webhookEvent(payload: string, signature: string) {
  return Stripe.webhooks.constructEventAsync(payload, signature, process.env.STRIPE_WEBHOOK_SECRET!);
}
