// Integrations: where an Organisation's Payloads go. Admin only. Header
// secrets and the signing secret are stored encrypted (lib/secrets.ts).
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { failOpenDeliveries } from "./deliveries";
import { documentPayload } from "./lib/documentPayload";
import { orgAction, orgMutation, orgQuery } from "./lib/functions";
import { kindOf, sendTo } from "./lib/integrationAdapters";
import { dummyPayload, envelopeOf } from "./lib/payload";
import { decryptSecret, encryptSecret, masked } from "./lib/secrets";
import { newSigningSecret, SIGNATURE_HEADER } from "./lib/signing";

async function ownIntegration(
  ctx: QueryCtx,
  organisationId: Id<"organisations">,
  integrationId: Id<"integrations">,
) {
  const integration = await ctx.db.get(integrationId);
  if (integration === null || integration.organisationId !== organisationId) {
    throw new ConvexError("Integration not found");
  }
  return integration;
}

async function ownWebhook(
  ctx: QueryCtx,
  organisationId: Id<"organisations">,
  integrationId: Id<"integrations">,
) {
  const integration = await ownIntegration(ctx, organisationId, integrationId);
  if (integration.kind === "google_sheets") throw new ConvexError("This Integration isn't a Webhook");
  return integration;
}

async function ownForm(ctx: QueryCtx, organisationId: Id<"organisations">, formId: Id<"forms">) {
  const form = await ctx.db.get(formId);
  if (form === null || form.organisationId !== organisationId) {
    throw new ConvexError("Form not found");
  }
  return form;
}

function checkEndpoint(name: string, url: string) {
  if (name.trim() === "") throw new ConvexError("An Integration needs a name");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ConvexError("The endpoint must be an https URL");
  }
  if (parsed.protocol !== "https:") throw new ConvexError("The endpoint must be an https URL");
}

function checkHeaders(headers: Array<{ name: string }>) {
  for (const { name } of headers) {
    if (!/^[A-Za-z0-9-]+$/.test(name)) {
      throw new ConvexError(`"${name}" isn't a valid header name`);
    }
    if (name.toLowerCase() === SIGNATURE_HEADER.toLowerCase() || name.toLowerCase() === "content-type") {
      throw new ConvexError(`Vink sets the ${name} header itself`);
    }
  }
}

async function sealed(header: { name: string; value: string; secret: boolean }) {
  return { ...header, value: header.secret ? await encryptSecret(header.value) : header.value };
}

/** The API Key whose Subscription made this Webhook, or null for one an Admin made. */
async function subscriptionOf(ctx: QueryCtx, integrationId: Id<"integrations">) {
  const subscription = await ctx.db
    .query("subscriptions")
    .withIndex("by_integrationId", (q) => q.eq("integrationId", integrationId))
    .unique();
  if (subscription === null) return null;
  const apiKey = await ctx.db.get(subscription.apiKeyId);
  return { apiKeyName: apiKey?.name ?? "" };
}

export const list = orgQuery({
  role: "admin",
  args: {},
  handler: async (ctx) => {
    const integrations = await ctx.db
      .query("integrations")
      .withIndex("by_organisationId", (q) => q.eq("organisationId", ctx.organisationId))
      .take(100);
    return await Promise.all(
      integrations.map(async (integration) => {
        const links = await ctx.db
          .query("formIntegrations")
          .withIndex("by_integrationId", (q) => q.eq("integrationId", integration._id))
          .take(200);
        const forms = await Promise.all(links.map((l) => ctx.db.get(l.formId)));
        const common = {
          id: integration._id,
          name: integration.name,
          forms: forms.flatMap((f) => (f ? [{ id: f._id, name: f.name }] : [])),
          subscription: await subscriptionOf(ctx, integration._id),
        };
        // Where it sends to: a Webhook's endpoint, or the link to a sheet.
        if (integration.kind === "google_sheets") {
          return { ...common, kind: integration.kind, url: integration.spreadsheetUrl, headers: [] };
        }
        return {
          ...common,
          kind: kindOf(integration) as "webhook",
          url: integration.url,
          headers: await Promise.all(
            integration.headers.map(async (h) => ({
              name: h.name,
              secret: h.secret,
              value: h.secret ? masked(await decryptSecret(h.value)) : h.value,
            })),
          ),
        };
      }),
    );
  },
});

/** The signing secret, in full, for setting up the receiver. */
export const signingSecret = orgQuery({
  role: "admin",
  args: { integrationId: v.id("integrations") },
  handler: async (ctx, { integrationId }) => {
    const integration = await ownWebhook(ctx, ctx.organisationId, integrationId);
    return { secret: await decryptSecret(integration.signingSecret) };
  },
});

const headerInput = v.object({ name: v.string(), value: v.string(), secret: v.boolean() });

