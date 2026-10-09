// What Vink takes in, per kind of input (ADR 0010): how big it may be on every
// way in (app upload, Intake Address, public API), and how many Items it costs.
// Kept free of Convex imports: the app imports this file too.
//
// Copies of these limits live where this file cannot be imported. Change them
// together (workers/intake-email/src/map.test.ts fails when the Worker drifts):
//   - deploy/nginx.conf: `client_max_body_size` (the biggest file below, plus room)
//   - workers/intake-email/src/map.ts: MAX_BYTES and the other MAX_* there

export type InputKind = "pdf" | "email" | "image";

// A Document from before kinds existed (the widen step of step 3 of the "any
// input" plan) has no `kind` and no `mimeType`: it is a PDF.
// TODO(narrow, after `documents:backfillInputKind` ran on dev AND prod): make
// `kind` and `mimeType` required in schema.ts, and drop these fallbacks.
export const PDF_MIME_TYPE = "application/pdf";

export function kindOf(stored: { kind?: InputKind }): InputKind {
  return stored.kind ?? "pdf";
}

export function mimeTypeOf(stored: { mimeType?: string }): string {
  return stored.mimeType ?? PDF_MIME_TYPE;
}

// --- PDF ---

export const MAX_PDF_BYTES = 10 * 1024 * 1024;

// The refusal's text. The app translates it by this exact text
// (lib/server-errors.ts); the public API answers it as 413 file_too_large.
export const PDF_TOO_LARGE = "The PDF is larger than 10 MB.";

// --- Image ---

// JPG, PNG and HEIC (what an iPhone takes). `image/heif` is HEIC's other
// registered name; some phones and mail apps send that one.
export const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/heic", "image/heif"] as const;

// 10 MB, the same as a PDF. A phone photo is 2-6 MB as JPEG and about half that
// as HEIC; 10 MB takes the biggest phone cameras and scans at a good
// resolution, and it still fits in one model request after base64 (+33%). The
// same number as the PDF limit means nginx and the Worker need no new size.
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export const IMAGE_TOO_LARGE = "The image is larger than 10 MB.";

// --- Any file ---

// The refusal for a request body (the public API, nginx) that is over the limit
// before anyone knows what kind of file is in it. The same 10 MB for every kind.
export const FILE_TOO_LARGE = "The file is larger than 10 MB.";

// A file that is none of PDF, JPG, PNG, HEIC or an email.
export const UNSUPPORTED_TYPE =
  "Vink reads PDFs, photos (JPG, PNG, HEIC) and the email text; this file type isn't supported.";

// --- Email ---

// The body as text (the Worker turns HTML into text), not the whole message.
// 200 KiB is about 50 pages of plain text: more than any mail a person writes,
// and little enough for one Reading request to the models.
export const MAX_EMAIL_BODY_BYTES = 200 * 1024;

// PDF and image attachments together. Each one is an Item at least, so a mail
// with more is a batch that belongs in the upload or the API.
export const MAX_EMAIL_ATTACHMENTS = 10;

// All the attachments of one email together. They go to the vision model in one
// request, inline as base64 (+33%), and Vertex takes 20 MB for such a request:
// 12 MB of files is 16 MB of base64, which leaves room for the email's text,
// the prompt and the answer's schema. One PDF and one photo of 10 MB each do not
// fit; a mail of that size is a batch that belongs in the upload or the API.
export const MAX_EMAIL_ATTACHMENT_BYTES = 12 * 1024 * 1024;

// Why an email, or a part of one, was refused. The app translates these by
// their exact text (lib/server-errors.ts).
export const EMAIL_BODY_TOO_LARGE = "The email text is longer than 200 KB.";
export const TOO_MANY_ATTACHMENTS = `Vink reads up to ${MAX_EMAIL_ATTACHMENTS} attachments per email.`;
export const ATTACHMENTS_TOO_LARGE = "The attachments of this email are larger than 12 MB together.";
export const EMPTY_EMAIL = "This email has no text and no attachments.";
// The row in Recent emails for a text Jev called a cover note ("see attachment"): it is no Document and costs nothing.
export const COVER_NOTE_NOT_READ = "Cover note, not read";

// --- Items ---

export type CountedAttachment = { kind: "pdf"; pageCount: number } | { kind: "image" };

export type CountedInput =
  | { kind: "pdf"; pageCount: number }
  | { kind: "image" }
  | { kind: "email"; body: string; attachments: CountedAttachment[] };

/**
 * How many Items an input costs: the one place that decides it.
 *   pdf   = its pages
 *   image = 1
 *   email = its body (1 when it has content, 0 when it is empty) plus each
 *           attachment: a PDF its pages, an image 1.
 * The email's text is counted as one Item when it is a Document, or part of
 * one. A text that Jev calls only a cover note ("see attachment, regards") is no
 * Document and costs nothing: the caller passes it as an empty `body`
 * (itemsOfMail in lib/mailPlan.ts does). So "Zie bijlage" with three PDFs costs
 * the pages of the three PDFs, a complaint with a photo costs 2, and a complaint
 * with two photos sent as separate papers costs 3.
 * Confirmed by the user on 2026-10-09 (ADR 0010, GLOSSARY "Item"). To change
 * it, change only the `email` case and itemsOfMail.
 */
export function itemCountOf(input: CountedInput): number {
  switch (input.kind) {
    case "pdf":
      return input.pageCount;
    case "image":
      return 1;
    case "email": {
      const body = input.body.trim() === "" ? 0 : 1;
      return input.attachments.reduce((sum, a) => sum + itemCountOf(a), body);
    }
  }
}
