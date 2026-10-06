// The public API's auth: `Authorization: Bearer <API Key>`. Every /v1
// endpoint but the OpenAPI document is wrapped in `withApiKey`, which hands
// the handler the key's Organisation; the handler never sees another's data.
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { type ActionCtx, httpAction } from "../_generated/server";
import { hashKey } from "../apiKeys";
import { apiError } from "./respond";

// Last used is a hint for the API Keys list, not a log: one write an hour.
const MARK_USED_EVERY = 60 * 60 * 1000;

export type ApiCaller = { organisationId: Id<"organisations">; apiKeyId: Id<"apiKeys"> };

export function withApiKey(
  handler: (ctx: ActionCtx, request: Request, caller: ApiCaller) => Promise<Response>,
) {
  return httpAction(async (ctx, request) => {
    const header = request.headers.get("Authorization") ?? "";
    const given = header.match(/^Bearer\s+(\S+)\s*$/i)?.[1];
    if (given === undefined) {
      return apiError(401, "missing_api_key", "Send your API Key in the Authorization header: Bearer <key>.");
    }
    const key = await ctx.runQuery(internal.apiKeys.byHash, { keyHash: await hashKey(given) });
    if (key === null) {
      // An unknown key and a revoked one look the same.
      return apiError(401, "invalid_api_key", "This API Key doesn't exist or was revoked.");
    }
    const now = Date.now();
    if (key.lastUsedAt === null || now - key.lastUsedAt >= MARK_USED_EVERY) {
      await ctx.runMutation(internal.apiKeys.markUsed, { apiKeyId: key.apiKeyId, at: now });
    }
    try {
      return await handler(ctx, request, { organisationId: key.organisationId, apiKeyId: key.apiKeyId });
    } catch (error) {
      console.error("Public API handler failed", error);
      return apiError(500, "internal_error", "Something went wrong on our side. Try again later.");
    }
  });
}
