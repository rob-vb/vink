// An Extraction's steps around the Node action in extractionRun.ts: queueing
// it, and what it reads and writes in the database.
import { Workpool } from "@convex-dev/workpool";
import { ConvexError, v } from "convex/values";
import { components, internal } from "./_generated/api";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { confidenceOf, reviewReasonsOf } from "./lib/confidence";
import { createDeliveries } from "./deliveries";
import { formOf } from "./lib/documentForm";
import { moveTo } from "./lib/documentStates";
import { orgMutation } from "./lib/functions";
import { kindOf, mimeTypeOf } from "./lib/inputLimits";
import { openReviews } from "./review";
import { MAX_ROUTABLE_FORMS } from "./lib/matchPlan";
import type { FlatField, ListField, RoutableForm } from "./lib/pipeline";

// Every model-heavy background run shares it: Extractions and Form Proposals.
export const extractionPool = new Workpool(components.extractionPool, {
  maxParallelism: 5,
  retryActionsByDefault: true,
  // The first run and 3 retries.
  defaultRetryBehavior: { maxAttempts: 4, initialBackoffMs: 10_000, base: 3 },
});

export async function startExtraction(ctx: MutationCtx, documentId: Id<"documents">) {
  await extractionPool.enqueueAction(
    ctx,
    internal.extractionRun.run,
    { documentId },
    { onComplete: internal.extraction.completed, context: { documentId } },
  );
}

/** After the last attempt: a run that failed every time leaves the Document Extraction Failed. */
const completedContext = v.object({ documentId: v.id("documents") });

export const completed = extractionPool.defineOnComplete<DataModel, typeof completedContext>({
  context: completedContext,
  handler: async (ctx, { context: { documentId }, result }) => {
    if (result.kind === "success") return;
    const document = await ctx.db.get(documentId);
    if (document === null || document.state !== "extracting") return;
    await ctx.db.patch(documentId, {
      // Enough to diagnose; a full stack trace means nothing to a user.
      extractionError: result.kind === "failed" ? result.error.slice(0, 300) : "canceled",
    });
    await moveTo(ctx, document, "extraction_failed");
    await ctx.db.insert("documentEvents", {
      organisationId: document.organisationId,
      documentId,
      event: "extraction_failed",
      by: "vink",
      byEmail: "Vink",
      at: Date.now(),
    });
  },
});

/** Starts a failed Extraction again. It resumes at Match when a Reading is stored. */
export const retry = orgMutation({
  args: { documentId: v.id("documents") },
  handler: async (ctx, { documentId }) => {
    const document = await ctx.db.get(documentId);
    if (document === null || document.organisationId !== ctx.organisationId) {
      throw new ConvexError("Document not found");
    }
    if (document.state !== "extraction_failed") {
      throw new ConvexError("Only a failed Extraction can be retried");
    }
    const identity = await ctx.auth.getUserIdentity();
    await ctx.db.patch(documentId, { extractionError: undefined });
    await moveTo(ctx, document, "extracting");
    await ctx.db.insert("documentEvents", {
      organisationId: ctx.organisationId,
      documentId,
      event: "extraction_retried",
      by: ctx.userId,
      byEmail: identity?.email?.toLowerCase() ?? "",
      at: Date.now(),
    });
    await startExtraction(ctx, documentId);
  },
});

/** A Form's name, description and Fields at one Form Version. */
async function formFields(ctx: QueryCtx, formId: Id<"forms">, number: number) {
  const form = (await ctx.db.get(formId))!;
  const formVersion = (await ctx.db
    .query("formVersions")
    .withIndex("by_formId_and_number", (q) => q.eq("formId", formId).eq("number", number))
    .unique())!;
  return {
    formName: form.name,
    formDescription: form.description ?? null,
    fields: formVersion.fields.filter((f): f is FlatField => f.type !== "list"),
    lists: formVersion.fields.filter((f): f is ListField => f.type === "list"),
  };
}

/**
 * What the Extraction works on: the file, the Form's Fields and any stored
 * Reading. A Document without a Form (ADR 0010) has no Fields yet; it gets
 * `routableForms`, the Organisation's Forms for the Router, and `null` otherwise.
 */
