// A Document may have no Form (ADR 0010): while the Router has not picked one,
// and in No Form. Whatever works on a Document's Form (its Fields, Field Values,
// Deliveries) calls this, so a Document without one fails loudly instead of
// reading another Form's data.
import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";

export function formOf(document: Doc<"documents">): { formId: Id<"forms">; formVersion: number } {
  if (document.formId === undefined || document.formVersion === undefined) {
    throw new ConvexError("This Document has no Form");
  }
  return { formId: document.formId, formVersion: document.formVersion };
}
