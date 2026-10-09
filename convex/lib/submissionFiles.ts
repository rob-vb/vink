// A Submission's files in R2: its own file, and for an email the attachments
// stored beside it under `${key}/…` (lib/readerInput.ts StoredEmail). Every
// place that deletes a Submission's data removes them through here.
import type { Doc } from "../_generated/dataModel";
import type { ActionCtx, MutationCtx } from "../_generated/server";
import { pdfStore } from "./pdfStore";

/** Removes the Submission's file and its email attachments. Only keys under its own key go. */
export async function removeSubmissionFiles(
  ctx: MutationCtx | ActionCtx,
  submission: Pick<Doc<"submissions">, "key" | "attachmentKeys">,
) {
  for (const key of submission.attachmentKeys ?? []) {
    if (key.startsWith(`${submission.key}/`)) await pdfStore.remove(ctx, key);
  }
  await pdfStore.remove(ctx, submission.key);
}
