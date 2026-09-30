import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { createAuth } from "./auth";
import { submit } from "./contact";
import { withTrustedClientIp } from "./lib/clientIp";

const http = httpRouter();

// Better Auth's routes, as `authComponent.registerRoutes` sets them up, but
// with the caller's IP taken only from what the Next app vouches for, so the
// per-IP rate limits can't be dodged (see lib/clientIp.ts).
const authRequest = httpAction(async (ctx, request) => {
  const headers = new Headers(request.headers);
  // The Next proxy passes the browser's host and scheme on under these names.
  const host = request.headers.get("x-better-auth-forwarded-host");
  const proto = request.headers.get("x-better-auth-forwarded-proto");
  if (host) headers.set("x-forwarded-host", host);
  if (proto) headers.set("x-forwarded-proto", proto);
  return await createAuth(ctx).handler(withTrustedClientIp(new Request(request, { headers })));
});

http.route({ pathPrefix: "/api/auth/", method: "GET", handler: authRequest });
http.route({ pathPrefix: "/api/auth/", method: "POST", handler: authRequest });

http.route({
  path: "/.well-known/openid-configuration",
  method: "GET",
  handler: httpAction(async () =>
    Response.redirect(`${process.env.CONVEX_SITE_URL}/api/auth/convex/.well-known/openid-configuration`),
  ),
});

// The marketing site's contact form, forwarded by the Next app (app/api/contact).
http.route({ path: "/contact", method: "POST", handler: submit });

export default http;
