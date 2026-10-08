// What a file really is, from its first bytes. Every way in that takes a file
// (app upload, public API) decides the kind by this and never by the client's
// Content-Type or file name alone: a client may be wrong, or lie.
// Free of Convex imports; the app may import it.
import { PDF_MIME_TYPE } from "./inputLimits";

export type Sniffed = { kind: "pdf"; mimeType: "application/pdf" } | { kind: "image"; mimeType: "image/jpeg" | "image/png" | "image/heic" };

const startsWith = (bytes: Uint8Array, signature: number[], at = 0) =>
  bytes.length >= at + signature.length && signature.every((byte, i) => bytes[at + i] === byte);

const ascii = (bytes: Uint8Array, from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));

// The `ftyp` major brands of a HEIC/HEIF image: what iPhones write (`heic`), the
// other HEVC ones, and the generic HEIF ones (`mif1`, `msf1`, `heif`). AVIF has
// its own brand (`avif`) and is not in the list.
const HEIC_BRANDS = ["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1", "heif"];

/** PDF `%PDF-`, JPEG `FF D8 FF`, PNG `89 50 4E 47 0D 0A 1A 0A`, HEIC an `ftyp` box with a HEIF brand; else null. */
export function sniffFile(bytes: Uint8Array): Sniffed | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return { kind: "pdf", mimeType: PDF_MIME_TYPE };
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { kind: "image", mimeType: "image/jpeg" };
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { kind: "image", mimeType: "image/png" };
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === "ftyp" && HEIC_BRANDS.includes(ascii(bytes, 8, 12))) {
    return { kind: "image", mimeType: "image/heic" };
  }
  return null;
}

/** A Content-Type without its parameters, lower-case, with the common aliases folded: `image/jpg` is `image/jpeg`, `image/heif` is `image/heic`. */
export function normalizeType(declared: string) {
  const type = declared.split(";")[0].trim().toLowerCase();
  if (type === "image/jpg" || type === "image/pjpeg") return "image/jpeg";
  if (type === "image/heif") return "image/heic";
  return type;
}

// The types that name one kind of file. Any other declared type (octet-stream,
// text/plain, nothing) says nothing about the file, and the bytes decide.
const SPECIFIC_TYPES = new Set([PDF_MIME_TYPE, "image/jpeg", "image/png", "image/heic"]);

/**
 * Whether the declared Content-Type contradicts the bytes: it names a PDF or an
 * image type and the bytes are something else (PNG bytes sent as application/pdf).
 * A declared type that names no file type never contradicts.
 */
export function contradicts(declared: string | null, sniffed: Sniffed) {
  if (declared === null) return false;
  const type = normalizeType(declared);
  return SPECIFIC_TYPES.has(type) && type !== sniffed.mimeType;
}

/** The extension a file of this type gets when the client sent no name. */
export const EXTENSION_OF: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/heic": "heic",
};