export const input = internalQuery({
  args: { documentId: v.id("documents") },
  handler: async (ctx, { documentId }) => {
    const document = (await ctx.db.get(documentId))!;
    const form =
      document.formId === undefined
        ? { formName: "", formDescription: null, fields: [], lists: [] }
        : await formFields(ctx, document.formId, formOf(document).formVersion);
    const routableForms =
      document.formId === undefined ? await routableFormsOf(ctx, document.organisationId) : null;
    const reading = await ctx.db
      .query("readings")
      .withIndex("by_documentId", (q) => q.eq("documentId", documentId))
      .unique();
    return {
      fileKey: document.key,
      // A Document from before kinds is a PDF (lib/inputLimits.ts).
      kind: kindOf(document),
      mimeType: mimeTypeOf(document),
      pageCount: document.pageCount,
      ...form,
      routableForms,
      readingJson: reading?.json ?? null,
      textLayer: reading?.textLayer ?? [],
    };
  },
});

async function routableFormsOf(ctx: QueryCtx, organisationId: Id<"organisations">) {
  const forms = await ctx.db
    .query("forms")
    .withIndex("by_organisationId", (q) => q.eq("organisationId", organisationId))
    .take(MAX_ROUTABLE_FORMS);
  const routable: RoutableForm[] = [];
  for (const form of forms) {
    const { fields, lists } = await formFields(ctx, form._id, form.version);
    routable.push({
      id: form._id,
      name: form.name,
      description: form.description ?? null,
      fields: [...fields, ...lists].map((f) => f.label),
    });
  }
  return routable;
}

/** The Fields of the Form the Router picked, at its current Form Version. */
export const routedForm = internalQuery({
  args: { formId: v.id("forms") },
  handler: async (ctx, { formId }) => {
    const form = (await ctx.db.get(formId))!;
    return { formVersion: form.version, ...(await formFields(ctx, formId, form.version)) };
  },
});

/**
 * A Document that came without a Form and that the Router (or the fit check
 * after it) found none for: it keeps its Reading and its Items, and waits in
 * No Form to be moved to a Form or rejected (ADR 0010).
 */
export const noForm = internalMutation({
  args: { documentId: v.id("documents"), detail: v.string() },
  handler: async (ctx, { documentId, detail }) => {
    const document = (await ctx.db.get(documentId))!;
    if (document.state !== "extracting") return;
    await putInNoForm(ctx, document, detail);
  },
});

async function putInNoForm(ctx: MutationCtx, document: Doc<"documents">, detail: string) {
  await ctx.db.patch(document._id, {
    formId: undefined,
    formVersion: undefined,
    doesNotFit: undefined,
    jevVerified: undefined,
    reviewThreshold: undefined,
  });
  await moveTo(ctx, document, "no_form");
  await ctx.db.insert("documentEvents", {
    organisationId: document.organisationId,
    documentId: document._id,
    event: "no_form",
    detail,
    by: "vink",
    byEmail: "Vink",
    at: Date.now(),
  });
}

export const saveReading = internalMutation({
  args: {
    documentId: v.id("documents"),
    json: v.string(),
    textLayer: v.array(v.object({ page: v.number(), text: v.string() })),
  },
  handler: async (ctx, { documentId, json, textLayer }) => {
    const document = (await ctx.db.get(documentId))!;
    // Deleted meanwhile (Delete now): nothing it read is kept.
    if (document.state !== "extracting") return;
    await ctx.db.insert("readings", {
      organisationId: document.organisationId,
      documentId,
      json,
      textLayer,
    });
  },
});

/**
 * Stores the Field Values with their Confidence and Needs Review reasons,
 * against the Review Threshold in force now, when the Extraction finishes.
 */
