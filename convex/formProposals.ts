// Form Proposals: an Admin gives one sample (a PDF, a photo or an email) or
// describes the document in words, Vink proposes Fields, and the Admin saves
// the ones they keep as a Form Version.
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import {
  type ActionCtx,
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { checkEmail, checkFile, checkIssued, claimUpload, createDocument } from "./documents";
import { extractionPool } from "./extraction";
import { insertForm, saveVersion } from "./forms";
import { removeDocumentFiles } from "./lib/documentFiles";
import {
  DESCRIPTION_EMPTY,
  DESCRIPTION_TOO_LONG,
  descriptionTitle,
  MAX_DESCRIPTION_CHARS,
} from "./lib/formDescription";
import { orgAction, orgMutation, orgQuery } from "./lib/functions";
import { pdfStore } from "./lib/pdfStore";
import { chargeItems } from "./items";
import { kindOf, mimeTypeOf } from "./lib/inputLimits";
import { EMAIL_MIME_TYPE, emailFilename, storeEmail } from "./lib/storedEmail";
import type { FlatField, ListField } from "./lib/pipeline";
import { field, inputKind } from "./schema";

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

type Sample = {
  organisationId: Id<"organisations">;
  createdBy: string;
  createdByEmail: string;
  formId?: Id<"forms">;
};

/** Step 2 of a sample upload (step 1 is `documents.generateUploadUrl`): a PDF, a JPG/PNG/HEIC photo or an .eml email. */
export const create = orgAction({
  role: "admin",
  args: { key: v.string(), filename: v.string(), formId: v.optional(v.id("forms")) },
  handler: async (ctx, { key, filename, formId }): Promise<{ proposalId: Id<"formProposals"> }> => {
    checkIssued(ctx.organisationId, key);
    const identity = (await ctx.auth.getUserIdentity())!;
    const sample: Sample = {
      organisationId: ctx.organisationId,
      createdBy: ctx.userId,
      createdByEmail: identity.email?.toLowerCase() ?? "",
      formId,
    };
    const bytes = await pdfStore.read(key);
    if (bytes === null) throw new ConvexError("The upload didn't arrive. Try again.");
    try {
      // The same checks and byte sniffing as a Document's upload (documents.ts checkFile).
      const checked = await checkFile(bytes, filename);
      if (checked.kind === "email") {
        const { subject, from, date, body, attachments } = checked.email;
        const proposal = await proposeFromEmail(ctx, sample, { subject, from, date, body, attachments }, key);
        await pdfStore.remove(ctx, key);
        return proposal;
      }
      return await ctx.runMutation(internal.formProposals.insert, {
        ...sample,
        key,
        filename,
        pageCount: checked.pageCount,
        kind: checked.kind,
        mimeType: checked.mimeType,
        items: checked.items,
      });
    } catch (error) {
      await pdfStore.remove(ctx, key);
      throw error;
    }
  },
});

/** A pasted email as the sample: its text becomes the email the Reader reads. */
export const createFromEmail = orgAction({
  role: "admin",
  args: { subject: v.optional(v.string()), body: v.string(), formId: v.optional(v.id("forms")) },
  handler: async (ctx, { subject = "", body, formId }): Promise<{ proposalId: Id<"formProposals"> }> => {
    const identity = (await ctx.auth.getUserIdentity())!;
    return await proposeFromEmail(
      ctx,
      {
        organisationId: ctx.organisationId,
        createdBy: ctx.userId,
        createdByEmail: identity.email?.toLowerCase() ?? "",
        formId,
      },
      // The sender is not known from pasted text.
      { subject: subject.trim(), from: "", date: "", body, attachments: [] },
    );
  },
});

/**
 * An email sample: checked and stored like an email Document (documents.ts
 * checkEmail, lib/storedEmail.ts), charged as itemCountOf says. A refused
 * email leaves nothing behind.
 */
async function proposeFromEmail(
  ctx: ActionCtx,
  sample: Sample,
  email: {
    subject: string;
    from: string;
    date: string;
    body: string;
    attachments: Array<{ filename: string; bytes: Uint8Array }>;
  },
  uploadKey?: string,
): Promise<{ proposalId: Id<"formProposals"> }> {
  const { body, parts, items } = await checkEmail(email);
  const stored = await storeEmail(ctx, sample.organisationId, { ...email, body }, parts);
  try {
    return await ctx.runMutation(internal.formProposals.insert, {
      ...sample,
      key: stored.key,
      attachmentKeys: stored.attachmentKeys,
      filename: emailFilename(email.subject, email.from),
      // The email's own page: the body (see Verify in lib/reader.ts).
      pageCount: 1,
      kind: "email",
      mimeType: EMAIL_MIME_TYPE,
      items,
      ...(uploadKey === undefined ? {} : { uploadKey }),
    });
  } catch (error) {
    for (const key of [stored.key, ...stored.attachmentKeys]) await pdfStore.remove(ctx, key);
    throw error;
  }
}

export const insert = internalMutation({
  args: {
    organisationId: v.id("organisations"),
    createdBy: v.string(),
    createdByEmail: v.string(),
    key: v.string(),
    attachmentKeys: v.optional(v.array(v.string())),
    filename: v.string(),
    pageCount: v.number(),
    kind: inputKind,
    mimeType: v.string(),
    /** What the sample costs: its Items (itemCountOf). */
    items: v.number(),
    /** The upload an email sample came from, which is no longer an orphan once the proposal exists. */
    uploadKey: v.optional(v.string()),
    formId: v.optional(v.id("forms")),
  },
  handler: async (ctx, { items, uploadKey, ...args }) => {
    if (args.formId) {
      const form = await ctx.db.get(args.formId);
      if (form === null || form.organisationId !== args.organisationId) {
        throw new ConvexError("Form not found");
      }
    }
    // The sample is read like a Document, so its Items count now; saving it
    // as the Form's first Document later costs nothing more.
    await chargeItems(ctx, args.organisationId, items);
    const proposalId = await ctx.db.insert("formProposals", { ...args, state: "reading" });
    await claimUpload(ctx, uploadKey ?? args.key);
    await startProposal(ctx, proposalId);
    return { proposalId };
  },
});

/**
 * "Describe in words": the Admin writes what the document is and which data
 * they need, and the Proposer proposes Fields from that text alone. There is no
 * sample and no Reading, so nothing is read and NO ITEMS ARE CHARGED: the Items
 * pay for reading input, and a description is not input. (A new Form only; to
 * add Fields to an existing Form, give a sample.) Like every proposal it is
 * deleted after 7 days when unsaved (retention.ts).
 */
export const createFromDescription = orgMutation({
  role: "admin",
  args: { description: v.string() },
  handler: async (ctx, { description }): Promise<{ proposalId: Id<"formProposals"> }> => {
    const text = description.trim();
    if (text === "") throw new ConvexError(DESCRIPTION_EMPTY);
    if (text.length > MAX_DESCRIPTION_CHARS) throw new ConvexError(DESCRIPTION_TOO_LONG);
    const identity = (await ctx.auth.getUserIdentity())!;
    const proposalId = await ctx.db.insert("formProposals", {
      organisationId: ctx.organisationId,
      createdBy: ctx.userId,
      createdByEmail: identity.email?.toLowerCase() ?? "",
      description: text,
      filename: descriptionTitle(text),
      pageCount: 0,
      // Straight to proposing: there is nothing to read.
      state: "proposing",
    });
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
      kind: kindOf(proposal),
      // A description has no sample: the screen then shows no reading step and no "process sample" choice.
      hasSample: proposal.key !== undefined,
      description: proposal.description ?? null,
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
      // A description is never read: a retry proposes again.
      state: proposal.readingJson || proposal.key === undefined ? "proposing" : "reading",
      error: undefined,
    });
    await startProposal(ctx, proposalId);
  },
});

/** Deletes a Form Proposal and its sample's file (an email's attachments too) and Reading. */
export async function deleteProposal(ctx: MutationCtx, proposal: Doc<"formProposals">) {
  if (proposal.key !== undefined) {
    await removeDocumentFiles(ctx, { key: proposal.key, attachmentKeys: proposal.attachmentKeys });
  }
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
    if (processSample && proposal.key === undefined) {
      throw new ConvexError("This proposal has no sample to process");
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
      key: proposal.key!,
      attachmentKeys: proposal.attachmentKeys,
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
      key: proposal.key ?? null,
      description: proposal.description ?? null,
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
