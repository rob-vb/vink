// The Worker's only logic: which attachments to store and what to tell Vink.
// Kept free of Cloudflare and MIME-parser imports so it can be tested alone.

/**
 * The limits of convex/lib/inputLimits.ts, copied here because this package
 * can't import it. Change them together; map.test.ts fails when a copy drifts.
 * MAX_BYTES is MAX_PDF_BYTES: the largest PDF attachment, 10 MB as on every
 * way in.
 */
export const MAX_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/heic", "image/heif"] as const;
export const MAX_EMAIL_BODY_BYTES = 200 * 1024;
export const MAX_EMAIL_ATTACHMENTS = 10;
export const MAX_EMAIL_ATTACHMENT_BYTES = 12 * 1024 * 1024;

/**
 * The largest email the Worker reads: Cloudflare Email Routing's own limit.
 * Base64 makes a 10 MB PDF about 14 MB of mail, and one email may carry
 * several PDFs, so each PDF is checked against MAX_BYTES instead and an
 * oversized one shows as refused in the Form's recent emails.
 */
export const MAX_MESSAGE_BYTES = 25 * 1024 * 1024;

export type ParsedAttachment = {
  filename: string | null;
  mimeType: string;
  content: ArrayBuffer | Uint8Array | string;
};

/**
 * Why an attachment was not stored (the reasons of convex/intake.ts):
 * `unsupported_type` is any file that is not a PDF or a JPG, PNG or HEIC image.
 */
export type Skipped =
  | "unsupported_type"
  | "too_large"
  | "image_too_large"
  | "too_many_attachments"
  | "attachments_too_large";

export type Entry =
  | { key: string; filename: string; mimeType: string }
  | { filename: string; skipped: Skipped };

export type Plan = {
  token: string;
  from: string;
  subject: string;
  /** ISO date of the email, or "". */
  date: string;
  /** The text of the email; "" when it has none, or when it is over the limit. */
  body: string;
  /** The text was over MAX_EMAIL_BODY_BYTES and is not sent; Vink records the refusal. */
  bodyTooLarge: boolean;
  /** What to put in R2 before calling Vink, under `key`. */
  store: Array<{ key: string; bytes: Uint8Array; mimeType: string }>;
  entries: Entry[];
};

function bytesOf(content: ParsedAttachment["content"]) {
  if (typeof content === "string") return new TextEncoder().encode(content);
  return content instanceof Uint8Array ? content : new Uint8Array(content);
}

const IMAGE_BY_EXTENSION: Record<string, (typeof IMAGE_MIME_TYPES)[number]> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  heic: "image/heic",
  heif: "image/heif",
};

function isPdf(attachment: ParsedAttachment, bytes: Uint8Array) {
  const named = (attachment.filename ?? "").toLowerCase().endsWith(".pdf");
  const typed = attachment.mimeType.toLowerCase() === "application/pdf";
  // Some mailers send PDFs as application/octet-stream: trust the name then.
  return typed || (named && attachment.mimeType.toLowerCase() === "application/octet-stream") ||
    (named && bytes.length >= 4 && String.fromCharCode(...bytes.slice(0, 4)) === "%PDF");
}

/** The image type of an attachment, or null. Phones and mailers send `image/jpg`, or octet-stream with a name. */
function imageTypeOf(attachment: ParsedAttachment) {
  const mimeType = attachment.mimeType.toLowerCase() === "image/jpg" ? "image/jpeg" : attachment.mimeType.toLowerCase();
  const listed = IMAGE_MIME_TYPES.find((t) => t === mimeType);
  if (listed) return listed;
  if (mimeType !== "application/octet-stream") return null;
  const extension = (attachment.filename ?? "").toLowerCase().split(".").pop() ?? "";
  return IMAGE_BY_EXTENSION[extension] ?? null;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Plain text from an HTML body, for mail that has no text part. */
export function htmlToText(html: string) {
  return html
    .replace(/<(script|style|head)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
      if (entity[0] === "#") {
        const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
      }
      return ENTITIES[entity.toLowerCase()] ?? match;
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The Intake Address's token: the recipient's local part, lower-cased. */
export function tokenOf(to: string) {
  return to.split("@")[0].trim().toLowerCase();
}

/**
 * Maps one received email to the R2 objects to store and the request for
 * Vink's POST /intake/email. `newKey` names each stored attachment. The text is
 * the text/plain part, else the HTML part as text. A PDF or image is stored;
 * any other file type is listed as skipped. Vink decides the rest (which Form,
 * one Document or several): the same for an Organisation's address and a Form's.
 */
export function planEmail(
  input: {
    to: string;
    from: string;
    subject?: string | null;
    date?: string | null;
    text?: string | null;
    html?: string | null;
    attachments: ParsedAttachment[];
  },
  newKey: () => string,
): Plan {
  const store: Plan["store"] = [];
  const entries: Entry[] = [];
  let stored = 0;
  let storedBytes = 0;
  input.attachments.forEach((attachment, index) => {
    const bytes = bytesOf(attachment.content);
    const filename = attachment.filename?.trim() || `attachment-${index + 1}`;
    const kind = isPdf(attachment, bytes) ? "pdf" : imageTypeOf(attachment);
    if (kind === null) {
      entries.push({ filename, skipped: "unsupported_type" });
    } else if (stored >= MAX_EMAIL_ATTACHMENTS) {
      entries.push({ filename, skipped: "too_many_attachments" });
    } else if (bytes.length > (kind === "pdf" ? MAX_BYTES : MAX_IMAGE_BYTES)) {
      entries.push({ filename, skipped: kind === "pdf" ? "too_large" : "image_too_large" });
    } else if (storedBytes + bytes.length > MAX_EMAIL_ATTACHMENT_BYTES) {
      entries.push({ filename, skipped: "attachments_too_large" });
    } else {
      const key = newKey();
      const mimeType = kind === "pdf" ? "application/pdf" : kind;
      store.push({ key, bytes, mimeType });
      entries.push({ key, filename, mimeType });
      stored += 1;
      storedBytes += bytes.length;
    }
  });
  const text = input.text?.trim() ? input.text.trim() : htmlToText(input.html ?? "");
  const bodyTooLarge = new TextEncoder().encode(text).length > MAX_EMAIL_BODY_BYTES;
  return {
    token: tokenOf(input.to),
    from: input.from.trim().toLowerCase(),
    subject: input.subject?.trim() ?? "",
    date: input.date ?? "",
    body: bodyTooLarge ? "" : text,
    bodyTooLarge,
    store,
    entries,
  };
}

/** Whether the receiving server recorded a DMARC failure for this message. */
export function failsDmarc(authenticationResults: string | null) {
  return authenticationResults !== null && /\bdmarc=fail\b/i.test(authenticationResults);
}
