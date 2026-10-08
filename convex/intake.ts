// Email-in: an Intake Address, of a Form or of the Organisation. A Cloudflare
// Worker (workers/intake-email) receives the mail, puts each PDF and image
// attachment in R2 and calls `receive` over HTTP with the subject, date and
// text. Every attachment passes the same checks as an upload, and Jev decides
// whether the email is one Document or several (lib/mailPlan.ts, ADR 0010).
// Mail to a Form's address is that Form's; mail to the Organisation's address
// has no Form, and the Router picks it after Read.
import { ConvexError, type ObjectType, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  httpAction,
  internalAction,
  internalMutation,
  internalQuery,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { checkPdf, createDocument } from "./documents";
import { escapeHtml, sendEmail } from "./email";
import { chargeItems } from "./items";
import { orgMutation, orgQuery } from "./lib/functions";
import {
  ATTACHMENTS_TOO_LARGE,
  EMAIL_BODY_TOO_LARGE,
  IMAGE_MIME_TYPES,
  IMAGE_TOO_LARGE,
  MAX_EMAIL_ATTACHMENT_BYTES,
  MAX_EMAIL_ATTACHMENTS,
  MAX_EMAIL_BODY_BYTES,
  MAX_IMAGE_BYTES,
  PDF_MIME_TYPE,
  PDF_TOO_LARGE,
  TOO_MANY_ATTACHMENTS,
  UNSUPPORTED_TYPE,
} from "./lib/inputLimits";
import { itemsOfMail, itemsOfPlanned, type MailPart, needsSplitCall, planMail } from "./lib/mailPlan";
import { pdfStore } from "./lib/pdfStore";
import { sameSecret } from "./lib/secrets";
import { emailFilename, storeEmail } from "./lib/storedEmail";

const RECENT_EMAILS = 50;
const ALERT_EVERY = 24 * 60 * 60 * 1000;

// Why an email part was refused without a Document: the texts of lib/inputLimits.ts.
export { UNSUPPORTED_TYPE };

// Why the Worker skipped an attachment without storing it.
const skipReasons = {
  unsupported_type: UNSUPPORTED_TYPE,
  too_large: PDF_TOO_LARGE,
  image_too_large: IMAGE_TOO_LARGE,
  too_many_attachments: TOO_MANY_ATTACHMENTS,
  attachments_too_large: ATTACHMENTS_TOO_LARGE,
} as const;

const skipped = v.union(
  v.literal("unsupported_type"),
  v.literal("too_large"),
  v.literal("image_too_large"),
  v.literal("too_many_attachments"),
  v.literal("attachments_too_large"),
);

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

/** Checks the Form belongs to the Organisation; `undefined` is the Organisation's own address. */
async function checkScope(ctx: QueryCtx, organisationId: Id<"organisations">, formId?: Id<"forms">) {
  if (formId !== undefined) await ownForm(ctx, organisationId, formId);
}

/** The Form's Intake Address, or with no `formId`, the Organisation's. */
function addressOf(ctx: QueryCtx, organisationId: Id<"organisations">, formId?: Id<"forms">) {
  return ctx.db
    .query("intakeAddresses")
    .withIndex("by_organisationId_and_formId", (q) =>
      q.eq("organisationId", organisationId).eq("formId", formId),
    )
    .unique();
}

function addressText(token: string) {
  const domain = process.env.INBOUND_DOMAIN;
  return domain ? `${token}@${domain}` : null;
}

/**
 * The Intake Address of a Form, or with no `formId` of the Organisation, and its
 * Recent emails, newest first. Every Member may see it.
 */
export const get = orgQuery({
  args: { formId: v.optional(v.id("forms")) },
  handler: async (ctx, { formId }) => {
    await checkScope(ctx, ctx.organisationId, formId);
    const intake = await addressOf(ctx, ctx.organisationId, formId);
    const emails = await ctx.db
      .query("intakeEmails")
      .withIndex("by_organisationId_and_formId", (q) =>
        q.eq("organisationId", ctx.organisationId).eq("formId", formId),
      )
      .order("desc")
      .take(RECENT_EMAILS);
    return {
      address: intake ? addressText(intake.token) : null,
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
  args: { formId: v.optional(v.id("forms")) },
  handler: async (ctx, { formId }) => {
    await checkScope(ctx, ctx.organisationId, formId);
    if (await addressOf(ctx, ctx.organisationId, formId)) return;
    await ctx.db.insert("intakeAddresses", {
      organisationId: ctx.organisationId,
      formId,
      token: newToken(),
    });
  },
});

async function removeAddress(ctx: MutationCtx, organisationId: Id<"organisations">, formId?: Id<"forms">) {
  const existing = await addressOf(ctx, organisationId, formId);
  if (existing) await ctx.db.delete(existing._id);
}

export const switchOff = orgMutation({
  role: "admin",
  args: { formId: v.optional(v.id("forms")) },
  handler: async (ctx, { formId }) => {
    await checkScope(ctx, ctx.organisationId, formId);
    await removeAddress(ctx, ctx.organisationId, formId);
  },
});

/** A new address; the old one stops at once (e.g. after a leak). */
export const replace = orgMutation({
  role: "admin",
  args: { formId: v.optional(v.id("forms")) },
  handler: async (ctx, { formId }) => {
    await checkScope(ctx, ctx.organisationId, formId);
    await removeAddress(ctx, ctx.organisationId, formId);
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
    // No `formId`: the Organisation's address, and the Router picks the Form.
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
    formId: v.optional(v.id("forms")),
    from: v.string(),
    receivedAt: v.number(),
    attachments: v.array(outcome),
    outOfItems: v.boolean(),
  },
  handler: async (ctx, { outOfItems, ...email }) => {
    await ctx.db.insert("intakeEmails", email);
    const older = await ctx.db
      .query("intakeEmails")
      .withIndex("by_organisationId_and_formId", (q) =>
        q.eq("organisationId", email.organisationId).eq("formId", email.formId),
      )
      .order("desc")
      .collect();
    for (const stale of older.slice(RECENT_EMAILS)) await ctx.db.delete(stale._id);

    if (!outOfItems) return;
    const intake = await addressOf(ctx, email.organisationId, email.formId);
    const now = Date.now();
    // TODO(narrow): read only `outOfItemsAlertAt` (see items.backfillItems).
    const alertedAt = intake?.outOfItemsAlertAt ?? intake?.outOfPagesAlertAt ?? 0;
    if (!intake || alertedAt > now - ALERT_EVERY) return;
    await ctx.db.patch(intake._id, { outOfItemsAlertAt: now, outOfPagesAlertAt: undefined });
    const form = email.formId === undefined ? null : await ctx.db.get(email.formId);
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
        // `null`: the Organisation's address.
        formName: form?.name ?? null,
      });
    }
  },
});

