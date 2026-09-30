// Email-in: a Form's Intake Address. A Cloudflare Worker (workers/intake-email)
// receives the mail, puts each PDF attachment in R2 and calls `receive` over
// HTTP; every attachment then passes the same checks as an upload.
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  httpAction,
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "./_generated/server";
import { checkPdf } from "./documents";
import { sendEmail } from "./email";
import { orgMutation, orgQuery } from "./lib/functions";
import { pdfStore } from "./lib/pdfStore";

const RECENT_EMAILS = 50;
const ALERT_EVERY = 24 * 60 * 60 * 1000;

// Why the Worker skipped an attachment without storing it.
const skipReasons = {
  not_pdf: "Not a PDF.",
  too_large: "The attachment is larger than 25 MB.",
} as const;

/** An unguessable, lower-case local part: 24 characters from 0-9a-z. */
function newToken() {
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

async function ownForm(ctx: MutationCtx, organisationId: Id<"organisations">, formId: Id<"forms">) {
  const form = await ctx.db.get(formId);
  if (form === null || form.organisationId !== organisationId) {
    throw new ConvexError("Form not found");
  }
  return form;
}

function addressOf(token: string) {
  const domain = process.env.INBOUND_DOMAIN;
  return domain ? `${token}@${domain}` : null;
}

/** The Form's Intake Address and its Recent emails, newest first. Every Member may see it. */
export const get = orgQuery({
  args: { formId: v.id("forms") },
  handler: async (ctx, { formId }) => {
    const form = await ctx.db.get(formId);
    if (form === null || form.organisationId !== ctx.organisationId) {
      throw new ConvexError("Form not found");
    }
    const intake = await ctx.db
      .query("intakeAddresses")
      .withIndex("by_formId", (q) => q.eq("formId", formId))
      .unique();
    const emails = await ctx.db
      .query("intakeEmails")
      .withIndex("by_formId", (q) => q.eq("formId", formId))
      .order("desc")
      .take(RECENT_EMAILS);
    return {
      address: intake ? addressOf(intake.token) : null,
      // Switched on, but this deployment has no INBOUND_DOMAIN yet.
      pendingDomain: intake !== null && !process.env.INBOUND_DOMAIN,
      recentEmails: emails.map((e) => ({
        id: e._id,
        from: e.from,
        receivedAt: e.receivedAt,
        attachments: e.attachments,
      })),
    };
  },
});

export const switchOn = orgMutation({
  role: "admin",
  args: { formId: v.id("forms") },
  handler: async (ctx, { formId }) => {
    await ownForm(ctx, ctx.organisationId, formId);
    const existing = await ctx.db
      .query("intakeAddresses")
      .withIndex("by_formId", (q) => q.eq("formId", formId))
      .unique();
    if (existing) return;
    await ctx.db.insert("intakeAddresses", {
      organisationId: ctx.organisationId,
      formId,
      token: newToken(),
    });
  },
});

async function removeAddress(ctx: MutationCtx, formId: Id<"forms">) {
  const existing = await ctx.db
    .query("intakeAddresses")
    .withIndex("by_formId", (q) => q.eq("formId", formId))
    .unique();
  if (existing) await ctx.db.delete(existing._id);
}

export const switchOff = orgMutation({
  role: "admin",
  args: { formId: v.id("forms") },
  handler: async (ctx, { formId }) => {
    await ownForm(ctx, ctx.organisationId, formId);
    await removeAddress(ctx, formId);
  },
});

/** A new address for the Form; the old one stops at once (e.g. after a leak). */
export const replace = orgMutation({
  role: "admin",
  args: { formId: v.id("forms") },
  handler: async (ctx, { formId }) => {
    await ownForm(ctx, ctx.organisationId, formId);
    await removeAddress(ctx, formId);
    await ctx.db.insert("intakeAddresses", {
      organisationId: ctx.organisationId,
      formId,
      token: newToken(),
    });
  },
});

export const resolve = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const intake = await ctx.db
      .query("intakeAddresses")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    return intake && { organisationId: intake.organisationId, formId: intake.formId };
  },
});

const outcome = v.object({
  filename: v.string(),
  outcome: v.union(v.literal("created"), v.literal("refused")),
  reason: v.union(v.string(), v.null()),
});

/** Keeps the email in Recent emails, and drops what falls past the last 50. */
export const record = internalMutation({
  args: {
    organisationId: v.id("organisations"),
    formId: v.id("forms"),
    from: v.string(),
    receivedAt: v.number(),
    attachments: v.array(outcome),
    outOfPages: v.boolean(),
  },
  handler: async (ctx, { outOfPages, ...email }) => {
    await ctx.db.insert("intakeEmails", email);
    const older = await ctx.db
      .query("intakeEmails")
      .withIndex("by_formId", (q) => q.eq("formId", email.formId))
      .order("desc")
      .collect();
    for (const stale of older.slice(RECENT_EMAILS)) await ctx.db.delete(stale._id);

    if (!outOfPages) return;
    const intake = await ctx.db
      .query("intakeAddresses")
      .withIndex("by_formId", (q) => q.eq("formId", email.formId))
      .unique();
    const now = Date.now();
    if (!intake || (intake.outOfPagesAlertAt ?? 0) > now - ALERT_EVERY) return;
    await ctx.db.patch(intake._id, { outOfPagesAlertAt: now });
    const form = (await ctx.db.get(email.formId))!;
    const admins = (
      await ctx.db
        .query("memberships")
        .withIndex("by_organisationId_and_userId", (q) =>
          q.eq("organisationId", email.organisationId),
        )
        .collect()
    ).filter((m) => m.role === "admin" && m.email);
    for (const admin of admins) {
      await ctx.scheduler.runAfter(0, internal.intake.alertOutOfPages, {
        to: admin.email!,
        formName: form.name,
      });
    }
  },
});

