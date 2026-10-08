// Review actions on a Document in Needs Review: Correct, Check ("Value is
// right") and Undo per Field Value, and manual Approval.
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { createDeliveries } from "./deliveries";
import { reviewReasonsOf } from "./lib/confidence";
import { formOf } from "./lib/documentForm";
import { moveTo } from "./lib/documentStates";
import { fitType } from "./lib/fieldTypes";
import { orgMutation } from "./lib/functions";
import type { FlatField, ListField } from "./lib/pipeline";
import { liveEntries, needsReviewCount } from "./lib/reviewState";
import { fieldValue as fieldValueType } from "./schema";

/** How many Field Values and List Fields of a Document still wait for a user. */
export async function openReviews(ctx: QueryCtx, documentId: Id<"documents">) {
  const fieldValues = await ctx.db
    .query("fieldValues")
    .withIndex("by_documentId", (q) => q.eq("documentId", documentId))
    .take(5000);
  const listValues = await ctx.db
    .query("listValues")
    .withIndex("by_documentId", (q) => q.eq("documentId", documentId))
    .take(100);
  return needsReviewCount(fieldValues, listValues);
}

/** A Document of the caller's Organisation that is open for review. */
async function reviewable(
  ctx: QueryCtx,
  organisationId: Id<"organisations">,
  documentId: Id<"documents">,
) {
  const document = await ctx.db.get(documentId);
  if (document === null || document.organisationId !== organisationId) {
    throw new ConvexError("Document not found");
  }
  if (document.state === "approved") throw new ConvexError("This Document is approved");
  if (document.state !== "needs_review") {
    throw new ConvexError("This Document can't be reviewed now");
  }
  return document;
}

/** A Field Value of the caller's Organisation, its open Document and its Field. */
async function loadFieldValue(
  ctx: QueryCtx,
  organisationId: Id<"organisations">,
  fieldValueId: Id<"fieldValues">,
) {
  const fieldValue = await ctx.db.get(fieldValueId);
  if (fieldValue === null || fieldValue.organisationId !== organisationId) {
    throw new ConvexError("Not found");
  }
  const document = await reviewable(ctx, organisationId, fieldValue.documentId);
  const formVersion = (await ctx.db
    .query("formVersions")
    .withIndex("by_formId_and_number", (q) =>
      q.eq("formId", formOf(document).formId).eq("number", formOf(document).formVersion),
    )
    .unique())!;
  const top = formVersion.fields.find((f) => f.key === (fieldValue.list?.key ?? fieldValue.key))!;
  const field = (top.type === "list" ? top.fields.find((f) => f.key === fieldValue.key)! : top) as FlatField;
  return { fieldValue, document, field };
}

async function reviewer(ctx: MutationCtx, userId: string) {
  const identity = await ctx.auth.getUserIdentity();
  return { by: userId, byEmail: identity?.email?.toLowerCase() ?? "", at: Date.now() };
}

const expectedType = {
  text: "text",
  number: "a number",
  date: "a date (yyyy-mm-dd)",
  boolean: "yes or no",
  choice: "one of its options",
} as const;

export const correct = orgMutation({
  args: { fieldValueId: v.id("fieldValues"), value: fieldValueType },
  handler: async (ctx, { fieldValueId, value }) => {
    const { fieldValue, document, field } = await loadFieldValue(
      ctx,
      ctx.organisationId,
      fieldValueId,
    );
    const checked = fitType(field, value);
    if (!checked.fits) {
      throw new ConvexError(`${field.label} needs ${expectedType[field.type]}`);
    }
    if (checked.value === null && field.required) {
      throw new ConvexError(`${field.label} is required`);
    }
    const who = await reviewer(ctx, ctx.userId);
    await ctx.db.patch(fieldValueId, {
      value: checked.value,
      extractedValue:
        fieldValue.extractedValue === undefined ? fieldValue.value : fieldValue.extractedValue,
      review: { state: "corrected", ...who },
    });
    await ctx.db.patch(document._id, { userTouched: true });
    await ctx.db.insert("documentEvents", {
      organisationId: ctx.organisationId,
      documentId: document._id,
      event: "corrected",
      detail: field.label,
      ...who,
    });
  },
});

export const check = orgMutation({
  args: { fieldValueId: v.id("fieldValues") },
  handler: async (ctx, { fieldValueId }) => {
    await loadFieldValue(ctx, ctx.organisationId, fieldValueId);
    await ctx.db.patch(fieldValueId, {
      review: { state: "checked", ...(await reviewer(ctx, ctx.userId)) },
    });
  },
});

/** Back to what the Extraction wrote, and to Needs Review if it was. */
export const undo = orgMutation({
  args: { fieldValueId: v.id("fieldValues") },
  handler: async (ctx, { fieldValueId }) => {
    const { fieldValue } = await loadFieldValue(ctx, ctx.organisationId, fieldValueId);
    await ctx.db.patch(fieldValueId, {
      value: fieldValue.extractedValue === undefined ? fieldValue.value : fieldValue.extractedValue,
      extractedValue: undefined,
      review: undefined,
    });
  },
});

/**
 * Approves a Document once nothing on it is Needs Review, and returns the
 * next Document that needs review, oldest first, for "Approve and next".
 */