export const alertOutOfItems = internalAction({
  args: { to: v.string(), formName: v.union(v.string(), v.null()) },
  handler: async (_ctx, { to, formName }) => {
    const upgrade = `${process.env.SITE_URL ?? ""}/contact`;
    const where = formName === null ? "the Organisation Intake Address" : formName;
    await sendEmail({
      to,
      subject: `Emails to ${where} are being refused: out of Items`,
      html: `<p>Emails sent to <strong>${escapeHtml(where)}</strong> are being refused because your Organisation has no items left. Nothing is sent back to the sender.</p><p><a href="${upgrade}">Upgrade to get more items</a></p><p>You get this email at most once a day.</p>`,
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
  // `mimeType` is the Worker's (application/pdf or an image type).
  v.object({ key: v.string(), filename: v.string(), mimeType: v.optional(v.string()) }),
  v.object({ filename: v.string(), skipped }),
);

type Outcome = { filename: string; outcome: "created" | "refused"; reason: string | null };

const created = (filename: string): Outcome => ({ filename, outcome: "created", reason: null });
const refusedOutcome = (filename: string, reason: string): Outcome => ({
  filename,
  outcome: "refused",
  reason,
});

/** A part that passed the checks, with where its outcome sits in Recent emails. */
type CheckedPart = MailPart & { outcomeAt: number };

/** A PDF or an image of the email, checked like an upload; a refused one is removed from storage. */
async function checkPart(
  ctx: ActionCtx,
  key: string,
  mimeType: string,
): Promise<{ kind: "pdf" | "image"; mimeType: string; pageCount: number; size: number }> {
  if (mimeType === PDF_MIME_TYPE) {
    const bytes = await pdfStore.read(key);
    const size = bytes?.length ?? 0;
    const pageCount = await checkPdf(ctx, key);
    return { kind: "pdf", mimeType, pageCount, size };
  }
  try {
    if (!(IMAGE_MIME_TYPES as readonly string[]).includes(mimeType)) throw new ConvexError(UNSUPPORTED_TYPE);
    const bytes = await pdfStore.read(key);
    if (bytes === null) throw new ConvexError("The upload didn't arrive. Try again.");
    if (bytes.length > MAX_IMAGE_BYTES) throw new ConvexError(IMAGE_TOO_LARGE);
    return { kind: "image", mimeType, pageCount: 1, size: bytes.length };
  } catch (error) {
    await pdfStore.remove(ctx, key);
    throw error;
  }
}

/** One planned Document, ready for the mutation. */
const planned = v.object({
  kind: v.union(v.literal("pdf"), v.literal("email"), v.literal("image")),
  mimeType: v.string(),
  key: v.string(),
  filename: v.string(),
  pageCount: v.number(),
  attachmentKeys: v.array(v.string()),
  items: v.number(),
});

/**
 * Creates the Documents of one email and charges their Items once, in one
 * transaction: all of them, or (out of Items) none.
 */
export const accept = internalMutation({
  args: {
    organisationId: v.id("organisations"),
    formId: v.optional(v.id("forms")),
    documents: v.array(planned),
    /** What an out-of-Items refusal calls the input. */
    what: v.string(),
    splitReason: v.optional(v.string()),
    uploaderEmail: v.string(),
  },
  handler: async (ctx, { documents, what, ...rest }) => {
    await chargeItems(
      ctx,
      rest.organisationId,
      documents.reduce((sum, d) => sum + d.items, 0),
      what,
    );
    for (const document of documents) {
      await createDocument(ctx, {
        organisationId: rest.organisationId,
        formId: rest.formId,
        splitReason: rest.splitReason,
        uploadedBy: "email",
        uploaderEmail: rest.uploaderEmail,
        kind: document.kind,
        mimeType: document.mimeType,
        key: document.key,
        filename: document.filename,
        pageCount: document.pageCount,
        attachmentKeys: document.attachmentKeys,
      });
    }
  },
});

const receiveArgs = {
  token: v.string(),
  from: v.string(),
  receivedAt: v.number(),
  subject: v.optional(v.string()),
  date: v.optional(v.string()),
  body: v.optional(v.string()),
  // The Worker did not send a text that is over the limit.
  bodyTooLarge: v.optional(v.boolean()),
  attachments: v.array(attachment),
};

/**
 * One email from the Worker. Its text and each PDF or image attachment pass the
 * same checks as an upload (readable, at most 20 pages, fits the Items). Jev
 * decides whether the parts are one Document or several (lib/mailPlan.ts), and
 * the Items of the whole email are charged once; an email Vink cannot afford is
 * refused whole. A refused part creates nothing and is removed from R2. An
 * email with nothing to process creates no Document and costs nothing, and a
 * text Jev calls a cover note ("see attachment") is no Document and costs
 * nothing either.
 *
 * Which attachments reach this action is the Worker's call: it drops small
 * inline images (signature logos, social icons) before it sends the list
 * (workers/intake-email/src/map.ts). This action does not filter them again.
 */
export const receive = internalAction({
  args: receiveArgs,
  handler: async (ctx, { token, from, receivedAt, subject = "", date = "", body = "", ...rest }) => {
    const target = await ctx.runQuery(internal.intake.resolve, { token });
    if (target === null) {
      for (const a of rest.attachments) if ("key" in a) await pdfStore.remove(ctx, a.key);
      return { found: false as const };
    }

    // Recent emails: the text first, then each attachment. A placeholder stands for
    // every part until the email is accepted or refused whole.
    const outcomes: Outcome[] = [];
    let text = body.trim();
    let textAt = -1;
    if (rest.bodyTooLarge || new TextEncoder().encode(text).length > MAX_EMAIL_BODY_BYTES) {
      outcomes.push(refusedOutcome(emailFilename(subject, from), EMAIL_BODY_TOO_LARGE));
      text = "";
    } else if (text !== "") {
      textAt = outcomes.push(created(emailFilename(subject, from))) - 1;
    }
    const parts: CheckedPart[] = [];
    let bytesLeft = MAX_EMAIL_ATTACHMENT_BYTES;
    for (const a of rest.attachments) {
      if ("skipped" in a) {
        outcomes.push(refusedOutcome(a.filename, skipReasons[a.skipped]));
        continue;
      }
      const refuse = async (reason: string) => {
        outcomes.push(refusedOutcome(a.filename, reason));
        await pdfStore.remove(ctx, a.key);
      };
      if (parts.length >= MAX_EMAIL_ATTACHMENTS) {
        await refuse(TOO_MANY_ATTACHMENTS);
        continue;
      }
      let checked;
      try {
        checked = await checkPart(ctx, a.key, (a.mimeType ?? PDF_MIME_TYPE).toLowerCase());
      } catch (error) {
        outcomes.push(refusedOutcome(a.filename, reasonOf(error).reason));
        continue;
      }
      if (checked.size > bytesLeft) {
        await refuse(ATTACHMENTS_TOO_LARGE);
        continue;
      }
      bytesLeft -= checked.size;
      parts.push({
        filename: a.filename,
        mimeType: checked.mimeType,
        key: a.key,
        kind: checked.kind,
        pageCount: checked.pageCount,
        outcomeAt: outcomes.push(created(a.filename)) - 1,
      });
    }

    // Before anything is written: Jev's call. If it fails, the sender's server retries.
    const decision = needsSplitCall(text, parts)
      ? await ctx.runAction(internal.intakeSplit.decide, {
          subject,
          from,
          body: text,
          attachments: parts.map((p) => ({
            filename: p.filename,
            kind: p.kind,
            pageCount: p.kind === "pdf" ? p.pageCount : null,
          })),
        })
      : null;
    const plan = planMail(text, parts, decision);
    // A cover note is no Document, so it has no row in Recent emails either.
    if (plan.coverNote && textAt >= 0) {
      outcomes.splice(textAt, 1);
      for (const part of parts) part.outcomeAt -= 1;
      textAt = -1;
    }

    const emailKeys: string[] = [];
    const documents: Array<typeof planned.type> = [];
    let outOfItems = false;
    let accepted = false;
    try {
      for (const d of plan.documents) {
        const items = itemsOfPlanned(d, text);
        if (d.kind !== "email") {
          documents.push({
            kind: d.kind,
            mimeType: d.part.mimeType,
            key: d.part.key,
            filename: d.part.filename,
            pageCount: d.part.pageCount,
            attachmentKeys: [],
            items,
          });
          continue;
        }
        // The server writes the email's file, under the Organisation's prefix, and moves
        // its attachments beside it, where only this email's file points (lib/storedEmail.ts).
        const stored = await storeEmail(
          ctx,
          target.organisationId,
          { subject, from, date, body: text },
          await Promise.all(
            d.parts.map(async (part) => ({
              filename: part.filename,
              mimeType: part.mimeType,
              pageCount: part.pageCount,
              bytes: (await pdfStore.read(part.key))!,
            })),
          ),
        );
        emailKeys.push(stored.key, ...stored.attachmentKeys);
        documents.push({
          kind: "email",
          mimeType: "application/json",
          key: stored.key,
          filename: emailFilename(subject, from),
          // The email's own page: the body (see Verify in lib/reader.ts).
          pageCount: 1,
          attachmentKeys: stored.attachmentKeys,
          items,
        });
      }
      // However it is split, the Documents add up to the whole email (a cover note is no Document and costs nothing).
      const whole = itemsOfMail(text, parts, plan);
      if (documents.reduce((sum, d) => sum + d.items, 0) !== whole) {
        throw new Error("The Items of the split do not add up to the email's");
      }
      if (documents.length > 0) {
        const lone = documents.length === 1 ? documents[0] : null;
        await ctx.runMutation(internal.intake.accept, {
          organisationId: target.organisationId,
          formId: target.formId,
          documents,
          what: lone?.kind === "pdf" ? "PDF" : lone?.kind === "image" ? "image" : "email",
          ...(plan.unsure === null ? {} : { splitReason: plan.unsure }),
          uploaderEmail: `email from ${from}`,
        });
      }
      accepted = true;
    } catch (error) {
      // Refused whole: nothing stays in storage.
      for (const key of emailKeys) await pdfStore.remove(ctx, key);
      for (const part of parts) await pdfStore.remove(ctx, part.key);
      const refused = reasonOf(error);
      outOfItems = refused.outOfItems;
      if (textAt >= 0) outcomes[textAt] = refusedOutcome(outcomes[textAt].filename, refused.reason);
      for (const part of parts) outcomes[part.outcomeAt] = refusedOutcome(part.filename, refused.reason);
    }
    if (accepted) {
      // The attachments of an email Document were copied under its own key.
      for (const part of plan.documents.flatMap((d) => (d.kind === "email" ? d.parts : []))) {
        await pdfStore.remove(ctx, part.key);
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
  const mail = body as ObjectType<typeof receiveArgs>;
  let result;
  try {
    result = await ctx.runAction(internal.intake.receive, {
      ...mail,
      token: String(mail.token).toLowerCase(),
    });
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  if (!result.found) return new Response("Unknown address", { status: 404 });
  return Response.json({ attachments: result.attachments });
});
