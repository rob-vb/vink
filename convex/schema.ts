import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const role = v.union(v.literal("admin"), v.literal("member"));

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
});
