import { v, type Infer } from "convex/values";

/**
 * What a history event says, as a code with its parameters instead of English
 * text, so the screens can write it in the user's language
 * (components/submissions/event-detail.ts). Old events have only the free-text
 * `detail` they were written with; the screens still show it.
 */

/** Jev's call on the parts of one email (lib/mailPlan.ts). */
export const splitAnswer = v.union(v.literal("together"), v.literal("cover_note"), v.literal("apart"));

/** Why Vink split an email it was unsure about: Jev's best call and how sure it was. */
export const splitInfo = v.object({
  answer: splitAnswer,
  percent: v.number(),
  submissions: v.number(),
});
export type SplitInfo = Infer<typeof splitInfo>;

export const eventInfo = v.union(
  // The Router picked the Form.
  v.object({ code: v.literal("routed"), form: v.string(), percent: v.number() }),
  // No Form: the Organisation has none, nothing could be read, or the pick did not fit.
  v.object({ code: v.literal("no_forms") }),
  v.object({ code: v.literal("nothing_read") }),
  v.object({ code: v.literal("no_fit"), form: v.optional(v.string()) }),
  // Change Form; `from` is `null` when the Submission had no Form.
  v.object({ code: v.literal("form_changed"), from: v.union(v.string(), v.null()), to: v.string() }),
  v.object({ code: v.literal("mail_split"), split: splitInfo }),
);
export type EventInfo = Infer<typeof eventInfo>;
