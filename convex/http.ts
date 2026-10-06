import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { createAuth } from "./auth";
import { submit } from "./contact";
import { email } from "./intake";
import { withTrustedClientIp } from "./lib/clientIp";
import { registerPublicApi } from "./publicApi/routes";

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

// Email-in: the Cloudflare Worker hands over each email sent to an Intake Address.
http.route({ path: "/intake/email", method: "POST", handler: email });

// Stripe's webhooks: Subscriptions and Top-ups (billing.ts). Any status but
// 2xx makes Stripe send the event again later.
http.route({
  path: "/stripe/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const signature = request.headers.get("stripe-signature");
    if (signature === null) return new Response("Missing signature", { status: 400 });
    const handled = await ctx.runAction(internal.billing.webhook, {
      payload: await request.text(),
      signature,
    });
    return handled ? new Response(null, { status: 200 }) : new Response("Bad signature", { status: 400 });
  }),
});

// The public API, /v1, for programs with an API Key (publicApi/).
registerPublicApi(http);

export default http;
