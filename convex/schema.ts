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

// A top-level Field, or a sub-Field of a List Field.
export const flatField = v.union(
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

export const field = v.union(
  flatField,
  v.object({
    ...fieldBase,
    type: v.literal("list"),
    // One level deep: a sub-Field is never a list itself.
    fields: v.array(flatField),
  }),
);

export const documentState = v.union(
  v.literal("extracting"),
  v.literal("needs_review"),
  v.literal("approved"),
  v.literal("extraction_failed"),
  v.literal("rejected"),
  v.literal("deleted"),
);

// A Field Value's raw signals: Jev's Match probability, fit and support.
export const signal = v.union(v.literal("match"), v.literal("fit"), v.literal("support"));

export const reviewReason = v.union(
  v.literal("below_threshold"),
  v.literal("required_empty"),
  v.literal("type_mismatch"),
  v.literal("unsure"),
  v.literal("conflicting"),
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
    // Copied from the user at join time, for the Members list. Optional only
    // for Memberships created before ticket 19 (see memberships.backfillEmails).
    email: v.optional(v.string()),
    role,
  })
    .index("by_organisationId_and_userId", ["organisationId", "userId"])
    .index("by_userId", ["userId"]),

  // An Admin's offer of a Membership, sent by email. Only the token's hash is kept.
  invitations: defineTable({
    organisationId: v.id("organisations"),
    email: v.string(),
    role,
    tokenHash: v.string(),
    expiresAt: v.number(),
    invitedBy: v.string(),
    acceptedAt: v.optional(v.number()),
  })
    .index("by_organisationId_and_email", ["organisationId", "email"])
    .index("by_tokenHash", ["tokenHash"]),

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

  // A PDF processed against the Form Version that was current at upload.
  documents: defineTable({
    organisationId: v.id("organisations"),
    formId: v.id("forms"),
    formVersion: v.number(),
    // The PDF's key in R2 (see lib/pdfStore.ts), prefixed with the Organisation.
    key: v.string(),
    filename: v.string(),
    pageCount: v.number(),
    uploadedBy: v.string(),
    // Copied from the uploader at upload time, for the Document list.
    uploaderEmail: v.string(),
    state: documentState,
    // Set when an Extraction finishes: whether Jev's Verify succeeded, and the
    // Form's Review Threshold at that moment, which its Field Values keep.
    jevVerified: v.optional(v.boolean()),
    reviewThreshold: v.optional(v.number()),
  }).index("by_organisationId_and_state", ["organisationId", "state"]),

  // What the vision model read on a Document (see lib/pipeline.ts), as JSON
  // text: its `_pages` and `_unsure` keys aren't valid Convex field names.
  // Kept apart from `documents` so the Document list never loads it.
  readings: defineTable({
    organisationId: v.id("organisations"),
    documentId: v.id("documents"),
    json: v.string(),
    // The pages with a text layer, for Verify's support check. Optional only
    // for Readings stored before ticket 24.
    textLayer: v.optional(v.array(v.object({ page: v.number(), text: v.string() }))),
  }).index("by_documentId", ["documentId"]),

  // One per top-level Field of the Document's Form Version, and one per
  // sub-Field per entry of each List Field.
  fieldValues: defineTable({
    organisationId: v.id("organisations"),
    documentId: v.id("documents"),
    // The Field's key; for a sub-Field, the sub-Field's key inside `list`.
    key: v.string(),
    // Set on a sub-Field's value: its List Field's key and the entry's index.
    list: v.optional(v.object({ key: v.string(), entry: v.number() })),
    // `null` when nothing on the Document holds the Field.
    value: v.union(v.string(), v.number(), v.boolean(), v.null()),
    // The Reading's value the Field Value was filled from, as it was read.
    readText: v.union(v.string(), v.null()),
    // Where that value sits in the Reading, e.g. `vehicle.licensePlate`.
    sourcePath: v.union(v.string(), v.null()),
    pages: v.array(v.number()),
    // The raw signals, kept for calibration and never sent: Jev's probability
    // for its Match choice (`none` included), and Verify's fit and support,
    // `null` when not asked.
    signals: v.object({
      match: v.number(),
      fit: v.union(v.number(), v.null()),
      support: v.union(v.number(), v.null()),
    }),
    // The lowest of the signals, and which one it was.
    confidence: v.number(),
    lowestSignal: signal,
    // Why it is Needs Review; empty when it isn't.
    reviewReasons: v.array(reviewReason),
  }).index("by_documentId", ["documentId"]),

  // One per List Field of the Document's Form Version: what holds its entries.
  listValues: defineTable({
    organisationId: v.id("organisations"),
    documentId: v.id("documents"),
    key: v.string(),
    // The array in the Reading that Match chose, `null` for `none`.
    sourcePath: v.union(v.string(), v.null()),
    entryCount: v.number(),
    // Jev's probability for the array choice: whether all entries were found.
    completeness: v.number(),
    reviewReasons: v.array(reviewReason),
  }).index("by_documentId", ["documentId"]),

  // A Document's history: who did what, and when.
  documentEvents: defineTable({
    organisationId: v.id("organisations"),
    documentId: v.id("documents"),
    event: v.literal("uploaded"),
    by: v.string(),
    // Copied from the user at the time, like `documents.uploaderEmail`.
    byEmail: v.string(),
    at: v.number(),
  }).index("by_documentId", ["documentId"]),

  // How many Documents an Organisation has in each state, for the list's tabs.
  // Kept in step by every state change, so the tabs never scan Documents.
  documentCounts: defineTable({
    organisationId: v.id("organisations"),
    state: documentState,
    count: v.number(),
  }).index("by_organisationId_and_state", ["organisationId", "state"]),
});
