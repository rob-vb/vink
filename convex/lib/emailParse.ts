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

/**
 * The most HTML read for the text. Mail with more is not a letter; the rest is
 * ignored, which also bounds the work on mail from anyone.
 */
const MAX_HTML_CHARS = 256 * 1024;

/** `<script>`, `<style>` and `<head>` blocks removed, by scanning (no backtracking regex, so linear). */
function withoutBlocks(html: string) {
  const lower = html.toLowerCase();
  const names = ["script", "style", "head"];
  const next = new Map<string, number>();
  const open = (name: string, from: number) => {
    let at = lower.indexOf(`<${name}`, from);
    // `<header>` is not `<head>`: the name must end there.
    while (at >= 0 && /[a-z0-9_]/.test(lower[at + name.length + 1] ?? "")) at = lower.indexOf(`<${name}`, at + 1);
    return at;
  };
  let out = "";
  let at = 0;
  for (;;) {
    let first = -1;
    let which = "";
    for (const name of names) {
      let found = next.get(name);
      if (found === undefined || (found >= 0 && found < at)) found = open(name, at);
      next.set(name, found);
      if (found >= 0 && (first < 0 || found < first)) {
        first = found;
        which = name;
      }
    }
    if (first < 0) break;
    const tagEnd = lower.indexOf(">", first);
    const close = tagEnd < 0 ? -1 : lower.indexOf(`</${which}>`, tagEnd);
    if (close < 0) {
      // No end: this name has no block to remove from here on, so the scan skips it.
      next.set(which, -1);
      if (names.every((name) => next.get(name) === -1)) break;
      continue;
    }
    out += html.slice(at, first);
    at = close + which.length + 3;
  }
  return out + html.slice(at);
}

/** A line without its trailing spaces and tabs, by scanning (a regex would be quadratic on a long run of spaces). */
function trimLineEnd(line: string) {
  let end = line.length;
  while (end > 0 && (line[end - 1] === " " || line[end - 1] === "\t")) end--;
  return line.slice(0, end);
}

/** Plain text from an HTML body, for mail that has no text part. Same as the Worker's htmlToText. */
export function htmlToText(html: string) {
  return withoutBlocks(html.slice(0, MAX_HTML_CHARS))
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<[^<>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
      if (entity[0] === "#") {
        const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
      }
      return ENTITIES[entity.toLowerCase()] ?? match;
    })
    .split("\n")
    .map(trimLineEnd)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function hexValue(code: number) {
  if (code >= 48 && code <= 57) return code - 48;
  if (code >= 65 && code <= 70) return code - 55;
  if (code >= 97 && code <= 102) return code - 87;
  return -1;
}

/** Bytes from text where `marker` followed by two hex digits is one byte and every other character is one byte. Never longer than the text. */
function decodeEscapes(text: string, marker: "=" | "%") {
  const bytes = new Uint8Array(text.length);
  let length = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (text[i] === marker) {
      const high = hexValue(text.charCodeAt(i + 1));
      const low = hexValue(text.charCodeAt(i + 2));
      if (high >= 0 && low >= 0) {
        bytes[length++] = high * 16 + low;
        i += 2;
        continue;
      }
    }
    bytes[length++] = code & 0xff;
  }
  return bytes.slice(0, length);
}

function decodeQuotedPrintable(text: string) {
  return decodeEscapes(text.replace(/=\r?\n/g, ""), "=");
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

/**
 * A parameter's value, also from its RFC 2231 forms: `name*=utf-8''%E2%82%AC`
 * and the continued `name*0*=utf-8''%E2%82; name*1*=%AC` (a piece without the
 * last `*` is plain text), which mailers use for a long or non-ASCII file name.
 */
function parameter(params: Record<string, string>, name: string) {
  const extended = params[`${name}*`];
  if (extended !== undefined) {
    const match = extended.match(/^([^']*)'[^']*'(.*)$/);
    if (match) return decodeText(decodeEscapes(match[2], "%"), match[1] || "utf-8");
  }
  const pieces: Array<{ index: number; value: string; encoded: boolean }> = [];
  for (const key of Object.keys(params)) {
    const piece = key.startsWith(`${name}*`) ? key.slice(name.length + 1).match(/^(\d{1,3})(\*?)$/) : null;
    if (piece) pieces.push({ index: Number(piece[1]), value: params[key], encoded: piece[2] === "*" });
  }
  if (pieces.length > 0) {
    pieces.sort((a, b) => a.index - b.index);
    const first = pieces[0].encoded ? pieces[0].value.match(/^([^']*)'[^']*'(.*)$/) : null;
    const charset = first?.[1] || "utf-8";
    const chunks: Uint8Array[] = [];
    for (const [i, piece] of pieces.entries()) {
      const value = i === 0 && first ? first[2] : piece.value;
      chunks.push(piece.encoded ? decodeEscapes(value, "%") : new TextEncoder().encode(value));
    }
    const all = new Uint8Array(chunks.reduce((sum, c) => sum + c.length, 0));
    let at = 0;
    for (const chunk of chunks) {
      all.set(chunk, at);
      at += chunk.length;
    }
    return decodeText(all, charset);
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