export const approve = orgMutation({
  args: { documentId: v.id("documents") },
  handler: async (ctx, { documentId }) => {
    const document = await reviewable(ctx, ctx.organisationId, documentId);
    const left = await openReviews(ctx, documentId);
    if (left > 0) {
      throw new ConvexError(
        left === 1 ? "1 value still needs review" : `${left} values still need review`,
      );
    }
    const who = await reviewer(ctx, ctx.userId);
    const approval = { mode: "manual" as const, ...who };
    await ctx.db.patch(documentId, { approval });
    await moveTo(ctx, document, "approved");
    await createDeliveries(ctx, { ...document, approval });
    await ctx.db.insert("documentEvents", {
      organisationId: ctx.organisationId,
      documentId,
      event: "approved",
      ...who,
    });
    const next = await ctx.db
      .query("documents")
      .withIndex("by_organisationId_and_state", (q) =>
        q.eq("organisationId", ctx.organisationId).eq("state", "needs_review"),
      )
      .first();
    return { nextDocumentId: next?._id ?? null };
  },
});

/** A List Field of an open Document, with its definition. */
async function loadList(
  ctx: QueryCtx,
  organisationId: Id<"organisations">,
  documentId: Id<"documents">,
  listKey: string,
) {
  const document = await reviewable(ctx, organisationId, documentId);
  const list = await ctx.db
    .query("listValues")
    .withIndex("by_documentId", (q) => q.eq("documentId", documentId))
    .take(100)
    .then((lists) => lists.find((l) => l.key === listKey));
  const formVersion = (await ctx.db
    .query("formVersions")
    .withIndex("by_formId_and_number", (q) =>
      q.eq("formId", formOf(document).formId).eq("number", formOf(document).formVersion),
    )
    .unique())!;
  const field = formVersion.fields.find((f) => f.key === listKey);
  if (list === undefined || field?.type !== "list") throw new ConvexError("List not found");
  return { document, list, field: field as ListField };
}

/** Records a user's change to a List Field: history, and "user touched". */
async function touched(
  ctx: MutationCtx,
  document: Doc<"documents">,
  event: Doc<"documentEvents">["event"],
  detail: string,
  who: Awaited<ReturnType<typeof reviewer>>,
) {
  await ctx.db.patch(document._id, { userTouched: true });
  await ctx.db.insert("documentEvents", {
    organisationId: document.organisationId,
    documentId: document._id,
    event,
    detail,
    ...who,
  });
}

const listArgs = { documentId: v.id("documents"), listKey: v.string() };

/** Adds an empty entry to a List Field, to fill in by hand. */
export const addEntry = orgMutation({
  args: listArgs,
  handler: async (ctx, { documentId, listKey }) => {
    const { document, list, field } = await loadList(ctx, ctx.organisationId, documentId, listKey);
    const entry = list.entryCount;
    for (const subField of field.fields) {
      await ctx.db.insert("fieldValues", {
        organisationId: ctx.organisationId,
        documentId,
        key: subField.key,
        list: { key: listKey, entry },
        value: null,
        readText: null,
        sourcePath: null,
        pages: [],
        // Nothing was extracted, so nothing is doubtful but a missing required value.
        signals: { match: 1, fit: null, support: null },
        confidence: 1,
        lowestSignal: "match",
        reviewReasons: reviewReasonsOf({
          confidence: 1,
          threshold: 0,
          required: subField.required,
          empty: true,
          typeMismatch: false,
          unsure: false,
          conflicting: false,
        }),
      });
    }
    await ctx.db.patch(list._id, {
      entryCount: entry + 1,
      addedEntries: [...(list.addedEntries ?? []), entry],
    });
    const who = await reviewer(ctx, ctx.userId);
    await touched(ctx, document, "entry_added", `${field.label} #${entry + 1}`, who);
    return { entry };
  },
});

export const removeEntry = orgMutation({
  args: { ...listArgs, entry: v.number() },
  handler: async (ctx, { documentId, listKey, entry }) => {
    const { document, list, field } = await loadList(ctx, ctx.organisationId, documentId, listKey);
    if (!liveEntries(list).includes(entry)) throw new ConvexError("Entry not found");
    await ctx.db.patch(list._id, { removedEntries: [...(list.removedEntries ?? []), entry] });
    const who = await reviewer(ctx, ctx.userId);
    await touched(ctx, document, "entry_removed", `${field.label} #${entry + 1}`, who);
  },
});

export const restoreEntry = orgMutation({
  args: { ...listArgs, entry: v.number() },
  handler: async (ctx, { documentId, listKey, entry }) => {
    const { document, list, field } = await loadList(ctx, ctx.organisationId, documentId, listKey);
    const removed = list.removedEntries ?? [];
    if (!removed.includes(entry)) throw new ConvexError("Entry not found");
    await ctx.db.patch(list._id, { removedEntries: removed.filter((e) => e !== entry) });
    const who = await reviewer(ctx, ctx.userId);
    await touched(ctx, document, "entry_restored", `${field.label} #${entry + 1}`, who);
  },
});

/** "Entries are complete": clears the List Field's completeness Needs Review. */
export const confirmEntries = orgMutation({
  args: listArgs,
  handler: async (ctx, { documentId, listKey }) => {
    const { document, list, field } = await loadList(ctx, ctx.organisationId, documentId, listKey);
    if (field.required && liveEntries(list).length === 0) {
      throw new ConvexError(`${field.label} is required: add an entry first`);
    }
    const who = await reviewer(ctx, ctx.userId);
    await ctx.db.patch(list._id, { complete: { by: who.by, byEmail: who.byEmail, at: who.at } });
    await touched(ctx, document, "entries_confirmed", field.label, who);
  },
});

export const undoConfirmEntries = orgMutation({
  args: listArgs,
  handler: async (ctx, { documentId, listKey }) => {
    const { document, list, field } = await loadList(ctx, ctx.organisationId, documentId, listKey);
    await ctx.db.patch(list._id, { complete: undefined });
    const who = await reviewer(ctx, ctx.userId);
    await touched(ctx, document, "entries_unconfirmed", field.label, who);
  },
});
