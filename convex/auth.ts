import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { betterAuth } from "better-auth/minimal";
import { magicLink } from "better-auth/plugins";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import authConfig from "./auth.config";
import { sendEmail } from "./email";
import { CLIENT_IP_HEADER } from "./lib/clientIp";
import {
  countIn,
  DISPOSABLE_EMAIL_MESSAGE,
  filledHoneypot,
  HONEYPOT_FIELD,
  isDisposableEmail,
  type Window,
} from "./lib/signUpGuard";

const siteUrl = process.env.SITE_URL!;

export const authComponent = createClient<DataModel>(components.betterAuth);

const MINUTE = 60;
// Per IP (see lib/clientIp.ts), in Better Auth's own rate limiter.
const PER_IP = { window: 10 * MINUTE, max: 5 };
// Per address, counted by the hook below: Better Auth only keys on IP.
const MAGIC_LINKS_PER_EMAIL = { max: 3, windowMs: 60 * MINUTE * 1000 };

/** Where a mailed link lands after verifying: inside the app, never the marketing site. */
function landingInApp(url: string) {
  const link = new URL(url);
  const callback = link.searchParams.get("callbackURL") ?? "";
  if (callback !== "/app" && !callback.startsWith("/app/") && !callback.startsWith("/app?")) {
    link.searchParams.set("callbackURL", "/app");
  }
  return link.toString();
}

export const createAuth = (ctx: GenericCtx<DataModel>) =>
  betterAuth({
    baseURL: siteUrl,
    trustedOrigins: [siteUrl],
    database: authComponent.adapter(ctx),
    // A password sign-up can't sign in before its address is verified;
    // magic-link sign-ups verify by nature.
    emailAndPassword: { enabled: true, requireEmailVerification: true },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await sendEmail({
          to: user.email,
          subject: "Verify your email for Vink",
          html: `<p><a href="${landingInApp(url)}">Verify your email and open Vink</a></p><p>This link expires in 1 hour.</p>`,
        });
      },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      // The first matching rule wins. Only these paths are limited: the rest
      // (session and token refreshes) is also called server-side, around the
      // proxy, where every caller would share one IP.
      customRules: {
        "/sign-up/email": PER_IP,
        "/sign-in/email": PER_IP,
        "/sign-in/magic-link": PER_IP,
        "/send-verification-email": PER_IP,
        "/**": false,
      },
    },
    advanced: {
      // Set by convex/http.ts from what the Next app vouches for, never by the caller.
      ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-up/email" && ctx.path !== "/sign-in/magic-link") return;
        const body = (ctx.body ?? {}) as Record<string, unknown>;
        if (filledHoneypot(body[HONEYPOT_FIELD])) {
          throw new APIError("BAD_REQUEST", { message: "We couldn't create your account. Try again." });
        }
        const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
        if (email === "") return;
        if (isDisposableEmail(email)) {
          // A magic link to an existing account is a sign-in, not a sign-up.
          const existing =
            ctx.path === "/sign-in/magic-link" &&
            (await ctx.context.internalAdapter.findUserByEmail(email)) !== null;
          if (!existing) {
            throw new APIError("BAD_REQUEST", { message: DISPOSABLE_EMAIL_MESSAGE, code: "DISPOSABLE_EMAIL" });
          }
        }
        if (ctx.path === "/sign-in/magic-link") {
          await countMagicLink(ctx.context.adapter, email);
        }
      }),
    },
    plugins: [
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          await sendEmail({
            to: email,
            subject: "Your Vink sign-in link",
            html: `<p><a href="${url}">Sign in to Vink</a></p><p>This link expires in 5 minutes.</p>`,
          });
        },
      }),
      convex({ authConfig }),
    ],
  });

/**
 * One-off migration for `requireEmailVerification`: accounts that signed up
 * with a password before it existed are marked verified, so they can still
 * sign in. Run once with `npx convex run auth:verifyExistingUsers`.
 */
export const verifyExistingUsers = internalMutation({
  args: {},
  handler: async (ctx) => {
    let verified = 0;
    let cursor: string | null = null;
    for (;;) {
      const page: { count?: number; isDone: boolean; continueCursor: string } = await ctx.runMutation(
        components.betterAuth.adapter.updateMany,
        {
          input: {
            model: "user",
            where: [{ field: "emailVerified", operator: "eq", value: false }],
            update: { emailVerified: true },
          },
          paginationOpts: { cursor, numItems: 500 },
        },
      );
      verified += page.count ?? 0;
      if (page.isDone) return { verified };
      cursor = page.continueCursor;
    }
  },
});

type Adapter =Parameters<Parameters<typeof createAuthMiddleware>[0]>[0]["context"]["adapter"];

/**
 * Counts a magic link to `email` in Better Auth's own `rateLimit` table, next
 * to its per-IP counters; refuses the fourth within an hour.
 */
async function countMagicLink(adapter: Adapter, email: string) {
  const key = `magic-link-email|${email}`;
  const stored = await adapter.findOne<{ count: number; lastRequest: number }>({
    model: "rateLimit",
    where: [{ field: "key", value: key }],
  });
  // `lastRequest` holds the window's start here.
  const window: Window | null = stored ? { count: stored.count, start: Number(stored.lastRequest) } : null;
  const next = countIn(window, Date.now(), MAGIC_LINKS_PER_EMAIL);
  if (!next.allowed) {
    throw new APIError("TOO_MANY_REQUESTS", {
      message: "We've sent this address several links already. Try again in an hour.",
    });
  }
  const data = { count: next.window.count, lastRequest: next.window.start };
  if (stored) {
    await adapter.updateMany({ model: "rateLimit", where: [{ field: "key", value: key }], update: data });
  } else {
    await adapter.create({ model: "rateLimit", data: { key, ...data } });
  }
}
