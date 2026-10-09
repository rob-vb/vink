"use node";
// How hard Read thinks (ticket 40). HIGH reads handwriting right; MEDIUM costs
// about half and is 3–7× faster, but misread a handwritten digit that Jev
// can't catch (ticket 39). Handwriting only comes on scanned pages, so a PDF
// is read at MEDIUM only when none of its pages is one.
import { extractPagesMarkdown, extractTextWithPositions } from "@firecrawl/pdf-inspector";
import { ThinkingLevel } from "@google/genai";
import { PDFDocument } from "pdf-lib";

// A page this much covered by images is a scan, whatever its text layer says:
// pdf-inspector reads a scan with a full OCR text layer as text (2026-10-05).
// A logo or a letterhead strip covers far less.
const SCAN_COVERAGE = 0.5;

/** The 1-indexed pages that are, or may be, scanned. */
async function scannedPagesOf(pdf: Uint8Array) {
  const buffer = Buffer.from(pdf);
  const { pages } = extractPagesMarkdown(buffer);
  const imageArea = new Map<number, number>();
  for (const item of extractTextWithPositions(buffer)) {
    if (item.itemType === "Image") {
      imageArea.set(item.page, (imageArea.get(item.page) ?? 0) + item.width * item.height);
    }
  }
  const sizes = (await PDFDocument.load(pdf, { ignoreEncryption: true }))
    .getPages()
    .map((page) => page.getCropBox());
  return pages
    .map((page) => page.page + 1)
    .filter((number, i) => {
      const { width, height } = sizes[i];
      return pages[i].needsOcr || (imageArea.get(number) ?? 0) / (width * height) >= SCAN_COVERAGE;
    });
}

/**
 * Read's thinking level: HIGH when handwriting may be in the input (a scanned
 * page, a photo), else MEDIUM. READER_THINKING, when set, overrides the rule
 * (for benchmarks).
 */
export function thinkingFor(handwritingPossible: boolean) {
  const override = process.env.READER_THINKING as ThinkingLevel | undefined;
  return override ?? (handwritingPossible ? ThinkingLevel.HIGH : ThinkingLevel.MEDIUM);
}

/** Read's thinking level for a PDF, and the pages that made it HIGH. */
export async function readThinking(pdf: Uint8Array) {
  const scannedPages = await scannedPagesOf(pdf);
  return { level: thinkingFor(scannedPages.length > 0), scannedPages };
}
