// Pure helpers of the review screen's source panes (no React), so they can be
// tested on their own. Shared by the app and the marketing demo.

export type PaneKind = "pdf" | "email" | "image";

/** Which pane shows a Document: by its kind. A Document from before kinds (no kind) is a PDF. */
export function paneFor(kind: string | null | undefined): PaneKind {
  return kind === "email" || kind === "image" ? kind : "pdf";
}

/** The file types a browser cannot draw in an `<img>` (Safari can, so the pane tries first). */
export function isHeic(mimeType: string): boolean {
  return /^image\/(heic|heif)$/i.test(mimeType);
}

/** An email attachment as the review screen lists it. */
export type AttachmentInfo = { filename: string; mimeType: string; pageCount?: number };

/** What an attachment is, by its MIME type: only PDFs and images are ever stored. */
export function attachmentKind(attachment: Pick<AttachmentInfo, "mimeType">): "pdf" | "image" {
  return attachment.mimeType === "application/pdf" ? "pdf" : "image";
}

/** How many of an email's pages an attachment covers: a PDF its pages, an image one. */
export function pagesOf(attachment: AttachmentInfo): number {
  return attachmentKind(attachment) === "pdf" ? Math.max(1, attachment.pageCount ?? 1) : 1;
}

/**
 * An email's pages are numbered as the Reader numbers them: page 1 is the
 * headers and body, and the pages of the attachments follow in order. This says
 * what a page number points at. A page past the last one points at the last page.
 */
export type Located = { part: "body" } | { part: "attachment"; index: number; page: number };

export function locatePage(attachments: AttachmentInfo[], page: number): Located {
  if (page <= 1 || attachments.length === 0) return { part: "body" };
  let first = 2;
  for (const [index, attachment] of attachments.entries()) {
    const count = pagesOf(attachment);
    if (page < first + count || index === attachments.length - 1) {
      return { part: "attachment", index, page: Math.min(page - first + 1, count) };
    }
    first += count;
  }
  return { part: "body" };
}

/** The email page on which an attachment starts (the inverse of `locatePage`). */
export function firstPageOf(attachments: AttachmentInfo[], index: number): number {
  return 2 + attachments.slice(0, index).reduce((sum, a) => sum + pagesOf(a), 0);
}

/** The pages of the whole email: the body, then every attachment's. */
export function emailPageCount(attachments: AttachmentInfo[]): number {
  return 1 + attachments.reduce((sum, a) => sum + pagesOf(a), 0);
}

export type Segment = { text: string; mark: boolean };

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Where the text a value was read from sits in the email body: the first
 * occurrence, ignoring case and any difference in whitespace (a line break in
 * the mail is a space in the Reading). `null` when it is not there, e.g. the
 * Reading cleaned it up or it came from an attachment.
 */
export function findSource(body: string, readText: string | null | undefined): { start: number; end: number } | null {
  const words = (readText ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const match = new RegExp(words.map(escapeRegExp).join("\\s+"), "i").exec(body);
  return match === null ? null : { start: match.index, end: match.index + match[0].length };
}

/** The body in plain and marked pieces, in order; the pieces add up to the body. */
export function highlightSegments(body: string, readText: string | null | undefined): Segment[] {
  const range = findSource(body, readText);
  if (range === null) return [{ text: body, mark: false }];
  return [
    { text: body.slice(0, range.start), mark: false },
    { text: body.slice(range.start, range.end), mark: true },
    { text: body.slice(range.end), mark: false },
  ].filter((segment) => segment.text !== "");
}
