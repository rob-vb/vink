// Integrations: where an Organisation's Payloads go. Admin only. Header
// secrets and the signing secret are stored encrypted (lib/secrets.ts).
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalQuery, type QueryCtx } from "./_generated/server";
import { failOpenDeliveries } from "./deliveries";
import { documentPayload } from "./lib/documentPayload";
import { orgAction, orgMutation, orgQuery } from "./lib/functions";
import { http, HttpFailure } from "./lib/http";
import { dummyPayload, envelopeOf } from "./lib/payload";
import { decryptSecret, encryptSecret, masked } from "./lib/secrets";
import { newSigningSecret, SIGNATURE_HEADER, signatureOf } from "./lib/signing";

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
      throw new ConvexError(`DocuHelper sets the ${name} header itself`);
    }
  }
}

async function sealed(header: { name: string; value: string; secret: boolean }) {
  return { ...header, value: header.secret ? await encryptSecret(header.value) : header.value };
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
        return {
          id: integration._id,
          name: integration.name,
          url: integration.url,
          headers: await Promise.all(
            integration.headers.map(async (h) => ({
              name: h.name,
              secret: h.secret,
              value: h.secret ? masked(await decryptSecret(h.value)) : h.value,
            })),
          ),
          forms: forms.flatMap((f) => (f ? [{ id: f._id, name: f.name }] : [])),
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
    const integration = await ownIntegration(ctx, ctx.organisationId, integrationId);
    return { secret: await decryptSecret(integration.signingSecret) };
  },
});

const headerInput = v.object({ name: v.string(), value: v.string(), secret: v.boolean() });

export const create = orgMutation({
  role: "admin",
  args: { name: v.string(), url: v.string(), headers: v.array(headerInput) },
  handler: async (ctx, { name, url, headers }) => {
    checkEndpoint(name, url);
    checkHeaders(headers);
    const integrationId = await ctx.db.insert("integrations", {
      organisationId: ctx.organisationId,
      name: name.trim(),
      url,
      headers: await Promise.all(headers.map(sealed)),
      signingSecret: await encryptSecret(newSigningSecret()),
    });
    return { integrationId };
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
    const integration = await ownIntegration(ctx, ctx.organisationId, integrationId);
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

export const remove = orgMutation({
  role: "admin",
  args: { integrationId: v.id("integrations") },
  handler: async (ctx, { integrationId }) => {
    await ownIntegration(ctx, ctx.organisationId, integrationId);
    const links = await ctx.db
      .query("formIntegrations")
      .withIndex("by_integrationId", (q) => q.eq("integrationId", integrationId))
      .take(200);
    for (const link of links) await ctx.db.delete(link._id);
    await failOpenDeliveries(ctx, integrationId);
    await ctx.db.delete(integrationId);
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

/** Where and how to send: the endpoint, its headers and signing secret in plain text. */
export async function endpointOf(integration: Doc<"integrations">) {
  return {
    url: integration.url,
    headers: Object.fromEntries(
      await Promise.all(
        integration.headers.map(async (h) => [h.name, h.secret ? await decryptSecret(h.value) : h.value]),
      ),
    ) as Record<string, string>,
    signingSecret: await decryptSecret(integration.signingSecret),
  };
}

/** Posts a signed envelope; the answer, or why there was none. */
export async function sendSigned(
  endpoint: Awaited<ReturnType<typeof endpointOf>>,
  envelope: object,
) {
  const body = JSON.stringify(envelope);
  const headers = {
    ...endpoint.headers,
    "Content-Type": "application/json",
    [SIGNATURE_HEADER]: await signatureOf(endpoint.signingSecret, body),
  };
  try {
    return { answer: await http.post(endpoint.url, headers, body), failure: null };
  } catch (error) {
    if (error instanceof HttpFailure) return { answer: null, failure: error };
    throw error;
  }
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
    if (documentId) {
      const document = await ctx.db.get(documentId);
      if (document === null || document.formId !== formId || document.dataDeletedAt !== undefined) {
        throw new ConvexError("Choose a processed Document of this Form");
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
    } else {
      const formVersion = (await ctx.db
        .query("formVersions")
        .withIndex("by_formId_and_number", (q) => q.eq("formId", formId).eq("number", form.version))
        .unique())!;
      envelope = envelopeOf({
        deliveryId: `test_${crypto.randomUUID()}`,
        test: true,
        document: { id: "test", filename: "example.pdf", uploadedAt: now },
        form: { id: formId, version: form.version },
        approval: { mode: "manual", by: null, at: now },
        data: dummyPayload(formVersion.fields, mode),
      });
    }
    return { endpoint: await endpointOf(integration), envelope };
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
    const { endpoint, envelope } = await ctx.runQuery(internal.integrations.testSendInput, {
      organisationId: ctx.organisationId,
      ...args,
    });
    const { answer, failure } = await sendSigned(endpoint, envelope);
    if (answer === null) return { ok: false, status: null, body: null, error: failure!.message };
    return {
      ok: answer.status >= 200 && answer.status < 300,
      status: answer.status,
      body: answer.body,
      error: null,
    };
  },
});

/** Processed Documents of a Form that a test-send can use, newest first. */
export const testDocuments = orgQuery({
  role: "admin",
  args: { formId: v.id("forms") },
  handler: async (ctx, { formId }) => {
    await ownForm(ctx, ctx.organisationId, formId);
    const documents = [];
    for (const state of ["needs_review", "approved"] as const) {
      documents.push(
        ...(await ctx.db
          .query("documents")
          .withIndex("by_organisationId_and_state", (q) =>
            q.eq("organisationId", ctx.organisationId).eq("state", state),
          )
          .order("desc")
          .take(100)),
      );
    }
    return documents
      .filter((d) => d.formId === formId)
      .sort((a, b) => b._creationTime - a._creationTime)
      .slice(0, 20)
      .map((d) => ({ id: d._id, filename: d.filename, state: d.state }));
  },
});
