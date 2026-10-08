// Form Proposals: an Admin uploads one sample PDF, Vink reads it and
// proposes Fields, and the Admin saves the ones they keep as a Form Version.
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { checkUpload, claimUpload, createDocument } from "./documents";
import { extractionPool } from "./extraction";
import { insertForm, saveVersion } from "./forms";
import { orgAction, orgMutation, orgQuery } from "./lib/functions";
import { pdfStore } from "./lib/pdfStore";
import { chargeItems } from "./items";
import { itemCountOf, kindOf, mimeTypeOf, PDF_MIME_TYPE } from "./lib/inputLimits";
import type { FlatField, ListField } from "./lib/pipeline";
import { field } from "./schema";

async function ownProposal(
  ctx: QueryCtx,
  organisationId: Id<"organisations">,
  proposalId: Id<"formProposals">,
) {
  const proposal = await ctx.db.get(proposalId);
  if (proposal === null || proposal.organisationId !== organisationId) {
    throw new ConvexError("Form Proposal not found");
  }
  return proposal;
}

export async function startProposal(ctx: MutationCtx, proposalId: Id<"formProposals">) {
  await extractionPool.enqueueAction(
    ctx,
    internal.proposalRun.run,
    { proposalId },
    { onComplete: internal.formProposals.completed, context: { proposalId } },
  );
}

const completedContext = v.object({ proposalId: v.id("formProposals") });

/** After the last attempt: a run that failed every time shows its error, with Retry. */
export const completed = extractionPool.defineOnComplete<DataModel, typeof completedContext>({
  context: completedContext,
  handler: async (ctx, { context: { proposalId }, result }) => {
    if (result.kind === "success") return;
    const proposal = await ctx.db.get(proposalId);
    if (proposal === null || (proposal.state !== "reading" && proposal.state !== "proposing")) return;
    await ctx.db.patch(proposalId, {
      state: "failed",
      error: result.kind === "failed" ? result.error.slice(0, 300) : "canceled",
    });
  },
});

/** A sample that cannot be read and never will be (lib/readerInput.ts UnreadableInput): failed at once. */
export const failUnreadable = internalMutation({
  args: { proposalId: v.id("formProposals"), error: v.string() },
  handler: async (ctx, { proposalId, error }) => {
    const proposal = await ctx.db.get(proposalId);
    if (proposal === null || (proposal.state !== "reading" && proposal.state !== "proposing")) return;
    await ctx.db.patch(proposalId, { state: "failed", error: error.slice(0, 300) });
  },
});

/** Step 2 of a sample upload (step 1 is `documents.generateUploadUrl`). */
export const create = orgAction({
  role: "admin",
  args: { key: v.string(), filename: v.string(), formId: v.optional(v.id("forms")) },
  handler: async (ctx, { key, filename, formId }): Promise<{ proposalId: Id<"formProposals"> }> => {
    const pageCount = await checkUpload(ctx, ctx.organisationId, key);
    const identity = (await ctx.auth.getUserIdentity())!;
    try {
      return await ctx.runMutation(internal.formProposals.insert, {
        organisationId: ctx.organisationId,
        createdBy: ctx.userId,
        createdByEmail: identity.email?.toLowerCase() ?? "",
        key,
        filename,
        pageCount,
        formId,
      });
    } catch (error) {
      await pdfStore.remove(ctx, key);
      throw error;
    }
  },
});

export const insert = internalMutation({
  args: {
    organisationId: v.id("organisations"),
    createdBy: v.string(),
    createdByEmail: v.string(),
    key: v.string(),
    filename: v.string(),
    pageCount: v.number(),
    formId: v.optional(v.id("forms")),
  },
  handler: async (ctx, args) => {
    if (args.formId) {
      const form = await ctx.db.get(args.formId);
      if (form === null || form.organisationId !== args.organisationId) {
        throw new ConvexError("Form not found");
      }
    }
    // The sample is read like a Document, so its Items count now; saving it
    // as the Form's first Document later costs nothing more.
    await chargeItems(ctx, args.organisationId, itemCountOf({ kind: "pdf", pageCount: args.pageCount }));
    const proposalId = await ctx.db.insert("formProposals", {
      ...args,
      kind: "pdf",
      mimeType: PDF_MIME_TYPE,
      state: "reading",
    });
    await claimUpload(ctx, args.key);
    await startProposal(ctx, proposalId);
    return { proposalId };
  },
});

