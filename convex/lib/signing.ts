// Every request to an Integration is signed with HMAC-SHA256 over the raw
// body, using the Integration's own secret, so the receiver can check that
// Vink sent it.

export const SIGNATURE_HEADER = "X-Vink-Signature";

function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The signature header's value: `sha256=<hex>`. */
export async function signatureOf(secret: string, body: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return `sha256=${hex(await crypto.subtle.sign("HMAC", key, encoder.encode(body)))}`;
}

/** A new random secret for an Integration. */
export function newSigningSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return `whsec_${hex(bytes.buffer)}`;
}
