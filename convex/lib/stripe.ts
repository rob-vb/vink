"use node";
// The one Stripe client. Tests replace this module with a fake.
import Stripe from "stripe";

let client: Stripe | undefined;

export function stripe() {
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY!);
  return client;
}

export function webhookEvent(payload: string, signature: string) {
  return stripe().webhooks.constructEventAsync(
    payload,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET!,
  );
}
