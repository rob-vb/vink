// The OAuth `state` parameter for connecting an account (Google Sheets, and
// later Excel): `<organisation slug>.<claims>.<HMAC>`, so the callback can
// check that the same Admin of the same Organisation started it, recently.
// The slug comes first in plain text so the callback page knows where to send
// the Admin back to; it is signed with the rest.

// How long an Admin has on the provider's consent page.
const VALID_MS = 15 * 60 * 1000;

export type OAuthClaims = {
  organisationId: string;
  userId: string;
  // The new Integration's name.
  name: string;
  // Set on a Reconnect: the Integration whose account is connected again.
  integrationId?: string;
  expiresAt: number;
};

function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(text: string) {
  return Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
}

// A key of its own, derived from INTEGRATION_SECRETS_KEY (lib/secrets.ts).
async function key() {
  const raw = process.env.INTEGRATION_SECRETS_KEY;
  if (!raw) throw new Error("INTEGRATION_SECRETS_KEY is not set on this deployment");
  const derived = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`vink oauth state:${raw}`));
  return await crypto.subtle.importKey("raw", derived, { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

export async function signState(slug: string, claims: Omit<OAuthClaims, "expiresAt">, now = Date.now()) {
  const payload = base64url(new TextEncoder().encode(JSON.stringify({ ...claims, expiresAt: now + VALID_MS })));
  const signed = `${slug}.${payload}`;
  const mac = await crypto.subtle.sign("HMAC", await key(), new TextEncoder().encode(signed));
  return `${signed}.${base64url(new Uint8Array(mac))}`;
}

/** The claims of a state Vink signed that hasn't expired; null for anything else. */
export async function readState(state: string, now = Date.now()): Promise<OAuthClaims | null> {
  const [slug, payload, mac, ...rest] = state.split(".");
  if (!slug || !payload || !mac || rest.length > 0) return null;
  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await key(),
      fromBase64url(mac),
      new TextEncoder().encode(`${slug}.${payload}`),
    );
    if (!valid) return null;
    const claims = JSON.parse(new TextDecoder().decode(fromBase64url(payload))) as OAuthClaims;
    return claims.expiresAt > now ? claims : null;
  } catch {
    return null;
  }
}