export const finish = internalMutation({
  args: {
    documentId: v.id("documents"),
    /**
     * For a Document that came without a Form: the Form the Router picked, the
     * Form Version its Fields were matched against, and Jev's probability.
     * The fit check then gates the pick (ADR 0010).
     */
    routed: v.optional(
      v.object({ formId: v.id("forms"), formVersion: v.number(), probability: v.number() }),
    ),
    jevVerified: v.boolean(),
    doesNotFit: v.boolean(),
    lists: v.array(
      v.object({
        key: v.string(),
        required: v.boolean(),
        sourcePath: v.union(v.string(), v.null()),
        entries: v.number(),
        completeness: v.number(),
      }),
    ),
    fieldValues: v.array(
      v.object({
        key: v.string(),
        list: v.optional(v.object({ key: v.string(), entry: v.number() })),
        required: v.boolean(),
        value: v.union(v.string(), v.number(), v.boolean(), v.null()),
        readText: v.union(v.string(), v.null()),
        sourcePath: v.union(v.string(), v.null()),
        pages: v.array(v.number()),
        signals: v.object({
          match: v.number(),
          fit: v.union(v.number(), v.null()),
          support: v.union(v.number(), v.null()),
        }),
        typeMismatch: v.boolean(),
        unsure: v.boolean(),
        conflicting: v.boolean(),
      }),
    ),
  },
  handler: async (ctx, { documentId, routed, jevVerified, doesNotFit, lists, fieldValues }) => {
    let document = (await ctx.db.get(documentId))!;
    // A run that comes late (the Document moved on) changes nothing, so it
    // never overwrites a user's corrections.
    if (document.state !== "extracting") return;
    if (document.formId === undefined) {
      if (routed === undefined) throw new ConvexError("A Document without a Form needs the Router's pick");
      const picked = (await ctx.db.get(routed.formId))!;
      // The fit check gates Jev's pick: a Document that does not fit it has no Form.
      if (doesNotFit) {
        await putInNoForm(ctx, document, `Does not fit ${picked.name}`);
        return;
      }
      await ctx.db.patch(documentId, { formId: routed.formId, formVersion: routed.formVersion });
      document = { ...document, formId: routed.formId, formVersion: routed.formVersion };
      await ctx.db.insert("documentEvents", {
        organisationId: document.organisationId,
        documentId,
        event: "routed",
        detail: `${picked.name} (${Math.round(routed.probability * 100)}%)`,
        by: "vink",
        byEmail: "Vink",
        at: Date.now(),
      });
    }
    const { formId } = formOf(document);
    const { reviewThreshold } = (await ctx.db.get(formId))!;
    for (const { required, entries, ...list } of lists) {
      await ctx.db.insert("listValues", {
        organisationId: document.organisationId,
        documentId,
        ...list,
        required,
        entryCount: entries,
        reviewReasons: reviewReasonsOf({
          confidence: list.completeness,
          threshold: reviewThreshold,
          required,
          empty: entries === 0,
          typeMismatch: false,
          unsure: false,
          conflicting: false,
        }),
      });
    }
    for (const { required, typeMismatch, unsure, conflicting, ...fieldValue } of fieldValues) {
      const { confidence, lowestSignal } = confidenceOf(fieldValue.signals);
      await ctx.db.insert("fieldValues", {
        organisationId: document.organisationId,
        documentId,
        ...fieldValue,
        confidence,
        lowestSignal,
        reviewReasons: reviewReasonsOf({
          confidence,
          threshold: reviewThreshold,
          required,
          empty: fieldValue.value === null,
          typeMismatch,
          unsure,
          conflicting,
        }),
      });
    }
    await ctx.db.patch(documentId, { jevVerified, doesNotFit, reviewThreshold });
    const vink = { by: "vink", byEmail: "Vink", at: Date.now() };
    await ctx.db.insert("documentEvents", {
      organisationId: document.organisationId,
      documentId,
      event: "extracted",
      ...vink,
    });

    // Auto-Send is evaluated here, once, right after the Extraction succeeds.
    const form = (await ctx.db.get(formId))!;
    const clean =
      form.autoSend &&
      jevVerified &&
      !doesNotFit &&
      !document.userTouched &&
      (await openReviews(ctx, documentId)) === 0;
    if (!clean) {
      await moveTo(ctx, document, "needs_review");
      return;
    }
    const approval = { mode: "auto" as const, by: null, byEmail: null, at: vink.at };
    await ctx.db.patch(documentId, { approval });
    await moveTo(ctx, document, "approved");
    await ctx.db.insert("documentEvents", {
      organisationId: document.organisationId,
      documentId,
      event: "approved",
      detail: "Auto-Send",
      ...vink,
    });
    await createDeliveries(ctx, { ...document, approval });
  },
});
