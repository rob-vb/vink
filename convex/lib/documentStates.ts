import type { Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { documentState } from "../schema";

export type DocumentState = Infer<typeof documentState>;

/** Adds a new Document to its state's count. */
export async function countIn(
  ctx: MutationCtx,
  organisationId: Id<"organisations">,
  state: DocumentState,
) {
  await count(ctx, organisationId, state, +1);
}

/** Moves a Document to another state, keeping the Document list's counts in step. */
export async function moveTo(ctx: MutationCtx, document: Doc<"documents">, state: DocumentState) {
  await ctx.db.patch(document._id, { state });
  await count(ctx, document.organisationId, document.state, -1);
  await count(ctx, document.organisationId, state, +1);
}

async function count(
  ctx: MutationCtx,
  organisationId: Id<"organisations">,
  state: DocumentState,
  delta: number,
) {
  const counter = await ctx.db
    .query("documentCounts")
    .withIndex("by_organisationId_and_state", (q) =>
      q.eq("organisationId", organisationId).eq("state", state),
    )
    .unique();
  if (counter === null) {
    await ctx.db.insert("documentCounts", { organisationId, state, count: delta });
  } else {
    await ctx.db.patch(counter._id, { count: counter.count + delta });
  }
}
