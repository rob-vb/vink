// The Worker's only logic: which attachments to store and what to tell Vink.
// Kept free of Cloudflare and MIME-parser imports so it can be tested alone.

/**
 * The largest PDF attachment Vink takes: 10 MB, as on every way in. A copy of
 * MAX_PDF_BYTES in convex/lib/pdfLimits.ts (this package can't import it);
 * change both together.
 */
export const MAX_BYTES = 10 * 1024 * 1024;

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

export type Entry =
  | { key: string; filename: string }
  | { filename: string; skipped: "not_pdf" | "too_large" };

export type Plan = {
  token: string;
  from: string;
  /** What to put in R2 before calling Vink, under `key`. */
  store: Array<{ key: string; bytes: Uint8Array }>;
  entries: Entry[];
};

function bytesOf(content: ParsedAttachment["content"]) {
  if (typeof content === "string") return new TextEncoder().encode(content);
  return content instanceof Uint8Array ? content : new Uint8Array(content);
}

function isPdf(attachment: ParsedAttachment, bytes: Uint8Array) {
  const named = (attachment.filename ?? "").toLowerCase().endsWith(".pdf");
  const typed = attachment.mimeType.toLowerCase() === "application/pdf";
  // Some mailers send PDFs as application/octet-stream: trust the name then.
  return typed || (named && attachment.mimeType.toLowerCase() === "application/octet-stream") ||
    (named && bytes.length >= 4 && String.fromCharCode(...bytes.slice(0, 4)) === "%PDF");
}

/** The Intake Address's token: the recipient's local part, lower-cased. */
export function tokenOf(to: string) {
  return to.split("@")[0].trim().toLowerCase();
}

/**
 * Maps one received email to the R2 objects to store and the request for
 * Vink's POST /intake/email. `newKey` names each stored PDF.
 */
export function planEmail(
  input: { to: string; from: string; attachments: ParsedAttachment[] },
  newKey: () => string,
): Plan {
  const store: Plan["store"] = [];
  const entries: Entry[] = [];
  input.attachments.forEach((attachment, index) => {
    const bytes = bytesOf(attachment.content);
    const filename = attachment.filename?.trim() || `attachment-${index + 1}`;
    if (!isPdf(attachment, bytes)) {
      entries.push({ filename, skipped: "not_pdf" });
    } else if (bytes.length > MAX_BYTES) {
      entries.push({ filename, skipped: "too_large" });
    } else {
      const key = newKey();
      store.push({ key, bytes });
      entries.push({ key, filename });
    }
  });
  return { token: tokenOf(input.to), from: input.from.trim().toLowerCase(), store, entries };
}

/** Whether the receiving server recorded a DMARC failure for this message. */
export function failsDmarc(authenticationResults: string | null) {
  return authenticationResults !== null && /\bdmarc=fail\b/i.test(authenticationResults);
}
