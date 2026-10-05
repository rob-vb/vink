// Renders a PDF's pages to JPEG for a model that sees them (Clef spike). Uses
// poppler's pdftoppm, which the VPS has; the Convex pipeline doesn't render.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PageImage } from "../../convex/lib/systemOne";

// Workers AI counts an image's base64 text against Clef's 64k window before it
// runs (see systemOne.fitsClef), so a page must stay under about 150 KB. Each
// page gets the first of these that keeps it there: grey, 100 dpi, then less.
const MAX_BYTES = 150_000;
const SETTINGS = [
  { dpi: 100, quality: 70 },
  { dpi: 100, quality: 50 },
  { dpi: 75, quality: 50 },
];

function render(dir: string, { dpi, quality }: (typeof SETTINGS)[number], page?: number) {
  for (const name of readdirSync(dir)) if (name.endsWith(".jpg")) rmSync(join(dir, name));
  const only = page ? ["-f", String(page), "-l", String(page)] : [];
  execFileSync(
    "pdftoppm",
    ["-jpeg", "-gray", "-jpegopt", `quality=${quality}`, "-r", String(dpi), ...only, "document.pdf", "page"],
    { cwd: dir },
  );
  return readdirSync(dir).flatMap((name) => {
    const number = name.match(/^page-(\d+)\.jpg$/)?.[1];
    return number ? [{ page: Number(number), jpeg: new Uint8Array(readFileSync(join(dir, name))) }] : [];
  });
}

export function renderPages(pdf: Uint8Array): PageImage[] {
  const dir = mkdtempSync(join(tmpdir(), "vink-pages-"));
  try {
    writeFileSync(join(dir, "document.pdf"), pdf);
    return render(dir, SETTINGS[0])
      .map((image) => {
        for (const setting of SETTINGS.slice(1)) {
          if (image.jpeg.length <= MAX_BYTES) break;
          image = render(dir, setting, image.page)[0];
        }
        return image;
      })
      .sort((a, b) => a.page - b.page);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
