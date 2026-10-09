// A Submission may have no Form (ADR 0010): while the Router has not picked one,
// and in No Form. Whatever works on a Submission's Form (its Fields, Field Values,
// Deliveries) calls this, so a Submission without one fails loudly instead of
// reading another Form's data.
import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";

export function formOf(submission: Doc<"submissions">): { formId: Id<"forms">; formVersion: number } {
  if (submission.formId === undefined || submission.formVersion === undefined) {
    throw new ConvexError("This Submission has no Form");
  }
  return { formId: submission.formId, formVersion: submission.formVersion };
}
