import { ConvexError, type Infer, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { isValidKey } from "./lib/fieldKeys";
import { hasIntegrations } from "./integrations";
import { orgMutation, orgQuery } from "./lib/functions";
import { field } from "./schema";

export const list = orgQuery({
  args: {},
  handler: async (ctx) => {
    const forms = await ctx.db
      .query("forms")
      .withIndex("by_organisationId", (q) =>
        q.eq("organisationId", ctx.organisationId),
      )
      .take(500);
    return await Promise.all(
      forms.map(async (form) => {
        const version = await getVersion(ctx, form._id, form.version);
        return {
          id: form._id,
          name: form.name,
          description: form.description,
          version: form.version,
          fieldCount: version.fields.length,
          reviewThreshold: form.reviewThreshold,
          autoSend: form.autoSend,
        };
      }),
    );
  },
});

/** A Form with the Fields of one Form Version, the current one by default. */
export const get = orgQuery({
  role: "admin",
  args: { formId: v.id("forms"), version: v.optional(v.number()) },
  handler: async (ctx, { formId, version }) => {
    const form = await getForm(ctx, ctx.organisationId, formId);
    const formVersion = await getVersion(ctx, formId, version ?? form.version);
    return {
      id: form._id,
      name: form.name,
      description: form.description,
      reviewThreshold: form.reviewThreshold,
      autoSend: form.autoSend,
      currentVersion: form.version,
      version: formVersion.number,
      fields: formVersion.fields,
      keysLocked: await hasIntegrations(ctx, formId),
    };
  },
});

const formContent = {
  name: v.string(),
  description: v.optional(v.string()),
  fields: v.array(field),
};

export const create = orgMutation({
  role: "admin",
  args: formContent,
  handler: async (ctx, { name, description, fields }) =>
    await insertForm(ctx, { organisationId: ctx.organisationId, name, description, fields, savedBy: ctx.userId }),
});

/** A new Form with its first Form Version; also used by Form Proposals. */
export async function insertForm(
  ctx: MutationCtx,
  {
    organisationId,
    name,
    description,
    fields,
    savedBy,
  }: {
    organisationId: Id<"organisations">;
    name: string;
    description?: string;
    fields: Infer<typeof field>[];
    savedBy: string;
  },
) {
  checkContent(name, fields);
  const formId = await ctx.db.insert("forms", {
    organisationId,
    name,
    description,
    reviewThreshold: 0.8,
    autoSend: false,
    version: 1,
  });
  await ctx.db.insert("formVersions", { organisationId, formId, number: 1, fields, savedBy });
  return { formId };
}

/** Saves a Form's name, description and Fields as its next Form Version. */
export const save = orgMutation({
  role: "admin",
  args: { formId: v.id("forms"), ...formContent },
  handler: async (ctx, { formId, ...content }) =>
    await saveVersion(ctx, ctx.organisationId, ctx.userId, formId, content),
});

/** Saves a Form's next Form Version; also used by "Suggest Fields from PDF". */
export async function saveVersion(
  ctx: MutationCtx,
  organisationId: Id<"organisations">,
  userId: string,
  formId: Id<"forms">,
  { name, description, fields }: { name: string; description?: string; fields: Infer<typeof field>[] },
) {
  const form = await getForm(ctx, organisationId, formId);
  checkContent(name, fields);
  if (await hasIntegrations(ctx, formId)) {
    checkKeysKept((await getVersion(ctx, formId, form.version)).fields, fields);
  }
  const number = form.version + 1;
  await ctx.db.insert("formVersions", { organisationId, formId, number, fields, savedBy: userId });
  await ctx.db.patch(formId, { name, description, version: number });
  return { version: number };
}

/** Form settings: they apply to Extractions that finish afterwards. */
export const updateSettings = orgMutation({
  role: "admin",
  args: {
    formId: v.id("forms"),
    reviewThreshold: v.number(),
    autoSend: v.boolean(),
  },
  handler: async (ctx, { formId, reviewThreshold, autoSend }) => {
    await getForm(ctx, ctx.organisationId, formId);
    if (!(reviewThreshold >= 0 && reviewThreshold <= 1)) {
      throw new ConvexError("The Review Threshold must be from 0 to 1");
    }
    await ctx.db.patch(formId, { reviewThreshold, autoSend });
  },
});

/**
 * While an Integration is attached, every key it receives must stay: a Field
 * or sub-Field can be added or relabelled, not renamed or removed.
 */
function checkKeysKept(current: Infer<typeof field>[], next: Infer<typeof field>[]) {
  for (const f of current) {
    const kept = next.find((n) => n.key === f.key);
    if (kept === undefined) {
      throw new ConvexError(
        `The key "${f.key}" is locked while an Integration is attached: keep that Field`,
      );
    }
    if (f.type === "list") {
      if (kept.type !== "list") {
        throw new ConvexError(`The key "${f.key}" is locked while an Integration is attached`);
      }
      checkKeysKept(f.fields, kept.fields);
    }
  }
}

function checkContent(name: string, fields: Infer<typeof field>[]) {
  if (name.trim() === "") {
    throw new ConvexError("A Form needs a name");
  }
  checkFields(fields, "Field");
  for (const f of fields) {
    if (f.type === "list") {
      if (f.fields.length === 0) {
        throw new ConvexError(
          `The List Field "${f.key}" needs at least one sub-Field`,
        );
      }
      checkFields(f.fields, `sub-Field of the List Field "${f.key}"`);
    }
  }
}

/** Keys are unique among siblings: top-level Fields, or one List Field's sub-Fields. */
function checkFields(fields: Infer<typeof field>[], kind: string) {
  const keys = new Set<string>();
  for (const f of fields) {
    const { key, label } = f;
    if (!isValidKey(key)) {
      throw new ConvexError(
        `"${key}" isn't a valid key: use snake_case: lowercase letters, digits and single underscores, starting with a letter`,
      );
    }
    if (label.trim() === "") {
      throw new ConvexError(`The Field "${key}" needs a label`);
    }
    if (keys.has(key)) {
      throw new ConvexError(`The key "${key}" is used by more than one ${kind}`);
    }
    keys.add(key);
    if (f.type === "choice") {
      checkOptions(key, f.options);
    }
  }
}

function checkOptions(key: string, options: { value: string }[]) {
  if (options.length === 0) {
    throw new ConvexError(`The choice Field "${key}" needs at least one option`);
  }
  const values = new Set<string>();
  for (const { value } of options) {
    if (value.trim() === "") {
      throw new ConvexError(
        `Every option of the choice Field "${key}" needs a value`,
      );
    }
    if (values.has(value)) {
      throw new ConvexError(
        `The choice Field "${key}" has the option "${value}" more than once`,
      );
    }
    values.add(value);
  }
}

async function getForm(
  ctx: QueryCtx,
  organisationId: Id<"organisations">,
  formId: Id<"forms">,
) {
  const form = await ctx.db.get(formId);
  if (!form || form.organisationId !== organisationId) {
    throw new ConvexError("Form not found");
  }
  return form;
}

export async function getVersion(ctx: QueryCtx, formId: Id<"forms">, number: number) {
  const version = await ctx.db
    .query("formVersions")
    .withIndex("by_formId_and_number", (q) =>
      q.eq("formId", formId).eq("number", number),
    )
    .unique();
  if (!version) {
    throw new ConvexError("Form Version not found");
  }
  return version;
}