/** Made by an Admin, or by a Subscription (subscriptions.ts). */
export async function createWebhook(
  ctx: MutationCtx,
  organisationId: Id<"organisations">,
  { name, url, headers }: { name: string; url: string; headers: Array<{ name: string; value: string; secret: boolean }> },
) {
  checkEndpoint(name, url);
  checkHeaders(headers);
  return await ctx.db.insert("integrations", {
    organisationId,
    name: name.trim(),
    kind: "webhook",
    url,
    headers: await Promise.all(headers.map(sealed)),
    signingSecret: await encryptSecret(newSigningSecret()),
  });
}

export const create = orgMutation({
  role: "admin",
  args: { name: v.string(), url: v.string(), headers: v.array(headerInput) },
  handler: async (ctx, { name, url, headers }) => {
    return { integrationId: await createWebhook(ctx, ctx.organisationId, { name, url, headers }) };
  },
});

/** A secret header sent with `value: null` keeps its stored value. */
export const update = orgMutation({
  role: "admin",
  args: {
    integrationId: v.id("integrations"),
    name: v.string(),
    url: v.string(),
    headers: v.array(
      v.object({ name: v.string(), value: v.union(v.string(), v.null()), secret: v.boolean() }),
    ),
  },
  handler: async (ctx, { integrationId, name, url, headers }) => {
    const integration = await ownWebhook(ctx, ctx.organisationId, integrationId);
    checkEndpoint(name, url);
    checkHeaders(headers);
    const stored = await Promise.all(
      headers.map(async (header) => {
        if (header.value !== null) return await sealed({ ...header, value: header.value });
        const kept = integration.headers.find((h) => h.name === header.name && h.secret);
        if (kept === undefined) throw new ConvexError(`The header ${header.name} needs a value`);
        return kept;
      }),
    );
    await ctx.db.patch(integrationId, { name: name.trim(), url, headers: stored });
  },
});

/** Also ends the Subscription that made it, if any. */
export async function removeIntegration(ctx: MutationCtx, integrationId: Id<"integrations">) {
  const links = await ctx.db
    .query("formIntegrations")
    .withIndex("by_integrationId", (q) => q.eq("integrationId", integrationId))
    .take(200);
  for (const link of links) await ctx.db.delete(link._id);
  const subscription = await ctx.db
    .query("subscriptions")
    .withIndex("by_integrationId", (q) => q.eq("integrationId", integrationId))
    .unique();
  if (subscription !== null) await ctx.db.delete(subscription._id);
  await failOpenDeliveries(ctx, integrationId);
  await ctx.db.delete(integrationId);
}

/** Renames an Integration of any kind; the rest of a Webhook is changed with `update`. */
export const rename = orgMutation({
  role: "admin",
  args: { integrationId: v.id("integrations"), name: v.string() },
  handler: async (ctx, { integrationId, name }) => {
    await ownIntegration(ctx, ctx.organisationId, integrationId);
    if (name.trim() === "") throw new ConvexError("An Integration needs a name");
    await ctx.db.patch(integrationId, { name: name.trim() });
  },
});

export const remove = orgMutation({
  role: "admin",
  args: { integrationId: v.id("integrations") },
  handler: async (ctx, { integrationId }) => {
    await ownIntegration(ctx, ctx.organisationId, integrationId);
    await removeIntegration(ctx, integrationId);
  },
});

async function linkOf(ctx: QueryCtx, integrationId: Id<"integrations">, formId: Id<"forms">) {
  const links = await ctx.db
    .query("formIntegrations")
    .withIndex("by_formId", (q) => q.eq("formId", formId))
    .take(100);
  return links.find((l) => l.integrationId === integrationId) ?? null;
}

/** From now on, Approvals of this Form's Documents send to it. Earlier ones aren't sent. */
export const attach = orgMutation({
  role: "admin",
  args: { integrationId: v.id("integrations"), formId: v.id("forms") },
  handler: async (ctx, { integrationId, formId }) => {
    await ownIntegration(ctx, ctx.organisationId, integrationId);
    await ownForm(ctx, ctx.organisationId, formId);
    if ((await linkOf(ctx, integrationId, formId)) !== null) return;
    await ctx.db.insert("formIntegrations", {
      organisationId: ctx.organisationId,
      formId,
      integrationId,
    });
  },
});

export const detach = orgMutation({
  role: "admin",
  args: { integrationId: v.id("integrations"), formId: v.id("forms") },
  handler: async (ctx, { integrationId, formId }) => {
    await ownIntegration(ctx, ctx.organisationId, integrationId);
    const link = await linkOf(ctx, integrationId, formId);
    if (link === null) return;
    await ctx.db.delete(link._id);
    await failOpenDeliveries(ctx, integrationId, formId);
  },
});

