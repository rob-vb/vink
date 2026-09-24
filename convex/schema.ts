import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const role = v.union(v.literal("admin"), v.literal("member"));

const fieldBase = {
  label: v.string(),
  // Its name in the Payload. See lib/fieldKeys.ts.
  key: v.string(),
  // Guides extraction: synonyms, other languages.
  description: v.optional(v.string()),
  required: v.boolean(),
};

export const field = v.union(
  v.object({
    ...fieldBase,
    type: v.union(
      v.literal("text"),
      v.literal("number"),
      v.literal("date"),
      v.literal("boolean"),
    ),
  }),
  v.object({
    ...fieldBase,
    type: v.literal("choice"),
    options: v.array(
      v.object({
        // What the Payload holds when this option is chosen.
        value: v.string(),
        // Guides the mapping from free text: synonyms, other languages.
        description: v.optional(v.string()),
      }),
    ),
  }),
);

// Every table except `organisations` itself carries an indexed `organisationId`.
export default defineSchema({
  organisations: defineTable({
    name: v.string(),
    slug: v.string(),
  }).index("by_slug", ["slug"]),

  memberships: defineTable({
    organisationId: v.id("organisations"),
    // Better Auth user id (the JWT subject).
    userId: v.string(),
    role,
  })
    .index("by_organisationId_and_userId", ["organisationId", "userId"])
    .index("by_userId", ["userId"]),

  // The Review Threshold and Auto-Send are Form settings, outside any Form Version.
  forms: defineTable({
    organisationId: v.id("organisations"),
    name: v.string(),
    description: v.optional(v.string()),
    reviewThreshold: v.number(),
    autoSend: v.boolean(),
    // The number of the current Form Version.
    version: v.number(),
  }).index("by_organisationId", ["organisationId"]),

  // Immutable: every save of a Form inserts a new one.
  formVersions: defineTable({
    organisationId: v.id("organisations"),
    formId: v.id("forms"),
    number: v.number(),
    fields: v.array(field),
    savedBy: v.string(),
  }).index("by_formId_and_number", ["formId", "number"]),
});
