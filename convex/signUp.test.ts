import betterAuthTest from "@convex-dev/better-auth/test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { components, internal } from "./_generated/api";
import { newBackend } from "./test.setup";

// Sign-up and sign-in go through Better Auth's HTTP routes, as the Next app's
// /api/auth proxy calls them. Resend is the only external system: every mail
// it was asked to send lands in `sent`.

type Backend = ReturnType<typeof newBackend>;

const SITE = "https://vink.test";
const PROXY_SECRET = "proxy-secret-for-tests";
const MINUTE = 60 * 1000;

let sent: { to: string[]; subject: string; html: string }[];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-30T09:00:00Z"));
  vi.stubEnv("SITE_URL", SITE);
  vi.stubEnv("BETTER_AUTH_SECRET", "a-long-enough-secret-for-better-auth-tests");
  vi.stubEnv("RESEND_API_KEY", "re_test");
  vi.stubEnv("VINK_PROXY_SECRET", PROXY_SECRET);
  sent = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      sent.push(JSON.parse(init.body as string));
      return new Response(JSON.stringify({ id: "email_1" }), { status: 200 });
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function backend() {
  const t = newBackend();
  betterAuthTest.register(t, "betterAuth");
  return t;
}

type From = { ip?: string; proxied?: boolean; forgedIp?: string };