/** Whether any Integration is attached to a Form, which locks its keys. */
export async function hasIntegrations(ctx: QueryCtx, formId: Id<"forms">) {
  return (
    (await ctx.db
      .query("formIntegrations")
      .withIndex("by_formId", (q) => q.eq("formId", formId))
      .first()) !== null
  );
}

/**
 * A test envelope with dummy data for the Form's current Form Version: what a
 * test-send without a Document sends, and the public API's sample.
 */
export async function dummyEnvelope(ctx: QueryCtx, form: Doc<"forms">, mode: "examples" | "empty") {
  const now = Date.now();
  const formVersion = (await ctx.db
    .query("formVersions")
    .withIndex("by_formId_and_number", (q) => q.eq("formId", form._id).eq("number", form.version))
    .unique())!;
  return envelopeOf({
    deliveryId: `test_${crypto.randomUUID()}`,
    test: true,
    document: { id: "test", filename: "example.pdf", uploadedAt: now },
    form: { id: form._id, version: form.version },
    approval: { mode: "manual", by: null, at: now },
    data: dummyPayload(formVersion.fields, mode),
  });
}

export const testSendInput = internalQuery({
  args: {
    organisationId: v.id("organisations"),
    integrationId: v.id("integrations"),
    formId: v.id("forms"),
    mode: v.union(v.literal("examples"), v.literal("empty")),
    documentId: v.optional(v.id("documents")),
  },
  handler: async (ctx, { organisationId, integrationId, formId, mode, documentId }) => {
    const integration = await ownIntegration(ctx, organisationId, integrationId);
    const form = await ownForm(ctx, organisationId, formId);
    const now = Date.now();
    let envelope;
    let approverEmail = null;
    if (documentId) {
      const document = await ctx.db.get(documentId);
      if (document === null || document.formId !== formId || document.dataDeletedAt !== undefined) {
        throw new ConvexError("Choose an Approved Document of this Form");
      }
      // Unchecked values never leave Vink, not even in a test.
      if (document.state !== "approved") {
        throw new ConvexError("Only an Approved Document can be test-sent");
      }
      envelope = envelopeOf({
        deliveryId: `test_${crypto.randomUUID()}`,
        test: true,
        document: { id: document._id, filename: document.filename, uploadedAt: document._creationTime },
        form: { id: formId, version: document.formVersion },
        approval: document.approval
          ? { mode: document.approval.mode, by: document.approval.by, at: document.approval.at }
          : { mode: "manual", by: null, at: now },
        data: await documentPayload(ctx, document),
      });
      approverEmail = document.approval?.byEmail ?? null;
    } else {
      envelope = await dummyEnvelope(ctx, form, mode);
    }
    // As JSON, like a Delivery's frozen envelope: the data's keys stay in the Form's order.
    return { integration, envelope: JSON.stringify(envelope), approverEmail };
  },
});

/** Sends a test envelope (`"test": true`) and returns the answer. It is never a Delivery. */
export const testSend = orgAction({
  role: "admin",
  args: {
    integrationId: v.id("integrations"),
    formId: v.id("forms"),
    mode: v.union(v.literal("examples"), v.literal("empty")),
    documentId: v.optional(v.id("documents")),
  },
  handler: async (ctx, args) => {
    const { integration, envelope, approverEmail } = await ctx.runQuery(internal.integrations.testSendInput, {
      organisationId: ctx.organisationId,
      ...args,
    });
    const { outcome, status, body, error } = await sendTo(integration, JSON.parse(envelope), { approverEmail });
    return { ok: outcome.kind === "delivered", status, body, error };
  },
});

/** Approved Documents of a Form, with their data, that a test-send can use; newest first. */
export const testDocuments = orgQuery({
  role: "admin",
  args: { formId: v.id("forms") },
  handler: async (ctx, { formId }) => {
    await ownForm(ctx, ctx.organisationId, formId);
    const approved = await ctx.db
      .query("documents")
      .withIndex("by_organisationId_and_state", (q) =>
        q.eq("organisationId", ctx.organisationId).eq("state", "approved"),
      )
      .order("desc")
      .take(200);
    return approved
      .filter((d) => d.formId === formId && d.dataDeletedAt === undefined)
      .slice(0, 20)
      .map((d) => ({ id: d._id, filename: d.filename, state: d.state }));
  },
});

/**
 * One-off, after Integration kinds ship: stores "webhook" on every Integration
 * made before. Run once per deployment:
 *   npx convex run integrations:backfillKind          (dev)
 *   npx convex run --prod integrations:backfillKind   (prod)
 */
export const backfillKind = internalMutation({
  args: {},
  handler: async (ctx) => {
    let filled = 0;
    for await (const integration of ctx.db.query("integrations")) {
      if (integration.kind !== undefined) continue;
      await ctx.db.patch(integration._id, { kind: "webhook" });
      filled++;
    }
    return { filled };
  },
});
