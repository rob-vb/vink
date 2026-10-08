import { expect, test } from "vitest";
import { contradicts, normalizeType, sniffFile } from "./sniff";

const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));
const ftyp = (brand: string) => new Uint8Array([0, 0, 0, 24, ...ascii("ftyp"), ...ascii(brand), 0, 0, 0, 0]);

test("finds each kind from its first bytes", () => {
  expect(sniffFile(new Uint8Array(ascii("%PDF-1.7\n")))).toEqual({ kind: "pdf", mimeType: "application/pdf" });
  expect(sniffFile(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 0]))).toEqual({ kind: "image", mimeType: "image/jpeg" });
  expect(sniffFile(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toEqual({
    kind: "image",
    mimeType: "image/png",
  });
  for (const brand of ["heic", "heix", "mif1", "heif"]) {
    expect(sniffFile(ftyp(brand)), brand).toEqual({ kind: "image", mimeType: "image/heic" });
  }
});

test("knows nothing else: text, other ftyp brands, truncated signatures and an empty file", () => {
  expect(sniffFile(new TextEncoder().encode("Subject: hello"))).toBeNull();
  // AVIF and MP4 are `ftyp` files too, but not HEIC.
  expect(sniffFile(ftyp("avif"))).toBeNull();
  expect(sniffFile(ftyp("isom"))).toBeNull();
  expect(sniffFile(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
  expect(sniffFile(new Uint8Array([0xff, 0xd8]))).toBeNull();
  expect(sniffFile(new Uint8Array())).toBeNull();
});

test("a declared type contradicts the bytes only when it names another PDF or image type", () => {
  const png = { kind: "image", mimeType: "image/png" } as const;
  expect(contradicts("application/pdf", png)).toBe(true);
  expect(contradicts("image/jpeg", png)).toBe(true);
  expect(contradicts("image/png; charset=binary", png)).toBe(false);
  // Types that say nothing about the file never contradict.
  expect(contradicts("application/octet-stream", png)).toBe(false);
  expect(contradicts("text/plain", png)).toBe(false);
  expect(contradicts(null, png)).toBe(false);
  // Aliases of one type are the same type.
  expect(contradicts("image/jpg", { kind: "image", mimeType: "image/jpeg" })).toBe(false);
  expect(contradicts("image/heif", { kind: "image", mimeType: "image/heic" })).toBe(false);
  expect(normalizeType("IMAGE/JPG; q=1")).toBe("image/jpeg");
});
