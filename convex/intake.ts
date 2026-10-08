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
  type QueryCtx,
} from "./_generated/server";
import { acceptPdf } from "./documents";
import { escapeHtml, sendEmail } from "./email";
import { orgMutation, orgQuery } from "./lib/functions";
import { PDF_TOO_LARGE } from "./lib/pdfLimits";
import { pdfStore } from "./lib/pdfStore";
import { sameSecret } from "./lib/secrets";

const RECENT_EMAILS = 50;
const ALERT_EVERY = 24 * 60 * 60 * 1000;

// Why the Worker skipped an attachment without storing it.
const skipReasons = {
  not_pdf: "Not a PDF.",
  too_large: PDF_TOO_LARGE,
} as const;

/** An unguessable, lower-case local part: 24 characters from 0-9a-z. */
function newToken() {
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

async function ownForm(ctx: QueryCtx, organisationId: Id<"organisations">, formId: Id<"forms">) {
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
    await ownForm(ctx, ctx.organisationId, formId);
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
    outOfItems: v.boolean(),
  },
  handler: async (ctx, { outOfItems, ...email }) => {
    await ctx.db.insert("intakeEmails", email);
    const older = await ctx.db
      .query("intakeEmails")
      .withIndex("by_formId", (q) => q.eq("formId", email.formId))
      .order("desc")
      .collect();
    for (const stale of older.slice(RECENT_EMAILS)) await ctx.db.delete(stale._id);

    if (!outOfItems) return;
    const intake = await ctx.db
      .query("intakeAddresses")
      .withIndex("by_formId", (q) => q.eq("formId", email.formId))
      .unique();
    const now = Date.now();
    // TODO(narrow): read only `outOfItemsAlertAt` (see items.backfillItems).
    const alertedAt = intake?.outOfItemsAlertAt ?? intake?.outOfPagesAlertAt ?? 0;
    if (!intake || alertedAt > now - ALERT_EVERY) return;
    await ctx.db.patch(intake._id, { outOfItemsAlertAt: now, outOfPagesAlertAt: undefined });
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
      await ctx.scheduler.runAfter(0, internal.intake.alertOutOfItems, {
        to: admin.email!,
        formName: form.name,
      });
    }
  },
});

export const alertOutOfItems = internalAction({
  args: { to: v.string(), formName: v.string() },
  handler: async (_ctx, { to, formName }) => {
    const upgrade = `${process.env.SITE_URL ?? ""}/contact`;
    await sendEmail({
      to,
      subject: `Emails to ${formName} are being refused: out of Items`,
      html: `<p>PDFs emailed to the Intake Address of <strong>${escapeHtml(formName)}</strong> are being refused because your Organisation has no items left. Nothing is sent back to the sender.</p><p><a href="${upgrade}">Upgrade to get more items</a></p><p>You get this email at most once a day.</p>`,
    });
  },
});


function reasonOf(error: unknown) {
  if (!(error instanceof ConvexError)) throw error;
  const { data } = error;
  return typeof data === "object" && data !== null && "message" in data
    ? { reason: String(data.message), outOfItems: data.code === "out_of_items" }
    : { reason: String(data), outOfItems: false };
}

const attachment = v.union(
  v.object({ key: v.string(), filename: v.string() }),
  v.object({ filename: v.string(), skipped: v.union(v.literal("not_pdf"), v.literal("too_large")) }),
);

/**
 * One email from the Worker: each PDF attachment passes the same checks as an
 * upload (readable, at most 20 pages, fits the Items) and becomes a Document of
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
    let outOfItems = false;
    for (const a of attachments) {
      if ("skipped" in a) {
        outcomes.push({ filename: a.filename, outcome: "refused" as const, reason: skipReasons[a.skipped] });
        continue;
      }
      try {
        await acceptPdf(ctx, {
          organisationId: target.organisationId,
          formId: target.formId,
          key: a.key,
          filename: a.filename,
          uploadedBy: "email",
          uploaderEmail: `email from ${from}`,
        });
        outcomes.push({ filename: a.filename, outcome: "created" as const, reason: null });
      } catch (error) {
        const refused = reasonOf(error);
        outOfItems ||= refused.outOfItems;
        outcomes.push({ filename: a.filename, outcome: "refused" as const, reason: refused.reason });
      }
    }
    await ctx.runMutation(internal.intake.record, {
      ...target,
      from,
      receivedAt,
      attachments: outcomes,
      outOfItems,
    });
    return { found: true as const, attachments: outcomes };
  },
});

/** POST /intake/email, from the Worker only: `Authorization: Bearer <INTAKE_SECRET>`. */
export const email = httpAction(async (ctx, request) => {
  const secret = process.env.INTAKE_SECRET;
  const given = request.headers.get("Authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret || !sameSecret(given, secret)) {
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

