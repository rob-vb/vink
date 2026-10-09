// The one place that writes an email Submission's files: the email as a JSON file
// (StoredEmail, lib/readerInput.ts) at `${organisationId}/${uuid}`, and each
// attachment as a file of its own under `${emailKey}/n`. Every way in that
// makes an email Submission (Intake Address, app upload, public API) uses this.
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { pdfStore } from "./pdfStore";
import type { StoredEmail } from "./readerInput";

export const EMAIL_MIME_TYPE = "application/json";

/** The name an email's Submission gets in the list: its subject. */
export function emailFilename(subject: string, from: string) {
  return subject.trim().slice(0, 200) || (from.trim() === "" ? "Email" : `Email from ${from}`);
}

/**
 * Writes the email and its attachments to storage. Returns the email's key and
 * the attachments' keys. The server writes both, so the keys in the file are
 * the server's own and always under the Organisation's prefix. When writing
 * fails halfway, what was written is removed.
 */
export async function storeEmail(
  ctx: ActionCtx,
  organisationId: Id<"organisations">,
  email: Pick<StoredEmail, "subject" | "from" | "date" | "body">,
  /** `pageCount`: the PDF's pages (an image has 1), so the review screen can number an attachment's pages after the body's. */
  parts: Array<{ filename: string; mimeType: string; bytes: Uint8Array; pageCount?: number }>,
): Promise<{ key: string; attachmentKeys: string[] }> {
  const key = `${organisationId}/${crypto.randomUUID()}`;
  const written: string[] = [];
  const attachments: StoredEmail["attachments"] = [];
  try {
    for (const part of parts) {
      const copy = `${key}/${attachments.length + 1}`;
      await pdfStore.store(ctx, copy, part.bytes, part.mimeType);
      written.push(copy);
      attachments.push({
        filename: part.filename,
        mimeType: part.mimeType,
        key: copy,
        ...(part.pageCount === undefined ? {} : { pageCount: part.pageCount }),
      });
    }
    const stored: StoredEmail = { ...email, attachments };
    await pdfStore.store(ctx, key, new TextEncoder().encode(JSON.stringify(stored)), EMAIL_MIME_TYPE);
    written.push(key);
  } catch (error) {
    for (const k of written) await pdfStore.remove(ctx, k);
    throw error;
  }
  return { key, attachmentKeys: attachments.map((a) => a.key) };
}
