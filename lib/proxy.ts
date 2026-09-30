// What the Next app tells Convex about a visitor it forwards a request for
// (see convex/lib/clientIp.ts): their IP, vouched for with a secret shared
// with the Convex deployment. Server-only.

const CLIENT_IP_HEADER = "x-vink-client-ip";
const PROXY_SECRET_HEADER = "x-vink-proxy-secret";

/**
 * The visitor's IP as nginx saw it. nginx sets `X-Real-IP` to the address
 * that connected to it, replacing anything the browser sent (deploy/nginx.conf,
 * proxy_params), unlike `X-Forwarded-For`, whose first entry the browser
 * controls. `null` without nginx in front, as in development.
 */
export function clientIp(request: Request) {
  return request.headers.get("x-real-ip")?.trim() || null;
}

/** The headers that carry the visitor's IP to Convex. */
export function proxyHeaders(request: Request): Record<string, string> {
  const ip = clientIp(request);
  const secret = process.env.VINK_PROXY_SECRET;
  return {
    ...(ip && { [CLIENT_IP_HEADER]: ip }),
    ...(secret && { [PROXY_SECRET_HEADER]: secret }),
  };
}

/** The request with those headers, replacing any the browser sent under the same names. */
export function withProxyHeaders(request: Request) {
  const headers = new Headers(request.headers);
  headers.delete(CLIENT_IP_HEADER);
  headers.delete(PROXY_SECRET_HEADER);
  for (const [name, value] of Object.entries(proxyHeaders(request))) headers.set(name, value);
  return new Request(request, { headers });
}
