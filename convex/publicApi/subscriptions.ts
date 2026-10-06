// Subscriptions for automation platforms (Zapier, Make, Power Automate):
// subscribe to a Form's Approvals, unsubscribe, and a sample envelope to show
// the Form's fields before the first real Approval. See ../subscriptions.ts.
import { internal } from "../_generated/api";
import { apiError, apiJson } from "./respond";
import { type ApiRoute, route } from "./router";

const iso = (ms: number) => new Date(ms).toISOString();

async function jsonBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return typeof body === "object" && body !== null && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

export const subscriptionsRoutes: ApiRoute[] = [
  route("POST", "/v1/subscriptions", async (ctx, request, { caller }) => {
    const body = await jsonBody(request);
    if (body === null || typeof body.form_id !== "string" || typeof body.url !== "string") {
      return apiError(400, "invalid_request", "Send a JSON body with form_id and url, both strings.");
    }
    const result = await ctx.runMutation(internal.subscriptions.subscribe, {
      organisationId: caller.organisationId,
      apiKeyId: caller.apiKeyId,
      formId: body.form_id,
      url: body.url,
    });
    if ("refused" in result) {
      const { status, code, message } = result.refused;
      return apiError(status, code, message);
    }
    const { id, formId, url, createdAt } = result.subscription;
    return apiJson({ id, form_id: formId, url, created_at: iso(createdAt) }, 201);
  }),
  route("DELETE", "/v1/subscriptions/{id}", async (ctx, _request, { caller, params }) => {
    const result = await ctx.runMutation(internal.subscriptions.unsubscribe, {
      organisationId: caller.organisationId,
      subscriptionId: params.id,
    });
    if ("refused" in result) {
      const { status, code, message } = result.refused;
      return apiError(status, code, message);
    }
    return apiJson({ id: result.id, deleted: true });
  }),
  route("GET", "/v1/forms/{form_id}/sample", async (ctx, _request, { caller, params }) => {
    const envelope = await ctx.runQuery(internal.subscriptions.sample, {
      organisationId: caller.organisationId,
      formId: params.form_id,
    });
    if (envelope === null) return apiError(404, "not_found", "There's no Form with that id in your Organisation.");
    return apiJson(envelope);
  }),
];
