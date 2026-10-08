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

// What a Document is (ADR 0010). Stored with its real MIME type, since the file
// is no longer always a PDF.
export const inputKind = v.union(v.literal("pdf"), v.literal("email"), v.literal("image"));

export const documentState = v.union(
  v.literal("extracting"),
  v.literal("needs_review"),
  v.literal("approved"),
  v.literal("extraction_failed"),
  // Read, but no Form fits (ADR 0010): it has no Field Values and is never approved.
  v.literal("no_form"),
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

export const fieldValue = v.union(v.string(), v.number(), v.boolean(), v.null());

// Who confirmed a Field Value by hand: Corrected (edited) or Checked ("Value is right").
export const review = v.object({
  state: v.union(v.literal("corrected"), v.literal("checked")),
  by: v.string(),
  byEmail: v.string(),
  at: v.number(),
});

export const planName = v.union(
  v.literal("starter"),
  v.literal("team"),
  v.literal("business"),
  v.literal("custom"),
  // For Vink's own and test Organisations: never refuses, never on the site.
  v.literal("internal_unlimited"),
);

// An Organisation's Plan and Items. The same shape sits under `items` and, until
// the narrow step, under its old name `pages` (see organisations below).
const itemsState = v.object({
  // `null`: no Plan, only Free Items.
  plan: v.union(planName, v.null()),
  // Items per period, and how many of them this period has used.
  allowance: v.number(),
  allowanceUsed: v.number(),
  // When the period ends: the allowance renews and Top-ups expire.
  // `null` without a period (no Plan, or internal unlimited).
  periodEndsAt: v.union(v.number(), v.null()),
  // The day of the month periods end on, so a period ending on the 31st
  // ends on the 28th in February and on the 31st again in March.
  anchorDay: v.optional(v.number()),
  topUp: v.number(),
  free: v.number(),
  // Every Item charged this period (without a period: ever), for the 80% warning.
  used: v.number(),
});

export const billingInterval = v.union(v.literal("monthly"), v.literal("annual"));

// Every table except `organisations` itself carries an indexed `organisationId`.
export default defineSchema({
  organisations: defineTable({
    name: v.string(),
    slug: v.string(),
    // Days a Document's data is kept after its last successful Delivery
    // (or its Approval, with no Integration). 30 when unset.
    retentionDays: v.optional(v.number()),
    // The user who created it, so only a user's first Organisation gets Free
    // Items. Unset for Organisations created before Plans.
    createdBy: v.optional(v.string()),
    // Its Plan and Items (see items.ts). Unset for Organisations created
    // before Plans, which count as the internal unlimited Plan.
    items: v.optional(itemsState),
    // The Page → Item rename (ADR 0010), widen step: Organisations from before
    // it still hold this under the old name until `items:backfillItems` has
    // run. items.ts reads `items ?? pages` and every write moves it to `items`.
    // TODO(narrow, after `items:backfillItems` ran on dev AND prod): remove
    // this field and the `by_periodEndsAt` index, and the fallbacks in items.ts.
    pages: v.optional(itemsState),
    // The setup after sign-up (onboarding.ts): Form, System, Input. Unset for
    // Organisations from before it, which count as set up. The steps themselves
    // are derived from facts (Forms, Integrations, Documents); this only holds
    // what a fact can't show: the System step was skipped, the Input step was seen.
    onboarding: v.optional(
      v.object({
        systemSkippedAt: v.optional(v.number()),
        inputDoneAt: v.optional(v.number()),
      }),
    ),
    // Its Stripe Customer, made at its first Checkout (see billing.ts).
    stripeCustomerId: v.optional(v.string()),
    // When billing.ts last read its Subscriptions from Stripe, ms (billingState.ts).
    billingSyncedAt: v.optional(v.number()),
    // Its Stripe Subscription as the last webhook left it, for the Items card.
    // Unset without one; the Plan itself lives in `items`.
    subscription: v.optional(
      v.object({
        id: v.string(),
        status: v.string(),
        interval: billingInterval,
        // When a cancelled Subscription stops; `null` while it renews.
        endsAt: v.union(v.number(), v.null()),
      }),
    ),
  })
    .index("by_slug", ["slug"])
    .index("by_createdBy", ["createdBy"])
    .index("by_itemsPeriodEndsAt", ["items.periodEndsAt"])
    // Narrow step: remove with `pages` (see above).
    .index("by_periodEndsAt", ["pages.periodEndsAt"])
    .index("by_stripeCustomerId", ["stripeCustomerId"]),

  // Top-ups paid through Stripe Checkout, so a webhook retry credits them once.
  topUpPayments: defineTable({
    organisationId: v.id("organisations"),
    checkoutSessionId: v.string(),
    items: v.optional(v.number()),
    // Old name of `items`; TODO(narrow): remove after `items:backfillItems` ran on prod.
    pages: v.optional(v.number()),
  })
    .index("by_checkoutSessionId", ["checkoutSessionId"])
    .index("by_organisationId", ["organisationId"]),

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

  // Fields proposed from one sample (a PDF, a photo or an email) or from the
  // Admin's description in words, before they are a Form (Version).
  formProposals: defineTable({
    organisationId: v.id("organisations"),
    createdBy: v.string(),
    createdByEmail: v.string(),
    // The sample's file in R2, like `documents.key`. Unset for a description:
    // it has no sample (and no Reading, and no Items are charged).
    key: v.optional(v.string()),
    // An email sample's attachments, stored under `${key}/…` like a Document's.
    attachmentKeys: v.optional(v.array(v.string())),
    // "Describe in words": what the document is and which data the Admin needs.
    description: v.optional(v.string()),
    // Its kind and MIME type, like a Document's. Widen step: unset on samples
    // from before kinds; they read as a PDF (lib/inputLimits.ts kindOf).
    // TODO(narrow, after `documents:backfillInputKind` ran on dev AND prod): make both required.
    kind: v.optional(inputKind),
    mimeType: v.optional(v.string()),
    // A description's first words; its `pageCount` is 0.
    filename: v.string(),
    pageCount: v.number(),
    // For "Suggest Fields from PDF": the Form being extended.
    formId: v.optional(v.id("forms")),
    state: v.union(
      v.literal("reading"),
      v.literal("proposing"),
      v.literal("ready"),
      v.literal("failed"),
    ),
    error: v.optional(v.string()),
    // The sample's Reading and text layer, as stored for a Document.
    readingJson: v.optional(v.string()),
    textLayer: v.optional(v.array(v.object({ page: v.number(), text: v.string() }))),
    fields: v.optional(v.array(v.object({ field, ticked: v.boolean() }))),
  }).index("by_organisationId", ["organisationId"]),

  // An Intake Address: `<token>@<INBOUND_DOMAIN>`. At most one per Form and one
  // per Organisation (the row without a `formId`; its mail goes through the
  // Router, ADR 0010). Replacing it deletes the row, so the old token stops at once.
  intakeAddresses: defineTable({
    organisationId: v.id("organisations"),
    formId: v.optional(v.id("forms")),
    token: v.string(),
    // The last "Emails to [Form] are being refused" mail to its Admins: at most one a day.
    outOfItemsAlertAt: v.optional(v.number()),
    // Old name of `outOfItemsAlertAt`; TODO(narrow): remove after `items:backfillItems` ran on prod.
    outOfPagesAlertAt: v.optional(v.number()),
  })
    .index("by_token", ["token"])
    .index("by_formId", ["formId"])
    // The Organisation's own address is the one with `formId` unset.
    .index("by_organisationId_and_formId", ["organisationId", "formId"]),

  // "Recent emails": what happened to each email sent to an Intake Address,
  // per part (its text, each attachment). The last 50 per address are kept.
  intakeEmails: defineTable({
    organisationId: v.id("organisations"),
    // Unset for an email sent to the Organisation Intake Address.
    formId: v.optional(v.id("forms")),
    from: v.string(),
    receivedAt: v.number(),
    attachments: v.array(
      v.object({
        filename: v.string(),
        outcome: v.union(v.literal("created"), v.literal("refused")),
        // Why it was refused; `null` for a created Document.
        reason: v.union(v.string(), v.null()),
      }),
    ),
  })
    .index("by_formId", ["formId"])
    .index("by_organisationId_and_formId", ["organisationId", "formId"]),

  // A Document (a PDF, for now) processed against the Form Version that was current at upload.
  documents: defineTable({
    organisationId: v.id("organisations"),
    // Unset while a Document that came without a Form is Extracting before the
    // Router has picked one, and in No Form (ADR 0010). Widened only: every
    // Document from before keeps its Form.
    formId: v.optional(v.id("forms")),
    formVersion: v.optional(v.number()),
    // The file's key in R2 (see lib/pdfStore.ts), prefixed with the Organisation.
    key: v.string(),
    // Its kind and the real MIME type of the stored file. Widen step: unset on
    // Documents from before kinds, which are PDFs (lib/inputLimits.ts reads a
    // missing one as "pdf" / "application/pdf") until `documents:backfillInputKind` has run.
    // TODO(narrow, after `documents:backfillInputKind` ran on dev AND prod): make both required.
    kind: v.optional(inputKind),
    mimeType: v.optional(v.string()),
    filename: v.string(),
    // A PDF's pages. For other kinds the number of Items is itemCountOf's to say.
    pageCount: v.number(),
    // An email Document's attachments, stored as files of their own (see
    // `StoredEmail` in lib/readerInput.ts); removed together with `key`.
    attachmentKeys: v.optional(v.array(v.string())),
    // Why Vink split an email it was unsure about into this Document and its
    // siblings (convex/intake.ts). It keeps Auto-Send off: a user looks first.
    splitReason: v.optional(v.string()),
    uploadedBy: v.string(),
    // Copied from the uploader at upload time, for the Document list.
    uploaderEmail: v.string(),
    state: documentState,
    // Set when an Extraction finishes: whether Jev's Verify succeeded, and the
    // Form's Review Threshold at that moment, which its Field Values keep.
    jevVerified: v.optional(v.boolean()),
    // "Does not fit this Form": set from the Match result (see lib/fit.ts).
    doesNotFit: v.optional(v.boolean()),
    reviewThreshold: v.optional(v.number()),
    // Who ruled it unusable, and the state Reopen returns it to.
    rejection: v.optional(
      v.object({
        by: v.string(),
        byEmail: v.string(),
        at: v.number(),
        reason: v.union(v.string(), v.null()),
        priorState: v.union(
          v.literal("needs_review"),
          v.literal("extraction_failed"),
          v.literal("no_form"),
        ),
      }),
    ),
    // When its PDF, Reading and Field Values were deleted; only metadata is left.
    dataDeletedAt: v.optional(v.number()),
    // An approved Document's retention clock: its last successful Delivery,
    // or its Approval when nothing is sent. Its data goes N days later.
    retentionClockAt: v.optional(v.number()),
    // Why the last Extraction failed, after all its attempts.
    extractionError: v.optional(v.string()),
    // Set by a user's correction (and later Change Form or Reopen): rules out Auto-Send.
    userTouched: v.optional(v.boolean()),
    approval: v.optional(
      v.object({
        mode: v.union(v.literal("manual"), v.literal("auto")),
        // The approving user; `null` for Auto-Send.
        by: v.union(v.string(), v.null()),
        byEmail: v.union(v.string(), v.null()),
        at: v.number(),
      }),
    ),
  })
    .index("by_organisationId_and_state", ["organisationId", "state"])
    .index("by_organisationId_and_retentionClockAt", ["organisationId", "retentionClockAt"]),

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
    value: fieldValue,
    // What the Extraction wrote, kept while a correction replaces it, for Undo.
    extractedValue: v.optional(fieldValue),
    review: v.optional(review),
    // The Reading's value the Field Value was filled from, as it was read.
    readText: v.union(v.string(), v.null()),
    // Where that value sits in the Reading, e.g. `supplier.vatNumber`.
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
    // As the Extraction judged it; see lib/reviewState.ts for the reasons now.
    reviewReasons: v.array(reviewReason),
    // Optional only for rows stored before ticket 28.
    required: v.optional(v.boolean()),
    // Entries are numbered 0 up to `entryCount` and never renumbered: a
    // removed entry is listed here, and an entry a user added is listed too.
    removedEntries: v.optional(v.array(v.number())),
    addedEntries: v.optional(v.array(v.number())),
    // "Entries are complete": who confirmed all entries were found.
    complete: v.optional(v.object({ by: v.string(), byEmail: v.string(), at: v.number() })),
  }).index("by_documentId", ["documentId"]),

  // A destination outside Vink that receives Payloads after Approval. One
  // member per kind: `organisationId` and `name`, then the kind's own
  // configuration. A new kind is a new member, sent by its adapter
  // (lib/integrationAdapters.ts); its secrets are encrypted like a secret header.
  integrations: defineTable(
    v.union(
      // A Webhook: POSTs the Payload to an endpoint.
      v.object({
        organisationId: v.id("organisations"),
        name: v.string(),
        // Absent on Integrations made before kinds existed: reads as "webhook"
        // (see integrations.backfillKind).
        kind: v.optional(v.literal("webhook")),
        url: v.string(),
        // Static headers; a secret header's value is encrypted (lib/secrets.ts).
        headers: v.array(v.object({ name: v.string(), value: v.string(), secret: v.boolean() })),
        // The HMAC-SHA256 key requests are signed with, encrypted.
        signingSecret: v.string(),
      }),
      // Google Sheets: adds rows (ADR 0009) to a sheet Vink made in the Drive
      // of the Google account an Admin connected (googleSheets.ts).
      v.object({
        organisationId: v.id("organisations"),
        name: v.string(),
        kind: v.literal("google_sheets"),
        // The OAuth refresh token, encrypted (lib/secrets.ts).
        refreshToken: v.string(),
        spreadsheetId: v.string(),
        // The tab Vink writes to; its id survives a rename.
        sheetId: v.number(),
        spreadsheetUrl: v.string(),
        // The connected account no longer lets Vink in (a Delivery failed with
        // access expired): an Admin must reconnect. Cleared by a Reconnect.
        needsReconnect: v.optional(v.boolean()),
        // Held by the send writing to the sheet now (lib/accounts.ts
        // `sendAlone`); it ends by `until` even if that send never does.
        writing: v.optional(v.object({ by: v.string(), until: v.number() })),
      }),
      // Excel: adds rows (ADR 0009) to a table in a workbook Vink made in the
      // OneDrive of the Microsoft 365 account an Admin connected (excel.ts).
      v.object({
        organisationId: v.id("organisations"),
        name: v.string(),
        kind: v.literal("excel"),
        // The OAuth refresh token, encrypted (lib/secrets.ts). Microsoft hands
        // out a new one with every access token; the newest is stored.
        refreshToken: v.string(),
        // The workbook by drive and item id, so a move or rename is fine, and its table.
        driveId: v.string(),
        itemId: v.string(),
        tableId: v.string(),
        workbookUrl: v.string(),
        // As for Google Sheets: set by access expired, cleared by a Reconnect.
        needsReconnect: v.optional(v.boolean()),
        // As for Google Sheets.
        writing: v.optional(v.object({ by: v.string(), until: v.number() })),
      }),
    ),
  ).index("by_organisationId", ["organisationId"]),

  // Which Integrations a Form sends to. Keys are locked while any exists.
  formIntegrations: defineTable({
    organisationId: v.id("organisations"),
    formId: v.id("forms"),
    integrationId: v.id("integrations"),
  })
    .index("by_formId", ["formId"])
    .index("by_integrationId", ["integrationId"]),

  // One attempt-series to send one approved Document's Payload to one Integration.
  deliveries: defineTable({
    organisationId: v.id("organisations"),
    documentId: v.id("documents"),
    integrationId: v.id("integrations"),
    // Kept for the log after the Integration is deleted.
    integrationName: v.string(),
    // Stable over every attempt and re-send, so the receiver can dedupe.
    deliveryId: v.string(),
    // The envelope as frozen at Approval, JSON. Removed with the Document's data.
    envelope: v.optional(v.string()),
    state: v.union(
      v.literal("pending"),
      v.literal("retrying"),
      v.literal("delivered"),
      v.literal("failed"),
    ),
    failureReason: v.optional(v.string()),
    attempts: v.array(
      v.object({
        at: v.number(),
        status: v.union(v.number(), v.null()),
        // The start of the response body.
        body: v.union(v.string(), v.null()),
        // Why there was no answer (timeout, network).
        error: v.union(v.string(), v.null()),
      }),
    ),
    nextAttemptAt: v.optional(v.number()),
    // Where the current attempt-series starts in `attempts`; a re-send starts a new one.
    seriesStart: v.optional(v.number()),
    // Failed because its Integration was detached or deleted: never re-sent.
    integrationRemoved: v.optional(v.boolean()),
  })
    .index("by_documentId", ["documentId"])
    .index("by_integrationId", ["integrationId"]),

  // In-app notifications for an Organisation's Admins, e.g. a failed Delivery.
  notifications: defineTable({
    organisationId: v.id("organisations"),
    text: v.string(),
    documentId: v.optional(v.id("documents")),
    at: v.number(),
    // The Admins who have seen it.
    readBy: v.array(v.string()),
  }).index("by_organisationId", ["organisationId"]),

  // A Document's history: who did what, and when.
  documentEvents: defineTable({
    organisationId: v.id("organisations"),
    documentId: v.id("documents"),
    event: v.union(
      v.literal("uploaded"),
      v.literal("extracted"),
      v.literal("extraction_failed"),
      v.literal("extraction_retried"),
      v.literal("corrected"),
      v.literal("entry_added"),
      v.literal("entry_removed"),
      v.literal("entry_restored"),
      v.literal("entries_confirmed"),
      v.literal("entries_unconfirmed"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("reopened"),
      v.literal("form_changed"),
      // The Router picked the Form, or found none (ADR 0010).
      v.literal("routed"),
      v.literal("no_form"),
      // An email became several Documents and Vink was unsure it should (ADR 0010).
      v.literal("mail_split"),
      v.literal("data_deleted"),
      v.literal("deleted"),
    ),
    // What it was about, e.g. the corrected Field's label.
    detail: v.optional(v.string()),
    // The user's id, or `vink` for what Vink did itself.
    by: v.string(),
    // Copied from the user at the time, like `documents.uploaderEmail`.
    byEmail: v.string(),
    at: v.number(),
  }).index("by_documentId", ["documentId"]),

  // An upload URL handed out by `documents.generateUploadUrl`, until its PDF
  // becomes a Document or a Form Proposal sample. One still here after 24
  // hours is an orphan: the daily cleanup deletes its R2 object.
  uploads: defineTable({
    organisationId: v.id("organisations"),
    key: v.string(),
    issuedAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_issuedAt", ["issuedAt"])
    .index("by_organisationId", ["organisationId"]),

  // Contact-form requests per visitor, for the rate limit only: a keyed hash
  // of the IP and the request times of the last hour. The requests themselves
  // are emailed and never stored. Outside any Organisation.
  contactRateLimits: defineTable({
    ipHash: v.string(),
    times: v.array(v.number()),
    lastAt: v.number(),
  })
    .index("by_ipHash", ["ipHash"])
    .index("by_lastAt", ["lastAt"]),

  // A named secret for the public API (/v1). Only its SHA-256 hash is kept;
  // revoking deletes the row, so the key stops at once (see apiKeys.ts).
  apiKeys: defineTable({
    organisationId: v.id("organisations"),
    name: v.string(),
    keyHash: v.string(),
    // The key's last 4 characters, to tell keys apart in the list.
    last4: v.string(),
    createdBy: v.string(),
    // Coarse: written at most once an hour (see publicApi/auth.ts).
    lastUsedAt: v.optional(v.number()),
  })
    .index("by_keyHash", ["keyHash"])
    .index("by_organisationId", ["organisationId"]),

  // An automation platform's request, made with an API Key, to hear about one
  // Form's Approvals (ADR 0008): it is the Webhook `integrationId`, attached to
  // `formId`. Removing that Webhook, or revoking the key, ends it.
  subscriptions: defineTable({
    organisationId: v.id("organisations"),
    apiKeyId: v.id("apiKeys"),
    integrationId: v.id("integrations"),
    formId: v.id("forms"),
  })
    .index("by_organisationId", ["organisationId"])
    .index("by_apiKeyId", ["apiKeyId"])
    .index("by_integrationId", ["integrationId"]),

  // How many Documents an Organisation has in each state, for the list's tabs.
  // Kept in step by every state change, so the tabs never scan Documents.
  documentCounts: defineTable({
    organisationId: v.id("organisations"),
    state: documentState,
    count: v.number(),
  }).index("by_organisationId_and_state", ["organisationId", "state"]),
});
