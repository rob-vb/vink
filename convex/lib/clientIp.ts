// Which client a request to a Convex HTTP route came from, for per-IP limits.
//
// Browsers never call Convex's HTTP routes directly: they call the Next app
// (`/api/auth/*`, `/api/contact`), which forwards the request with the
// visitor's IP, as nginx saw it, and a secret shared with this deployment
// (`VINK_PROXY_SECRET`, set on both sides). Anyone can reach the Convex site
// URL too, and set any header there, so an IP only counts when the secret
// matches. Every other caller shares one bucket, `UNPROXIED`, which keeps
// the per-IP limits from being dodged by going around the Next app.

import { sameSecret } from "./secrets";

export const CLIENT_IP_HEADER = "x-vink-client-ip";
export const PROXY_SECRET_HEADER = "x-vink-proxy-secret";

/** The shared bucket for callers that didn't come through the Next app. */
export const UNPROXIED = "0.0.0.0";

const IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;
const IPV6 = /^[0-9a-f:.]+$/i;


/** Whether the request carries this deployment's proxy secret. */
export function fromNextApp(headers: Headers) {
  const secret = process.env.VINK_PROXY_SECRET;
  const given = headers.get(PROXY_SECRET_HEADER);
  return Boolean(secret) && given !== null && sameSecret(given, secret!);
}

/** The visitor's IP when the Next app vouches for it, else `UNPROXIED`. */
export function trustedClientIp(headers: Headers) {
  if (!fromNextApp(headers)) return UNPROXIED;
  const ip = headers.get(CLIENT_IP_HEADER)?.trim() ?? "";
  return IPV4.test(ip) || (ip.includes(":") && IPV6.test(ip)) ? ip : UNPROXIED;
}

/**
 * The request as Better Auth should see it: the only IP header it reads
 * (`CLIENT_IP_HEADER`, see auth.ts) holds the trusted IP, and the secret is
 * dropped.
 */
export function withTrustedClientIp(request: Request) {
  const headers = new Headers(request.headers);
  headers.set(CLIENT_IP_HEADER, trustedClientIp(request.headers));
  headers.delete(PROXY_SECRET_HEADER);
  return new Request(request, { headers });
}