export const get = orgQuery({
  role: "admin",
  args: { proposalId: v.id("formProposals") },
  handler: async (ctx, { proposalId }) => {
    const proposal = await ownProposal(ctx, ctx.organisationId, proposalId);
    return {
      id: proposal._id,
      filename: proposal.filename,
      pageCount: proposal.pageCount,
      formId: proposal.formId ?? null,
      state: proposal.state,
      error: proposal.error ?? null,
      fields: proposal.fields ?? [],
      createdAt: proposal._creationTime,
    };
  },
});

export const retry = orgMutation({
  role: "admin",
  args: { proposalId: v.id("formProposals") },
  handler: async (ctx, { proposalId }) => {
    const proposal = await ownProposal(ctx, ctx.organisationId, proposalId);
    if (proposal.state !== "failed") throw new ConvexError("Only a failed proposal can be retried");
    await ctx.db.patch(proposalId, {
      state: proposal.readingJson ? "proposing" : "reading",
      error: undefined,
    });
    await startProposal(ctx, proposalId);
  },
});

/** Deletes a Form Proposal and its sample's PDF and Reading. */
export async function deleteProposal(ctx: MutationCtx, proposal: Doc<"formProposals">) {
  await pdfStore.remove(ctx, proposal.key);
  await ctx.db.delete(proposal._id);
}

export const discard = orgMutation({
  role: "admin",
  args: { proposalId: v.id("formProposals") },
  handler: async (ctx, { proposalId }) => {
    await deleteProposal(ctx, await ownProposal(ctx, ctx.organisationId, proposalId));
  },
});

/**
 * Saves the Fields the Admin kept (and edited) as a new Form's first Version.
 * With `processSample`, the sample becomes its first Document from the stored
 * Reading; without, the sample's PDF and Reading are deleted now.
 */
export const save = orgMutation({
  role: "admin",
  args: {
    proposalId: v.id("formProposals"),
    name: v.string(),
    description: v.optional(v.string()),
    fields: v.array(field),
    processSample: v.boolean(),
  },
  handler: async (ctx, { proposalId, name, description, fields, processSample }) => {
    const proposal = await ownProposal(ctx, ctx.organisationId, proposalId);
    if (proposal.state !== "ready" || proposal.formId) {
      throw new ConvexError("This proposal can't be saved as a new Form");
    }
    const { formId } = await insertForm(ctx, {
      organisationId: ctx.organisationId,
      name,
      description,
      fields,
      savedBy: ctx.userId,
    });
    if (!processSample) {
      await deleteProposal(ctx, proposal);
      return { formId, documentId: null };
    }
    const documentId = await createDocument(ctx, {
      organisationId: ctx.organisationId,
      formId,
      key: proposal.key,
      kind: kindOf(proposal),
      mimeType: mimeTypeOf(proposal),
      filename: proposal.filename,
      pageCount: proposal.pageCount,
      uploadedBy: proposal.createdBy,
      uploaderEmail: proposal.createdByEmail,
      reading: { json: proposal.readingJson!, textLayer: proposal.textLayer ?? [] },
    });
    // The PDF now belongs to the Document.
    await ctx.db.delete(proposalId);
    return { formId, documentId };
  },
});

/**
 * "Suggest Fields from PDF": saves the Form, now with the kept suggestions,
 * as its next Form Version. Documents already in progress keep theirs.
 */
