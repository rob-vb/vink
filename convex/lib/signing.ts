// Every request to an Integration is signed with HMAC-SHA256 over the send
// time and the raw body, using the Integration's own secret, so the receiver
// can check that Vink sent it, and refuse a captured request replayed later.

export const SIGNATURE_HEADER = "X-Vink-Signature";

function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * The signature header's value: `t=<unix seconds>,v1=<hex>`, where `v1` is
 * HMAC-SHA256 over `"{t}.{body}"`. `v1` leaves room for a later scheme.
 */
export async function signatureOf(
  secret: string,
  body: string,
  timestamp = Math.floor(Date.now() / 1000),
) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${body}`));
  return `t=${timestamp},v1=${hex(mac)}`;
}

/** A new random secret for an Integration. */
export function newSigningSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return `whsec_${hex(bytes.buffer)}`;
}
