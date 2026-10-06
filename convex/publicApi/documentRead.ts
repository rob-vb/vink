// GET /v1/documents/{id}: a Document's state and, only after Approval, its
// Payload in the envelope every Webhook gets. Before Approval nothing of its
// Field Values is in the answer, so nothing leaves Vink unapproved.
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalQuery } from "../_generated/server";
import { documentPayload } from "../lib/documentPayload";
import type { DocumentState } from "../lib/documentStates";
import { envelopeOf } from "../lib/payload";
import { apiError, apiJson } from "./respond";
import { type ApiRoute, route } from "./router";

// The states on the wire (openapi/documentRead.ts documents them).
const wireState: Record<DocumentState, string> = {
  extracting: "processing",
  needs_review: "needs_review",
  approved: "approved",
  extraction_failed: "failed",
  rejected: "rejected",
  deleted: "deleted",
};

const iso = (ms: number) => new Date(ms).toISOString();

/** The answer for one of the Organisation's Documents; null for no such Document. */
export const read = internalQuery({
  args: { organisationId: v.id("organisations"), documentId: v.string() },
  handler: async (ctx, { organisationId, documentId: givenId }) => {
    const documentId = ctx.db.normalizeId("documents", givenId);
    const document = documentId && (await ctx.db.get(documentId));
    if (!document || document.organisationId !== organisationId) return null;
    const { approval } = document;
    const sendable = document.state === "approved" && approval !== undefined && document.dataDeletedAt === undefined;
    return {
      id: document._id,
      form_id: document.formId,
      state: wireState[document.state],
      filename: document.filename,
      uploaded_at: iso(document._creationTime),
      data_deleted_at: document.dataDeletedAt === undefined ? null : iso(document.dataDeletedAt),
      payload: sendable
        ? envelopeOf({
            // Not a Delivery: one id per Document, the same on every read.
            deliveryId: `doc_${document._id}`,
            test: false,
            document: { id: document._id, filename: document.filename, uploadedAt: document._creationTime },
            form: { id: document.formId, version: document.formVersion },
            approval: { mode: approval.mode, by: approval.by, at: approval.at },
            data: await documentPayload(ctx, document),
          })
        : null,
    };
  },
});

export const documentReadRoutes: ApiRoute[] = [
  route("GET", "/v1/documents/{id}", async (ctx, _request, { caller, params }) => {
    const document = await ctx.runQuery(internal.publicApi.documentRead.read, {
      organisationId: caller.organisationId,
      documentId: params.id,
    });
    if (document === null) return apiError(404, "not_found", "There's no Document with that id in your Organisation.");
    return apiJson(document);
  }),
];