/** A browser's request, as the Next app forwards it: with the visitor's IP and the proxy secret. */
async function post(t: Backend, path: string, body: object, { ip = "203.0.113.7", proxied = true, forgedIp }: From = {}) {
  const headers: Record<string, string> = { "content-type": "application/json", origin: SITE };
  if (proxied) {
    headers["x-vink-client-ip"] = ip;
    headers["x-vink-proxy-secret"] = PROXY_SECRET;
  }
  if (forgedIp) {
    headers["x-vink-client-ip"] = forgedIp;
    headers["x-forwarded-for"] = forgedIp;
    headers["x-real-ip"] = forgedIp;
  }
  const response = await t.fetch(`/api/auth${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null, headers: response.headers };
}

const signUp = (t: Backend, email: string, extra: object = {}, from?: From) =>
  post(t, "/sign-up/email", { name: email.split("@")[0], email, password: "correct horse battery", ...extra }, from);

const signIn = (t: Backend, email: string, password = "correct horse battery", from?: From) =>
  post(t, "/sign-in/email", { email, password }, from);

const magicLink = (t: Backend, email: string, extra: object = {}, from?: From) =>
  post(t, "/sign-in/magic-link", { email, callbackURL: "/app", ...extra }, from);

/** The one link in the last mail to `to`. */
function linkSentTo(to: string) {
  const mail = sent.findLast((m) => m.to.includes(to));
  expect(mail, `no mail to ${to}`).toBeDefined();
  const href = mail!.html.match(/href="([^"]+)"/)?.[1];
  expect(href, "no link in the mail").toBeDefined();
  return new URL(href!.replaceAll("&amp;", "&"));
}

test("a free-mail address can sign up with a password, and gets a verification link that lands in the app", async () => {
  const t = backend();

  const response = await signUp(t, "ann@gmail.com", { callbackURL: "/app/welcome?organisation=Kantoor+Noord" });

  expect(response.status).toBe(200);
  const link = linkSentTo("ann@gmail.com");
  expect(link.origin).toBe(SITE);
  expect(link.pathname).toBe("/api/auth/verify-email");
  expect(link.searchParams.get("callbackURL")).toBe("/app/welcome?organisation=Kantoor+Noord");
});

test("a verification link asked for without a callback still lands under /app, never on the marketing site", async () => {
  const t = backend();

  await signUp(t, "ann@gmail.com");

  expect(linkSentTo("ann@gmail.com").searchParams.get("callbackURL")).toBe("/app");
});

test("password sign-in is refused until the email is verified; after the link, it works", async () => {
  const t = backend();
  await signUp(t, "ann@hoekstra.nl", { callbackURL: "/app/welcome" });

  const before = await signIn(t, "ann@hoekstra.nl");
  expect(before.status).toBe(403);
  expect(before.body.code).toBe("EMAIL_NOT_VERIFIED");
  // Trying to sign in sends a fresh link, which also lands in the app.
  expect(linkSentTo("ann@hoekstra.nl").searchParams.get("callbackURL")).toBe("/app");

  const link = linkSentTo("ann@hoekstra.nl");
  const verified = await t.fetch(`${link.pathname}${link.search}`, { method: "GET" });
  expect(verified.status).toBe(302);
  expect(verified.headers.get("location")).toBe("/app");

  expect((await signIn(t, "ann@hoekstra.nl")).status).toBe(200);
});

test("a disposable address is refused at sign-up with a plain message, and gets no mail", async () => {
  const t = backend();

  const response = await signUp(t, "ann@mailinator.com");

  expect(response.status).toBe(400);
  expect(response.body.message).toBe("This email address can't be used. Use your work or personal address.");
  expect(sent).toEqual([]);
  expect((await signIn(t, "ann@mailinator.com")).status).toBe(401);
});

test("a disposable address can't get a sign-up link either", async () => {
  const t = backend();

  const response = await magicLink(t, "ann@10minutemail.com");

  expect(response.status).toBe(400);
  expect(response.body.message).toBe("This email address can't be used. Use your work or personal address.");
  expect(sent).toEqual([]);
});

test("a +tag or dots in the address are left alone", async () => {
  const t = backend();

  expect((await signUp(t, "ann+vink@gmail.com")).status).toBe(200);
  expect((await signUp(t, "a.n.n@gmail.com")).status).toBe(200);
  expect(sent.map((m) => m.to[0])).toEqual(["ann+vink@gmail.com", "a.n.n@gmail.com"]);
});

test("a sign-up with the hidden honeypot field filled in is refused, and nothing is created or sent", async () => {
  const t = backend();

  const password = await signUp(t, "bot@gmail.com", { website: "https://cheap-pills.example" });
  const link = await magicLink(t, "bot2@gmail.com", { website: "https://cheap-pills.example" });

  expect(password.status).toBe(400);
  expect(link.status).toBe(400);
  expect(sent).toEqual([]);
  expect((await signIn(t, "bot@gmail.com")).status).toBe(401);
});

test("sign-up is limited to 5 per 10 minutes per IP", async () => {
  const t = backend();
  for (let i = 1; i <= 5; i++) {
    expect((await signUp(t, `user${i}@gmail.com`)).status).toBe(200);
  }

  expect((await signUp(t, "user6@gmail.com")).status).toBe(429);
  expect((await signUp(t, "user6@gmail.com", {}, { ip: "198.51.100.20" })).status).toBe(200);

  vi.setSystemTime(Date.now() + 11 * MINUTE);
  expect((await signUp(t, "user7@gmail.com")).status).toBe(200);
});

test("password sign-in is limited to 5 tries per 10 minutes per IP", async () => {
  const t = backend();
  await signUp(t, "ann@gmail.com", {}, { ip: "198.51.100.1" });
  const link = linkSentTo("ann@gmail.com");
  await t.fetch(`${link.pathname}${link.search}`, { method: "GET" });
  for (let i = 0; i < 5; i++) {
    expect((await signIn(t, "ann@gmail.com", "wrong guess")).status).toBe(401);
  }

  expect((await signIn(t, "ann@gmail.com")).status).toBe(429);
  expect((await signIn(t, "ann@gmail.com", undefined, { ip: "198.51.100.2" })).status).toBe(200);
});

test("magic links: 5 per 10 minutes per IP, and 3 per hour per address", async () => {
  const t = backend();
  for (let i = 1; i <= 3; i++) {
    expect((await magicLink(t, "ann@gmail.com", {}, { ip: `198.51.100.${i}` })).status).toBe(200);
  }
  const fourth = await magicLink(t, "ann@gmail.com", {}, { ip: "198.51.100.4" });
  expect(fourth.status).toBe(429);
  expect(sent).toHaveLength(3);

  expect((await magicLink(t, "bob@gmail.com", {}, { ip: "198.51.100.4" })).status).toBe(200);
  for (let i = 1; i <= 4; i++) await magicLink(t, `c${i}@gmail.com`, {}, { ip: "198.51.100.9" });
  expect((await magicLink(t, "c5@gmail.com", {}, { ip: "198.51.100.9" })).status).toBe(200);
  expect((await magicLink(t, "c6@gmail.com", {}, { ip: "198.51.100.9" })).status).toBe(429);

  vi.setSystemTime(Date.now() + 61 * MINUTE);
  expect((await magicLink(t, "ann@gmail.com", {}, { ip: "198.51.100.4" })).status).toBe(200);
});

test("the daily cleanup forgets rate-limit counters (IP addresses, emails) a day after their last request", async () => {
  const t = backend();
  const counters = () =>
    t.run(async (ctx) => {
      const page = await ctx.runQuery(components.betterAuth.adapter.findMany, {
        model: "rateLimit",
        paginationOpts: { cursor: null, numItems: 100 },
      });
      return (page.page as { key: string }[]).map((row) => row.key).sort();
    });
  await magicLink(t, "ann@gmail.com", {}, { ip: "198.51.100.1" });
  vi.setSystemTime(Date.now() + 2 * 60 * MINUTE);
  await magicLink(t, "bob@gmail.com", {}, { ip: "198.51.100.2" });
  const all = await counters();
  expect(all.some((key) => key.includes("198.51.100.1"))).toBe(true);
  expect(all).toContain("magic-link-email|ann@gmail.com");

  vi.setSystemTime(Date.now() + 23 * 60 * MINUTE);
  await t.mutation(internal.auth.forgetOldRateLimits, {});
  const left = await counters();
  expect(left.some((key) => key.includes("198.51.100.1") || key.includes("ann@"))).toBe(false);
  expect(left).toContain("magic-link-email|bob@gmail.com");
  expect(left.some((key) => key.includes("198.51.100.2"))).toBe(true);
});

test("accounts from before verification was required are marked verified by the migration, so they can still sign in", async () => {
  const t = backend();
  await signUp(t, "test@test.nl");
  expect((await signIn(t, "test@test.nl")).status).toBe(403);

  await t.mutation(internal.auth.verifyExistingUsers, {});

  expect((await signIn(t, "test@test.nl", undefined, { ip: "198.51.100.3" })).status).toBe(200);
});

test("a caller going around the Next app can't pick its own IP: all such callers share one limit", async () => {
  const t = backend();
  for (let i = 1; i <= 5; i++) {
    const response = await signUp(t, `user${i}@gmail.com`, {}, { proxied: false, forgedIp: `192.0.2.${i}` });
    expect(response.status).toBe(200);
  }

  const sixth = await signUp(t, "user6@gmail.com", {}, { proxied: false, forgedIp: "192.0.2.99" });
  expect(sixth.status).toBe(429);
  // A real visitor coming through the Next app isn't affected.
  expect((await signUp(t, "user6@gmail.com")).status).toBe(200);
});
