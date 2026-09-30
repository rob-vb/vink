// Contact and integration-service requests from the marketing site (spec,
// Contact and integration-service requests). The Next app's /api/contact
// route forwards the form with the visitor's IP (see lib/clientIp.ts); this
// HTTP action checks it, limits it per IP and emails it to CONTACT_TO with
// Reply-To set to the visitor. A request is never stored: the rate limit
// keeps only a keyed hash of the IP and the times of the last hour.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { httpAction, internalMutation, type MutationCtx } from "./_generated/server";
import { escapeHtml, sendEmail } from "./email";
import { fromNextApp, trustedClientIp } from "./lib/clientIp";
import { filledHoneypot, HONEYPOT_FIELD } from "./lib/signUpGuard";

const HOUR = 60 * 60 * 1000;
const PER_HOUR = 5;

// Generous limits per field; anything longer isn't a real request.
const LIMITS = {
  name: 200,
  email: 254,
  company: 200,
  system: 200,
  documents: 500,
  pagesPerMonth: 100,
  message: 10_000,
} as const;
const OPTIONAL = ["company", "system", "documents", "pagesPerMonth", "message"] as const;

type Request = {
  kind: "contact" | "integration";
  name: string;
  email: string;
  locale: "en" | "nl" | null;
} & Partial<Record<(typeof OPTIONAL)[number], string>>;

function json(status: number, body: object) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// One address, no spaces or line breaks, a dot in the domain.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$/;

/** The request as sent, or why it was refused. */
function parse(input: unknown): Request | "invalid" | "invalid_email" {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return "invalid";
  const body = input as Record<string, unknown>;
  if (body.kind !== "contact" && body.kind !== "integration") return "invalid";
  if (typeof body.name !== "string" || body.name.trim() === "" || body.name.length > LIMITS.name) {
    return "invalid";
  }
  if (body.locale !== undefined && body.locale !== "en" && body.locale !== "nl") return "invalid";
  const request: Request = {
    kind: body.kind,
    name: body.name.trim(),
    email: "",
    locale: body.locale ?? null,
  };
  for (const key of OPTIONAL) {
    const value = body[key];
    if (value === undefined || value === null) continue;
    if (typeof value !== "string" || value.length > LIMITS[key]) return "invalid";
    if (value.trim() !== "") request[key] = value.trim();
  }
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (email.length > LIMITS.email || !EMAIL.test(email)) return "invalid_email";
  request.email = email;
  return request;
}



function mailOf(request: Request) {
  const rows: Array<[string, string | undefined]> = [
    ["Name", request.name],
    ["Email", request.email],
    ["Company", request.company],
    ["Target system", request.system],
    ["Documents", request.documents],
    ["Pages per month", request.pagesPerMonth],
    ["Language", request.locale ?? undefined],
  ];
  const table = rows
    .filter(([, value]) => value !== undefined)
    .map(([label, value]) => `<tr><th align="left">${label}</th><td>${escapeHtml(value!)}</td></tr>`)
    .join("");
  const message = request.message
    ? `<p style="white-space:pre-wrap">${escapeHtml(request.message)}</p>`
    : "";
  const subject =
    request.kind === "integration"
      ? `Integration request: ${request.name}${request.company ? `, ${request.company}` : ""}`
      : `Contact: ${request.name}`;
  return { subject, html: `<table>${table}</table>${message}<p>Reply to this email to answer.</p>` };
}

/** A keyed hash of the IP, so the table never holds the address itself. */
async function hashOf(ip: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(process.env.VINK_PROXY_SECRET ?? ""),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(`contact|${ip}`));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const submit = httpAction(async (ctx, request) => {
  if (!fromNextApp(request.headers)) return json(403, { error: "forbidden" });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "invalid" });
  }
  // A bot filled in the hidden field: it sees success, nothing is sent.
  if (typeof body === "object" && body !== null && filledHoneypot((body as Record<string, unknown>)[HONEYPOT_FIELD])) {
    return json(200, { ok: true });
  }
  const parsed = parse(body);
  if (parsed === "invalid" || parsed === "invalid_email") return json(400, { error: parsed });

  const allowed = await ctx.runMutation(internal.contact.count, {
    ipHash: await hashOf(trustedClientIp(request.headers)),
  });
  if (!allowed) return json(429, { error: "rate_limited" });

  const to = process.env.CONTACT_TO;
  if (!to) {
    console.error("[Vink] CONTACT_TO is not set: a contact request was dropped");
    return json(500, { error: "unavailable" });
  }
  await sendEmail({ to, replyTo: parsed.email, ...mailOf(parsed) });
  return json(200, { ok: true });
});

/** Counts a request from one IP; whether it is within the hourly limit. */
export const count = internalMutation({
  args: { ipHash: v.string() },
  handler: async (ctx, { ipHash }) => {
    const now = Date.now();
    const row = await ctx.db
      .query("contactRateLimits")
      .withIndex("by_ipHash", (q) => q.eq("ipHash", ipHash))
      .unique();
    const recent = (row?.times ?? []).filter((at) => at > now - HOUR);
    if (recent.length >= PER_HOUR) return false;
    const times = [...recent, now];
    if (row) await ctx.db.patch(row._id, { times, lastAt: now });
    else await ctx.db.insert("contactRateLimits", { ipHash, times, lastAt: now });
    return true;
  },
});

/** Forgets IPs with no request in the last hour (run by the daily cleanup). */
export async function forgetOldContactRequests(ctx: MutationCtx, now: number) {
  const old = await ctx.db
    .query("contactRateLimits")
    .withIndex("by_lastAt", (q) => q.lt("lastAt", now - HOUR))
    .take(500);
  for (const row of old) await ctx.db.delete(row._id);
  return old.length === 500;
}
