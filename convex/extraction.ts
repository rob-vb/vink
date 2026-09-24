// An Extraction's steps around the Node action in extractionRun.ts: queueing
// it, and what it reads and writes in the database.
import { Workpool } from "@convex-dev/workpool";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { confidenceOf, reviewReasonsOf } from "./lib/confidence";
import { moveTo } from "./lib/documentStates";
import type { FlatField } from "./lib/pipeline";

const extractionPool = new Workpool(components.extractionPool, {
  maxParallelism: 5,
  retryActionsByDefault: true,
  // The first run and 3 retries.
  defaultRetryBehavior: { maxAttempts: 4, initialBackoffMs: 10_000, base: 3 },
});

export async function startExtraction(ctx: MutationCtx, documentId: Id<"documents">) {
  await extractionPool.enqueueAction(ctx, internal.extractionRun.run, { documentId });
}

/** What the Extraction works on: the PDF, the Form's Fields and any stored Reading. */
export const input = internalQuery({
  args: { documentId: v.id("documents") },
  handler: async (ctx, { documentId }) => {
    const document = (await ctx.db.get(documentId))!;
    const form = (await ctx.db.get(document.formId))!;
    const formVersion = (await ctx.db
      .query("formVersions")
      .withIndex("by_formId_and_number", (q) =>
        q.eq("formId", document.formId).eq("number", document.formVersion),
      )
      .unique())!;
    const reading = await ctx.db
      .query("readings")
      .withIndex("by_documentId", (q) => q.eq("documentId", documentId))
      .unique();
    return {
      pdfKey: document.key,
      formName: form.name,
      formDescription: form.description ?? null,
      // List Fields go through the pipeline from ticket 25.
      fields: formVersion.fields.filter((f): f is FlatField => f.type !== "list"),
      readingJson: reading?.json ?? null,
      textLayer: reading?.textLayer ?? [],
    };
  },
});

export const saveReading = internalMutation({
  args: {
    documentId: v.id("documents"),
    json: v.string(),
    textLayer: v.array(v.object({ page: v.number(), text: v.string() })),
  },
  handler: async (ctx, { documentId, json, textLayer }) => {
    const document = (await ctx.db.get(documentId))!;
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
    jevVerified: v.boolean(),
    fieldValues: v.array(
      v.object({
        key: v.string(),
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
  handler: async (ctx, { documentId, jevVerified, fieldValues }) => {
    const document = (await ctx.db.get(documentId))!;
    const { reviewThreshold } = (await ctx.db.get(document.formId))!;
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
    await ctx.db.patch(documentId, { jevVerified, reviewThreshold });
    await moveTo(ctx, document, "needs_review");
  },
});