export const alertOutOfPages = internalAction({
  args: { to: v.string(), formName: v.string() },
  handler: async (_ctx, { to, formName }) => {
    const upgrade = `${process.env.SITE_URL ?? ""}/contact`;
    await sendEmail({
      to,
      subject: `Emails to ${formName} are being refused: out of Pages`,
      html: `<p>PDFs emailed to the Intake Address of <strong>${escapeHtml(formName)}</strong> are being refused because your Organisation has no pages left. Nothing is sent back to the sender.</p><p><a href="${upgrade}">Upgrade to get more pages</a></p><p>You get this email at most once a day.</p>`,
    });
  },
});

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function reasonOf(error: unknown) {
  if (!(error instanceof ConvexError)) throw error;
  const { data } = error;
  return typeof data === "object" && data !== null && "message" in data
    ? { reason: String(data.message), outOfPages: data.code === "out_of_pages" }
    : { reason: String(data), outOfPages: false };
}

const attachment = v.union(
  v.object({ key: v.string(), filename: v.string() }),
  v.object({ filename: v.string(), skipped: v.union(v.literal("not_pdf"), v.literal("too_large")) }),
);

/**
 * One email from the Worker: each PDF attachment passes the same checks as an
 * upload (readable, at most 20 pages, fits the Pages) and becomes a Document of
 * the Form. A refused one creates nothing and is removed from R2.
 */
export const receive = internalAction({
  args: {
    token: v.string(),
    from: v.string(),
    receivedAt: v.number(),
    attachments: v.array(attachment),
  },
  handler: async (ctx, { token, from, receivedAt, attachments }) => {
    const target = await ctx.runQuery(internal.intake.resolve, { token });
    if (target === null) {
      for (const a of attachments) if ("key" in a) await pdfStore.remove(ctx, a.key);
      return { found: false as const };
    }
    const outcomes = [];
    let outOfPages = false;
    for (const a of attachments) {
      if ("skipped" in a) {
        outcomes.push({ filename: a.filename, outcome: "refused" as const, reason: skipReasons[a.skipped] });
        continue;
      }
      try {
        const pageCount = await checkPdf(ctx, a.key);
        try {
          await ctx.runMutation(internal.documents.insert, {
            organisationId: target.organisationId,
            formId: target.formId,
            key: a.key,
            filename: a.filename,
            pageCount,
            uploadedBy: "email",
            uploaderEmail: `email from ${from}`,
          });
        } catch (error) {
          await pdfStore.remove(ctx, a.key);
          throw error;
        }
        outcomes.push({ filename: a.filename, outcome: "created" as const, reason: null });
      } catch (error) {
        const refused = reasonOf(error);
        outOfPages ||= refused.outOfPages;
        outcomes.push({ filename: a.filename, outcome: "refused" as const, reason: refused.reason });
      }
    }
    await ctx.runMutation(internal.intake.record, {
      ...target,
      from,
      receivedAt,
      attachments: outcomes,
      outOfPages,
    });
    return { found: true as const, attachments: outcomes };
  },
});

/** POST /intake/email, from the Worker only: `Authorization: Bearer <INTAKE_SECRET>`. */
export const email = httpAction(async (ctx, request) => {
  const secret = process.env.INTAKE_SECRET;
  const given = request.headers.get("Authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret || !(await sameSecret(given, secret))) {
    return new Response("Unauthorized", { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const { token, from, receivedAt, attachments } = body as {
    token: string;
    from: string;
    receivedAt: number;
    attachments: Array<{ key: string; filename: string } | { filename: string; skipped: "not_pdf" | "too_large" }>;
  };
  let result;
  try {
    result = await ctx.runAction(internal.intake.receive, {
      token: String(token).toLowerCase(),
      from,
      receivedAt,
      attachments,
    });
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  if (!result.found) return new Response("Unknown address", { status: 404 });
  return Response.json({ attachments: result.attachments });
});

/** Compares in constant time, via HMAC, so the secret can't be guessed byte by byte. */
async function sameSecret(a: string, b: string) {
  const key = await crypto.subtle.generateKey({ name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const [ha, hb] = await Promise.all(
    [a, b].map(async (s) => new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(s)))),
  );
  let diff = 0;
  for (let i = 0; i < ha.length; i++) diff |= ha[i] ^ hb[i];
  return diff === 0;
}
