// Review actions on a Document in Needs Review: Correct, Check ("Value is
// right") and Undo per Field Value, and manual Approval.
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { moveTo } from "./lib/documentStates";
import { fitType } from "./lib/fieldTypes";
import { orgMutation } from "./lib/functions";
import type { FlatField } from "./lib/pipeline";
import { fieldValue as fieldValueType } from "./schema";

/** Whether a Field Value still waits for a user. */
export function needsReview(fieldValue: Pick<Doc<"fieldValues">, "reviewReasons" | "review">) {
  return fieldValue.reviewReasons.length > 0 && fieldValue.review === undefined;
}

/** How many Field Values and List Fields of a Document still wait for a user. */
export async function needsReviewCount(ctx: QueryCtx, documentId: Id<"documents">) {
  const fieldValues = await ctx.db
    .query("fieldValues")
    .withIndex("by_documentId", (q) => q.eq("documentId", documentId))
    .take(5000);
  const listValues = await ctx.db
    .query("listValues")
    .withIndex("by_documentId", (q) => q.eq("documentId", documentId))
    .take(100);
  return (
    fieldValues.filter(needsReview).length +
    listValues.filter((l) => l.reviewReasons.length > 0).length
  );
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
      q.eq("formId", document.formId).eq("number", document.formVersion),
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
    const left = await needsReviewCount(ctx, documentId);
    if (left > 0) {
      throw new ConvexError(
        left === 1 ? "1 value still needs review" : `${left} values still need review`,
      );
    }
    const who = await reviewer(ctx, ctx.userId);
    await ctx.db.patch(documentId, { approval: { mode: "manual", ...who } });
    await moveTo(ctx, document, "approved");
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
