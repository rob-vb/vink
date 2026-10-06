// GET /v1/forms: the Organisation's Forms with the Fields of their current
// Form Version, for the automation platforms' dynamic fields.
import { type Infer, v } from "convex/values";
import { internal } from "../_generated/api";
import { internalQuery } from "../_generated/server";
import { getVersion } from "../forms";
import type { field, flatField } from "../schema";
import { withApiKey } from "./auth";
import { apiJson } from "./respond";

// What a program sees of a Field: no extraction descriptions.
function publicFlatField(f: Infer<typeof flatField>) {
  const base = { key: f.key, label: f.label, type: f.type, required: f.required };
  return f.type === "choice" ? { ...base, options: f.options.map((o) => o.value) } : base;
}

function publicField(f: Infer<typeof field>) {
  if (f.type !== "list") return publicFlatField(f);
  return { key: f.key, label: f.label, type: f.type, required: f.required, fields: f.fields.map(publicFlatField) };
}

export const list = internalQuery({
  args: { organisationId: v.id("organisations") },
  handler: async (ctx, { organisationId }) => {
    const forms = await ctx.db
      .query("forms")
      .withIndex("by_organisationId", (q) => q.eq("organisationId", organisationId))
      .take(500);
    return await Promise.all(
      forms.map(async (form) => ({
        id: form._id,
        name: form.name,
        description: form.description ?? null,
        version: form.version,
        fields: (await getVersion(ctx, form._id, form.version)).fields.map(publicField),
      })),
    );
  },
});

export const listForms = withApiKey(async (ctx, _request, { organisationId }) =>
  apiJson({ data: await ctx.runQuery(internal.publicApi.forms.list, { organisationId }) }),
);
