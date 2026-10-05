// @vitest-environment node
// Read thinks at MEDIUM on a digital PDF and at HIGH when any page may be a
// scan, which is where handwriting comes from (ticket 40).
import { PDFDocument, StandardFonts, TextRenderingMode, setTextRenderingMode } from "pdf-lib";
import { afterEach, expect, test, vi } from "vitest";
import { readThinking } from "./readThinking";

// A 1×1 grey PNG, drawn at whatever size a page needs.
const PNG = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWOYOXMmAAOaAcxaeEmsAAAAAElFTkSuQmCC"),
  (c) => c.charCodeAt(0),
);

const A4 = [595, 842] as const;

/** A page's content; `ocr` is a scan's text layer, written either way OCR tools write it. */
type Page = { text?: string; image?: "page" | "logo"; ocr?: "invisible" | "under-image" };

const OCR_TEXT = "Naam klant Heisterkamp, km-stand 229546";

async function pdfOf(pages: Page[]) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const png = await doc.embedPng(PNG);
  const lines = (text: string) => Array.from({ length: 40 }, (_, i) => `${text} ${i + 1}`);
  for (const content of pages) {
    const page = doc.addPage([...A4]);
    const write = (text: string) =>
      lines(text).forEach((line, i) => page.drawText(line, { x: 40, y: 720 - i * 16, size: 11, font }));
    if (content.ocr === "under-image") write(OCR_TEXT);
    if (content.image === "page") page.drawImage(png, { x: 0, y: 0, width: A4[0], height: A4[1] });
    if (content.image === "logo") page.drawImage(png, { x: 40, y: 760, width: 180, height: 60 });
    if (content.text) write(content.text);
    if (content.ocr === "invisible") {
      page.pushOperators(setTextRenderingMode(TextRenderingMode.Invisible));
      write(OCR_TEXT);
    }
  }
  return new Uint8Array(await doc.save());
}

const DIGITAL: Page = { text: "Invoice line: tyre change, 1 piece, EUR 263.50" };
const SCAN: Page = { image: "page" };

afterEach(() => {
  vi.unstubAllEnvs();
});

test("a digital PDF is read at MEDIUM", async () => {
  expect(await readThinking(await pdfOf([DIGITAL, DIGITAL]))).toEqual({ level: "MEDIUM", scannedPages: [] });
});

test("a digital page with a logo is still digital", async () => {
  expect(await readThinking(await pdfOf([{ ...DIGITAL, image: "logo" }]))).toEqual({
    level: "MEDIUM",
    scannedPages: [],
  });
});

test("a scanned PDF is read at HIGH", async () => {
  expect(await readThinking(await pdfOf([SCAN, SCAN]))).toEqual({ level: "HIGH", scannedPages: [1, 2] });
});

test("one scanned page in a digital PDF makes it HIGH", async () => {
  expect(await readThinking(await pdfOf([DIGITAL, SCAN, DIGITAL]))).toEqual({
    level: "HIGH",
    scannedPages: [2],
  });
});

test("a scan with an invisible OCR text layer is still a scan", async () => {
  expect(await readThinking(await pdfOf([{ image: "page", ocr: "invisible" }]))).toEqual({
    level: "HIGH",
    scannedPages: [1],
  });
});

// pdf-inspector reads text under a page-sized image as a text layer
// (2026-10-05), so the image covering the page decides.
test("a scan with its OCR text under the image is still a scan", async () => {
  expect(await readThinking(await pdfOf([{ image: "page", ocr: "under-image" }]))).toEqual({
    level: "HIGH",
    scannedPages: [1],
  });
});

test("READER_THINKING overrides the rule", async () => {
  vi.stubEnv("READER_THINKING", "LOW");

  expect(await readThinking(await pdfOf([SCAN]))).toEqual({ level: "LOW", scannedPages: [1] });
});
