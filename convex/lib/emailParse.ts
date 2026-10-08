// A small reader for an email as a file (.eml, message/rfc822), for the ways in
// that take a whole message from a person or a program: the app's upload and
// the public API. Mail sent to an Intake Address is parsed by the Worker (with
// postal-mime) and never comes through here.
//
// It reads what Vink needs and nothing more: Subject, From, Date, the text (the
// text/plain part, else the HTML part as text) and the PDF and image
// attachments. It handles folded headers, RFC 2047 encoded words, multipart
// nesting, base64 and quoted-printable, and charsets. It does not validate the
// message. Free of Convex imports.
import { sniffFile } from "./sniff";

const MAX_DEPTH = 6;
// An email with more parts than this is not a letter; the rest is ignored.
const MAX_ENTITIES = 100;

/** The same size as the Worker's MAX_INLINE_ICON_BYTES (workers/intake-email/src/map.ts): a smaller inline image is a signature logo. */
const MAX_INLINE_ICON_BYTES = 50 * 1024;

export type ParsedEmail = {
  subject: string;
  from: string;
  /** ISO date, or "" when the Date header is missing or not a date. */
  date: string;
  /** The text of the email; "" when it has none. */
  body: string;
  /** Only the PDF and image attachments (by their bytes), without small inline images. */
  attachments: Array<{ filename: string; bytes: Uint8Array }>;
  /** Names of the attachments that are neither (a Word file, a signature card). Not read. */
  skipped: string[];
};

// --- bytes and text ---

/** One character per byte, so structure can be found with string functions without decoding anything. */
function binaryString(bytes: Uint8Array) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 8192) out += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return out;
}

function binaryBytes(text: string) {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 0xff;
  return bytes;
}