export const saveToForm = orgMutation({
  role: "admin",
  args: {
    proposalId: v.id("formProposals"),
    name: v.string(),
    description: v.optional(v.string()),
    fields: v.array(field),
  },
  handler: async (ctx, { proposalId, name, description, fields }) => {
    const proposal = await ownProposal(ctx, ctx.organisationId, proposalId);
    if (proposal.state !== "ready" || !proposal.formId) {
      throw new ConvexError("This proposal doesn't extend a Form");
    }
    const { version } = await saveVersion(ctx, ctx.organisationId, ctx.userId, proposal.formId, {
      name,
      description,
      fields,
    });
    await deleteProposal(ctx, proposal);
    return { formId: proposal.formId, version };
  },
});

// For the run in proposalRun.ts.

export const runInput = internalQuery({
  args: { proposalId: v.id("formProposals") },
  handler: async (ctx, { proposalId }) => {
    const proposal = await ctx.db.get(proposalId);
    if (proposal === null) return null;
    // "Suggest Fields from PDF": what the Form already has, to match against.
    const form = proposal.formId ? await ctx.db.get(proposal.formId) : null;
    const formVersion = form
      ? await ctx.db
          .query("formVersions")
          .withIndex("by_formId_and_number", (q) => q.eq("formId", form._id).eq("number", form.version))
          .unique()
      : null;
    const current = formVersion?.fields ?? [];
    return {
      organisationId: proposal.organisationId,
      key: proposal.key,
      kind: kindOf(proposal),
      mimeType: mimeTypeOf(proposal),
      pageCount: proposal.pageCount,
      readingJson: proposal.readingJson ?? null,
      textLayer: proposal.textLayer ?? [],
      extends: form !== null,
      fields: current.filter((f): f is FlatField => f.type !== "list"),
      lists: current.filter((f): f is ListField => f.type === "list"),
    };
  },
});

export const saveReading = internalMutation({
  args: {
    proposalId: v.id("formProposals"),
    json: v.string(),
    textLayer: v.array(v.object({ page: v.number(), text: v.string() })),
  },
  handler: async (ctx, { proposalId, json, textLayer }) => {
    await ctx.db.patch(proposalId, { readingJson: json, textLayer, state: "proposing" });
  },
});

export const saveFields = internalMutation({
  args: { proposalId: v.id("formProposals"), fields: v.array(v.object({ field, ticked: v.boolean() })) },
  handler: async (ctx, { proposalId, fields }) => {
    const proposal = await ctx.db.get(proposalId);
    if (proposal === null) return;
    // A key the Form (or an earlier suggestion) already uses gets a number,
    // so a new Field never takes the place of one the Form has.
    const taken = new Set<string>();
    if (proposal.formId) {
      const form = (await ctx.db.get(proposal.formId))!;
      const version = await ctx.db
        .query("formVersions")
        .withIndex("by_formId_and_number", (q) => q.eq("formId", form._id).eq("number", form.version))
        .unique();
      for (const f of version?.fields ?? []) taken.add(f.key);
    }
    const unique = (key: string) => {
      let candidate = key;
      for (let n = 2; taken.has(candidate); n++) candidate = `${key}_${n}`;
      taken.add(candidate);
      return candidate;
    };
    // No proposed Field is required: that is the Admin's call, since it blocks Auto-Send.
    const optional = fields.map(({ field, ticked }) => ({
      ticked,
      field:
        field.type === "list"
          ? {
              ...field,
              key: unique(field.key),
              required: false,
              fields: field.fields.map((s) => ({ ...s, required: false })),
            }
          : { ...field, key: unique(field.key), required: false },
    }));
    await ctx.db.patch(proposalId, { fields: optional, state: "ready" });
  },
});

/** Open Form Proposals, newest first, to come back to. */
export const list = orgQuery({
  role: "admin",
  args: {},
  handler: async (ctx) => {
    const proposals = await ctx.db
      .query("formProposals")
      .withIndex("by_organisationId", (q) => q.eq("organisationId", ctx.organisationId))
      .order("desc")
      .take(50);
    return proposals.map((p) => ({
      id: p._id,
      filename: p.filename,
      state: p.state,
      formId: p.formId ?? null,
      createdAt: p._creationTime,
    }));
  },
});
