// Integration secrets (header values and the signing secret) are stored
// encrypted with AES-256-GCM. The key lives in the deployment's
// INTEGRATION_SECRETS_KEY (32 random bytes, base64), never in the database.

function toBase64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(text: string) {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

async function key() {
  const raw = process.env.INTEGRATION_SECRETS_KEY;
  if (!raw) throw new Error("INTEGRATION_SECRETS_KEY is not set on this deployment");
  return await crypto.subtle.importKey("raw", fromBase64(raw), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

/** `v1.<iv>.<ciphertext>`, both base64. */
export async function encryptSecret(plain: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await key(),
    new TextEncoder().encode(plain),
  );
  return `v1.${toBase64(iv)}.${toBase64(new Uint8Array(sealed))}`;
}

export async function decryptSecret(sealed: string) {
  const [version, iv, data] = sealed.split(".");
  if (version !== "v1" || !iv || !data) throw new Error("Not an encrypted secret");
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(iv) },
    await key(),
    fromBase64(data),
  );
  return new TextDecoder().decode(plain);
}

/** How a secret shows in the UI: its last 4 characters at most. */
export function masked(plain: string) {
  return plain.length <= 8 ? "••••••••" : `••••••••${plain.slice(-4)}`;
}