function decodeText(bytes: Uint8Array, charset: string | undefined) {
  try {
    return new TextDecoder(charset?.trim().toLowerCase() || "utf-8").decode(bytes);
  } catch {
    // A charset this runtime doesn't know: Latin-1 is right for most Western mail.
    return binaryString(bytes);
  }
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Plain text from an HTML body, for mail that has no text part. Same as the Worker's htmlToText. */
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

function decodeQuotedPrintable(text: string) {
  const joined = text.replace(/=\r?\n/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < joined.length; i++) {
    const hex = joined[i] === "=" ? joined.slice(i + 1, i + 3) : "";
    if (/^[0-9a-f]{2}$/i.test(hex)) {
      bytes.push(parseInt(hex, 16));
      i += 2;
    } else {
      bytes.push(joined.charCodeAt(i) & 0xff);
    }
  }
  return Uint8Array.from(bytes);
}

function decodeBase64(text: string) {
  try {
    return binaryBytes(atob(text.replace(/[^A-Za-z0-9+/]/g, "")));
  } catch {
    return new Uint8Array();
  }
}

function decodeBody(body: string, encoding: string) {
  switch (encoding.trim().toLowerCase()) {
    case "base64":
      return decodeBase64(body);
    case "quoted-printable":
      return decodeQuotedPrintable(body);
    default:
      return binaryBytes(body);
  }
}

// --- headers ---

type Headers = Map<string, string>;

function parseHeaders(head: string): Headers {
  const headers: Headers = new Map();
  for (const line of head.replace(/\r?\n[ \t]+/g, " ").split(/\r?\n/)) {
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    const name = line.slice(0, colon).trim().toLowerCase();
    // The first of a repeated header (Received, say) is the one that counts here.
    if (!headers.has(name)) headers.set(name, line.slice(colon + 1).trim());
  }
  return headers;
}

/** `text/plain; charset="utf-8"` as the main value and its parameters (names lower-case, quotes removed). */
function parseValue(value: string) {
  const pieces: string[] = [];
  let current = "";
  let quoted = false;
  for (const char of value) {
    if (char === '"') quoted = !quoted;
    if (char === ";" && !quoted) {
      pieces.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  pieces.push(current);
  const params: Record<string, string> = {};
  for (const piece of pieces.slice(1)) {
    const equals = piece.indexOf("=");
    if (equals <= 0) continue;
    params[piece.slice(0, equals).trim().toLowerCase()] = piece
      .slice(equals + 1)
      .trim()
      .replace(/^"|"$/g, "");
  }
  return { main: pieces[0].trim(), params };
}

/** RFC 2047 encoded words (`=?utf-8?B?…?=`) in a header, decoded. */
function decodeWords(value: string) {
  return value
    .replace(/(\?=)\s+(?==\?)/g, "$1")
    .replace(/=\?([^?\s]+)\?([bq])\?([^?]*)\?=/gi, (_, charset: string, kind: string, data: string) => {
      const bytes =
        kind.toLowerCase() === "b" ? decodeBase64(data) : decodeQuotedPrintable(data.replace(/_/g, " "));
      return decodeText(bytes, charset.split("*")[0]);
    });
}

/** A parameter's value, also from its RFC 2231 form `name*=utf-8''%E2%82%AC`. */
function parameter(params: Record<string, string>, name: string) {
  const extended = params[`${name}*`];
  if (extended !== undefined) {
    const match = extended.match(/^([^']*)'[^']*'(.*)$/);
    if (match) {
      const bytes = decodeQuotedPrintable(match[2].replace(/%/g, "="));
      return decodeText(bytes, match[1] || "utf-8");
    }
  }
  const plain = params[name];
  return plain === undefined ? undefined : decodeWords(plain);
}

// --- structure ---

/** The head and the body of a message or of one part. A part may have no headers: it then starts with a blank line. */
function splitEntity(raw: string) {
  const leading = raw.match(/^\r?\n/);
  if (leading) return { head: "", body: raw.slice(leading[0].length) };
  const blank = raw.match(/\r?\n\r?\n/);
  if (!blank || blank.index === undefined) return { head: raw, body: "" };
  return { head: raw.slice(0, blank.index), body: raw.slice(blank.index + blank[0].length) };
}

function multipartParts(body: string, boundary: string) {
  const escaped = boundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const delimiter = new RegExp(`(?:^|\\r?\\n)--${escaped}(--)?[ \\t]*(?=\\r?\\n|$)`, "g");
  const parts: string[] = [];
  let start = -1;
  for (let match = delimiter.exec(body); match !== null; match = delimiter.exec(body)) {
    if (start >= 0) parts.push(body.slice(start, match.index));
    if (match[1]) return parts;
    start = match.index + match[0].length;
    // The line break after the boundary line belongs to the boundary.
    start += body.slice(start).match(/^\r?\n/)?.[0].length ?? 0;
  }
  // A body that never closes its last part still has it.
  if (start >= 0) parts.push(body.slice(start));
  return parts;
}

type Collected = {
  text: string[];
  html: string[];
  files: Array<{ filename: string | null; bytes: Uint8Array; inline: boolean; image: boolean }>;
  entities: number;
};

function walk(raw: string, depth: number, collected: Collected) {
  if (collected.entities++ >= MAX_ENTITIES) return;
  const { head, body } = splitEntity(raw);
  const headers = parseHeaders(head);
  const type = parseValue(headers.get("content-type") ?? "text/plain");
  const mime = type.main.toLowerCase();
  if (mime.startsWith("multipart/") && type.params.boundary && depth < MAX_DEPTH) {
    for (const part of multipartParts(body, type.params.boundary)) walk(part, depth + 1, collected);
    return;
  }
  const disposition = parseValue(headers.get("content-disposition") ?? "");
  const filename = parameter(disposition.params, "filename") ?? parameter(type.params, "name") ?? null;
  const bytes = decodeBody(body, headers.get("content-transfer-encoding") ?? "7bit");
  const isAttachment = disposition.main.toLowerCase() === "attachment";
  if (!isAttachment && (mime === "text/plain" || mime === "text/html")) {
    const text = decodeText(bytes, type.params.charset);
    (mime === "text/html" ? collected.html : collected.text).push(text);
    return;
  }
  collected.files.push({
    filename,
    bytes,
    inline: disposition.main.toLowerCase() === "inline" || headers.has("content-id"),
    image: mime.startsWith("image/"),
  });
}

/** Reads an email file. Never throws: a message that is not one gives an empty email. */
export function parseEml(bytes: Uint8Array): ParsedEmail {
  const raw = binaryString(bytes);
  const collected: Collected = { text: [], html: [], files: [], entities: 0 };
  walk(raw, 0, collected);
  const headers = parseHeaders(splitEntity(raw).head);
  const date = new Date(headers.get("date") ?? "");
  const attachments: ParsedEmail["attachments"] = [];
  const skipped: string[] = [];
  collected.files.forEach((file, index) => {
    const filename = file.filename?.split(/[\\/]/).pop()?.trim().slice(0, 255) || `attachment-${index + 1}`;
    // A small inline image is a signature logo or icon, as in the Worker.
    if (file.image && file.inline && file.bytes.length < MAX_INLINE_ICON_BYTES) return;
    if (sniffFile(file.bytes) === null) skipped.push(filename);
    else attachments.push({ filename, bytes: file.bytes });
  });
  const text = collected.text.join("\n\n").replace(/\r\n/g, "\n").trim();
  return {
    subject: decodeWords(headers.get("subject") ?? "").trim(),
    from: decodeWords(headers.get("from") ?? "").trim(),
    date: Number.isNaN(date.getTime()) ? "" : date.toISOString(),
    body: text !== "" ? text : htmlToText(collected.html.join("\n")),
    attachments,
    skipped,
  };
}

/**
 * Whether the bytes look like an email file: a header block at the start, with
 * a header only an email has. Not a proof (parseEml is lenient); it keeps a
 * random text file from becoming an email Document.
 */
export function looksLikeEmail(bytes: Uint8Array) {
  const head = binaryString(bytes.subarray(0, 4096));
  if (head.includes("\0")) return false;
  const headers = parseHeaders(splitEntity(head).head);
  return headers.has("from") || headers.has("subject") || headers.has("message-id") || headers.has("received");
}
