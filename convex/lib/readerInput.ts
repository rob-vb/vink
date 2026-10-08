// Builds the Reader's input (lib/pipeline.ts ReaderInput) from what a Document
// or a Form Proposal sample stores: its kind, MIME type and file in R2.
import type { InputKind } from "./inputLimits";
import type { ReaderInput } from "./pipeline";

/** What is stored of a Document or sample. */
export type StoredInput = { fileKey: string; kind: InputKind; mimeType: string; pageCount: number };

/** The part of the file store this needs; the real one is lib/pdfStore.ts. */
export type FileStore = { read(key: string): Promise<Uint8Array | null> };

/**
 * An email is stored as one JSON file (this shape), with its attachments as
 * files of their own under their `key`. The intake of emails (ADR 0010, steps
 * 6-7) writes it; change it there and here together.
 */
export type StoredEmail = {
  subject: string;
  from: string;
  date: string;
  body: string;
  attachments: Array<{ filename: string; mimeType: string; key: string }>;
};

async function bytesAt(store: FileStore, key: string) {
  const bytes = await store.read(key);
  if (bytes === null) throw new Error(`No file stored under ${key}`);
  return bytes;
}

export async function readerInputOf(store: FileStore, stored: StoredInput): Promise<ReaderInput> {
  const bytes = await bytesAt(store, stored.fileKey);
  switch (stored.kind) {
    case "pdf":
      return { kind: "pdf", bytes, pageCount: stored.pageCount };
    case "image":
      return { kind: "image", bytes, mimeType: stored.mimeType };
    case "email": {
      const email = JSON.parse(new TextDecoder().decode(bytes)) as StoredEmail;
      const attachments = [];
      for (const { filename, mimeType, key } of email.attachments) {
        attachments.push({ filename, mimeType, bytes: await bytesAt(store, key) });
      }
      return { kind: "email", ...email, attachments };
    }
  }
}
