// Receiver examples for `X-Vink-Signature: t=<unix>,v1=<hex>`, where v1 is
// HMAC-SHA256 over "{t}.{rawBody}" with the Integration's whsec_ secret and a
// 5-minute tolerance (Developers page, ticket 09). Code stays English on /nl.

export const verifySnippets = [
  {
    id: "node",
    label: "Node.js",
    language: "js",
    code: `import crypto from "node:crypto";

const TOLERANCE_SECONDS = 5 * 60;

// rawBody: the request body exactly as received (a Buffer or string),
// before any JSON parsing. With Express: express.raw({ type: "application/json" }).
export function verifyVink(rawBody, header, secret) {
  const parts = Object.fromEntries(
    (header ?? "").split(",").map((part) => part.trim().split("=", 2)),
  );
  const timestamp = Number(parts.t);
  if (!Number.isInteger(timestamp) || !parts.v1) return false;

  const age = Math.abs(Date.now() / 1000 - timestamp);
  if (age > TOLERANCE_SECONDS) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(\`\${timestamp}.\`)
    .update(rawBody)
    .digest();
  const received = Buffer.from(parts.v1, "hex");
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

// if (!verifyVink(req.body, req.get("X-Vink-Signature"), process.env.VINK_SECRET)) {
//   return res.status(401).end();
// }`,
  },
  {
    id: "python",
    label: "Python",
    language: "python",
    code: `import hashlib
import hmac
import time

TOLERANCE_SECONDS = 5 * 60


def verify_vink(raw_body: bytes, header: str, secret: str) -> bool:
    """raw_body: the request body exactly as received, before JSON parsing."""
    parts = dict(p.strip().split("=", 1) for p in (header or "").split(",") if "=" in p)
    try:
        timestamp = int(parts["t"])
        received = parts["v1"]
    except (KeyError, ValueError):
        return False

    if abs(time.time() - timestamp) > TOLERANCE_SECONDS:
        return False

    signed = f"{timestamp}.".encode() + raw_body
    expected = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, received)


# Flask: verify_vink(request.get_data(), request.headers.get("X-Vink-Signature"), SECRET)`,
  },
  {
    id: "php",
    label: "PHP",
    language: "php",
    code: `<?php

const TOLERANCE_SECONDS = 5 * 60;

// $rawBody: the request body exactly as received, before json_decode.
function verify_vink(string $rawBody, ?string $header, string $secret): bool
{
    $parts = [];
    foreach (explode(',', $header ?? '') as $part) {
        [$key, $value] = array_pad(explode('=', trim($part), 2), 2, null);
        $parts[$key] = $value;
    }
    if (!isset($parts['t'], $parts['v1']) || !ctype_digit($parts['t'])) {
        return false;
    }

    $timestamp = (int) $parts['t'];
    if (abs(time() - $timestamp) > TOLERANCE_SECONDS) {
        return false;
    }

    $expected = hash_hmac('sha256', $timestamp . '.' . $rawBody, $secret);
    return hash_equals($expected, $parts['v1']);
}

// $ok = verify_vink(file_get_contents('php://input'), $_SERVER['HTTP_X_VINK_SIGNATURE'] ?? null, $secret);`,
  },
] as const;

export const signatureHeaderExample =
  "X-Vink-Signature: t=1790757291,v1=5257a869e7ecebeda32affa62cdca3fa51cad7e77a0e56ff536d0ce8e108d8bd";
