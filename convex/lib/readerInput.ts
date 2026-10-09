// Builds the Reader's input (lib/pipeline.ts ReaderInput) from what a Submission
// or a Form Proposal sample stores: its kind, MIME type and file in R2.
import {
  IMAGE_MIME_TYPES,
  type InputKind,
  MAX_EMAIL_ATTACHMENT_BYTES,
  MAX_EMAIL_ATTACHMENTS,
  PDF_MIME_TYPE,
} from "./inputLimits";
import type { ReaderInput } from "./pipeline";

/** What is stored of a Submission or sample. */
export type StoredInput = { fileKey: string; kind: InputKind; mimeType: string; pageCount: number };

/** The part of the file store this needs; the real one is lib/pdfStore.ts. */
export type FileStore = { read(key: string): Promise<Uint8Array | null> };

/**
 * The input cannot be read, and trying again will not change that: an
 * unsupported type, a stored email that is not valid, a missing file, or more
 * bytes than one request takes. The Extraction fails at once instead of
 * retrying (extractionRun.ts).
 */
export class UnreadableInput extends Error {
  readonly name = "UnreadableInput";
}

/**
 * An email is stored as one JSON file (this shape) at `key`, which starts with
 * the Organisation's id, with its attachments as files of their own under
 * `${key}/…`. Only the server writes it (convex/intake.ts); `readerInputOf`
 * refuses a file that does not have exactly this shape.
 */
export type StoredEmail = {
  subject: string;
  from: string;
  date: string;
  body: string;
  /** `pageCount` is for the review screen only (the Reader reads the file's own pages); emails stored before it have none. */
  attachments: Array<{ filename: string; mimeType: string; key: string; pageCount?: number }>;
};

async function bytesAt(store: FileStore, key: string) {
  const bytes = await store.read(key);
  if (bytes === null) throw new UnreadableInput(`No file stored under ${key}`);
  return bytes;
}

const isString = (value: unknown): value is string => typeof value === "string";

/** The stored email, checked by hand: a client may have put anything in the file. */
function parseStoredEmail(bytes: Uint8Array, emailKey: string): StoredEmail {
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new UnreadableInput("The stored email is not valid JSON");
  }
  const email = json as Partial<Record<keyof StoredEmail, unknown>> | null;
  if (
    typeof email !== "object" ||
    email === null ||
    !isString(email.subject) ||
    !isString(email.from) ||
    !isString(email.date) ||
    !isString(email.body) ||
    !Array.isArray(email.attachments)
  ) {
    throw new UnreadableInput("The stored email does not have the expected shape");
  }
  if (email.attachments.length > MAX_EMAIL_ATTACHMENTS) {
    throw new UnreadableInput(`The stored email has more than ${MAX_EMAIL_ATTACHMENTS} attachments`);
  }
  const attachments = email.attachments.map((a: unknown) => {
    const attachment = a as Record<string, unknown> | null;
    if (
      typeof attachment !== "object" ||
      attachment === null ||
      !isString(attachment.filename) ||
      !isString(attachment.mimeType) ||
      !isString(attachment.key)
    ) {
      throw new UnreadableInput("The stored email has an attachment without a name, type or key");
    }
    // Each attachment lives under the email's own key (and so under its Organisation's).
    if (!attachment.key.startsWith(`${emailKey}/`)) {
      throw new UnreadableInput("The stored email points at a file that is not its own");
    }
    if (attachment.mimeType !== PDF_MIME_TYPE && !(IMAGE_MIME_TYPES as readonly string[]).includes(attachment.mimeType)) {
      throw new UnreadableInput(`The stored email has an attachment of an unsupported type: ${attachment.mimeType}`);
    }
    return { filename: attachment.filename, mimeType: attachment.mimeType, key: attachment.key };
  });
  return { subject: email.subject, from: email.from, date: email.date, body: email.body, attachments };
}

export async function readerInputOf(
  store: FileStore,
  stored: StoredInput,
  organisationId: string,
): Promise<ReaderInput> {
  switch (stored.kind) {
    case "pdf":
      return { kind: "pdf", bytes: await bytesAt(store, stored.fileKey), pageCount: stored.pageCount };
    case "image":
      if (!(IMAGE_MIME_TYPES as readonly string[]).includes(stored.mimeType)) {
        throw new UnreadableInput(`An image of type ${stored.mimeType} is not supported`);
      }
      return { kind: "image", bytes: await bytesAt(store, stored.fileKey), mimeType: stored.mimeType };
    case "email": {
      if (!stored.fileKey.startsWith(`${organisationId}/`)) {
        throw new UnreadableInput("The stored email is not this Organisation's");
      }
      const email = parseStoredEmail(await bytesAt(store, stored.fileKey), stored.fileKey);
      const attachments = [];
      let total = 0;
      for (const { filename, mimeType, key } of email.attachments) {
        const bytes = await bytesAt(store, key);
        total += bytes.length;
        if (total > MAX_EMAIL_ATTACHMENT_BYTES) {
          throw new UnreadableInput("The attachments of the email are larger than 12 MB together");
        }
        attachments.push({ filename, mimeType, bytes });
      }
      // `kind` last: nothing in the file can change it.
      return { ...email, attachments, kind: "email" };
    }
  }
}
