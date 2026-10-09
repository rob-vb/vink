"use node";
// Read (ADR 0003, ADR 0010): the vision model reads a Submission into a Reading.
// The Reader is picked by the Submission's kind, never by a model:
//   pdf   the PDF, which it sees as page images, plus pdf-inspector's per-page markdown
//   image the image alone: no text layer, so Verify checks no value against the text
//   email subject, sender, date and body as text (page 1), its attachments as
//         extra parts; the pages of a PDF attachment follow page 1 in order
import { extractPagesMarkdown } from "@firecrawl/pdf-inspector";
import { IMAGE_MIME_TYPES, PDF_MIME_TYPE } from "./inputLimits";
import { complete, models, parseJsonObject } from "./models";
import { filesOf, type PageText, type Reader, type ReaderInput, type Reading } from "./pipeline";
import { readThinking, thinkingFor } from "./readThinking";

const ASK = "Describe everything this Submission says as one clean JSON object, so that a program can pick any fact out of it.";

const PDF_SUBMISSION =
  "The Submission is a PDF that may bundle several papers about the same job (an invoice, a work order, handwritten forms). You get the page images and the text layer per page (when a page has one).";

const IMAGE_SUBMISSION =
  "The Submission is a photo or scan of one paper or of a few papers about the same job (an invoice, a work order, a handwritten form, a note). You get the image, which is page 1; it has no text layer, so read the image itself. Handwriting is common: read it carefully.";

const EMAIL_SUBMISSION =
  "The Submission is one email. You get its sender, date, subject and body as text (page 1), and its attachments (PDFs and photos) as files, after the text; the page list below says which pages are the email and which are each attachment's. Describe what the email is about (e.g. a complaint, an order, a question) and what each attachment adds to it, as facts about the same real-world things.";

const RULES = `- **Model the real world, not the paper.** One object per real thing: the supplier, the customer, each delivery, each invoice line, the totals. When several papers record the same thing, write it once and merge what they say. Keep conflicting readings side by side (e.g. \`"quantity": "6"\` and \`"quantityAlt": "8"\`, or a \`conflicts\` note), never pick silently.
- **The papers in the bundle** go in \`papers\`, one object each with its type and its own numbers and dates; the leading paper (the invoice, or else the reservation or work order the others belong to) first.
- **Handwriting next to print.** When a handwritten value is also printed elsewhere in the bundle (the part that was fitted and its invoice line, an order number on the delivery note), it is one thing: read the handwriting in the light of the print, write the printed value, and keep the handwritten one beside it (\`name\` and \`nameAsHandwritten\`) when they differ. When two papers show the same value differently, keep both (\`serial\` and \`serialAlt\`).
- **Arrays of objects** for anything that repeats (deliveries, line items). Only put something in an array of events if it actually happened: a meter reading taken on a part that wasn't replaced is a measurement, not a replacement.
- **Your own keys**, descriptive and in English (\`invoiceNumber\`, \`fitted.serial\`, \`removed.meterReading\`). Values as written on the Submission (no reformatting), except that you may split a combined text into parts.
- **Keys that say what the value is on their own**, without needing their neighbours: \`taxableAmount\`, \`vatAmount\` and \`totalInclVat\` in a VAT breakdown, never a bare \`amount\` or \`total\`; numbers and dates by their kind (\`invoiceNumber\`, \`reservationNumber\`, \`workOrderNumber\`, \`invoiceDate\`), never a bare \`number\`, \`submissionNumber\` or \`date\`.
- **Name a value by what the Submission says it is.** An address belongs to whoever it is printed for (\`supplier.address\`, \`customer.address\`); write where the work was done only when the Submission says so (e.g. "Werkadres", "Location of service").
- Add \`"_pages": [..]\` to every object: the pages its facts came from.
- Skip running prose (terms and conditions, email boilerplate).
- Never guess what you can't read; write what you see and add \`"_unsure": ["key", …]\` to that object.

Answer with the JSON object only.`;

const promptOf = (submission: string) => `${ASK} ${submission}\n\n${RULES}`;

// The PDF prompt is the one benchmarked in tickets 26-40: keep its words.
const PROMPTS = {
  pdf: promptOf(PDF_SUBMISSION),
  image: promptOf(IMAGE_SUBMISSION),
  email: promptOf(EMAIL_SUBMISSION),
};

/** The markdown of every page that has a text layer (a scan has none), and the page count. */
function textLayerOf(pdf: Uint8Array) {
  const { pages } = extractPagesMarkdown(Buffer.from(pdf));
  const textLayer = pages.flatMap((page): PageText[] => {
    const text = page.needsOcr ? "" : page.markdown.trim();
    return text ? [{ page: page.page + 1, text }] : [];
  });
  return { textLayer, pageCount: pages.length };
}

const NO_TEXT_LAYER = "(no text layer: read the image)";

/** The page list as the vision model gets it: every page by its title, scans noted. */
function describe(pages: Array<{ title: string; text: string | null }>) {
  return pages.map(({ title, text }) => `## ${title}\n\n${text ?? NO_TEXT_LAYER}`).join("\n\n");
}

/** One call to the vision model: the files, the page list, then the prompt. */
async function readWith(
  input: ReaderInput,
  pages: Array<{ title: string; text: string | null }>,
  thinking: ReturnType<typeof thinkingFor>,
) {
  const answer = await complete({
    model: models.reader,
    files: filesOf(input),
    maxTokens: 64000,
    thinking,
    texts: [`# Text layer\n\n${describe(pages)}`, PROMPTS[input.kind]],
  });
  return parseJsonObject(answer) as Reading;
}

async function readPdf(input: Extract<ReaderInput, { kind: "pdf" }>) {
  const { textLayer, pageCount } = textLayerOf(input.bytes);
  const { level, scannedPages } = await readThinking(input.bytes);
  // In the deployment's logs, so a Read's cost can be traced to its level.
  console.log(`Read at ${level}; scanned pages: ${scannedPages.join(", ") || "none"}`);
  const pages = Array.from({ length: pageCount }, (_, i) => ({
    title: `Page ${i + 1}`,
    text: textLayer.find((p) => p.page === i + 1)?.text ?? null,
  }));
  return { reading: await readWith(input, pages, level), textLayer };
}

/** A photo has no text layer, and may hold handwriting: it is read at HIGH. */
async function readImage(input: Extract<ReaderInput, { kind: "image" }>) {
  if (!(IMAGE_MIME_TYPES as readonly string[]).includes(input.mimeType)) {
    throw new Error(`Not an image type that can be read: ${input.mimeType}`);
  }
  const level = thinkingFor(true);
  console.log(`Read an image at ${level}`);
  const reading = await readWith(input, [{ title: "Page 1", text: null }], level);
  return { reading, textLayer: [] };
}

/** The email as the text of its page 1. */
function emailText({ subject, from, date, body }: Extract<ReaderInput, { kind: "email" }>) {
  return `Subject: ${subject}\nFrom: ${from}\nDate: ${date}\n\n${body.trim() || "(no text in the body)"}`;
}

/**
 * Page 1 is the email (headers and body); then, per attachment in order, a
 * PDF's pages with their own text layer, or an image as one page without one.
 * Verify checks a value against the pages its Reading object came from.
 */
async function readEmail(input: Extract<ReaderInput, { kind: "email" }>) {
  const pages: Array<{ title: string; text: string | null }> = [
    { title: "Page 1 (the email)", text: emailText(input) },
  ];
  let handwritingPossible = false;
  for (const { filename, mimeType, bytes } of input.attachments) {
    if (mimeType === PDF_MIME_TYPE) {
      const { textLayer, pageCount } = textLayerOf(bytes);
      handwritingPossible ||= (await readThinking(bytes)).scannedPages.length > 0;
      for (let i = 0; i < pageCount; i++) {
        pages.push({
          title: `Page ${pages.length + 1} (attachment "${filename}", page ${i + 1})`,
          text: textLayer.find((p) => p.page === i + 1)?.text ?? null,
        });
      }
    } else if ((IMAGE_MIME_TYPES as readonly string[]).includes(mimeType)) {
      handwritingPossible = true;
      pages.push({ title: `Page ${pages.length + 1} (attachment "${filename}", image)`, text: null });
    } else {
      throw new Error(`An attachment of type ${mimeType} can't be read: ${filename}`);
    }
  }
  const level = thinkingFor(handwritingPossible);
  console.log(`Read an email at ${level}; ${input.attachments.length} attachment(s)`);
  const reading = await readWith(input, pages, level);
  const textLayer = pages.flatMap((p, i): PageText[] => (p.text ? [{ page: i + 1, text: p.text }] : []));
  return { reading, textLayer };
}

export const reader: Reader = {
  async read(input) {
    switch (input.kind) {
      case "pdf":
        return await readPdf(input);
      case "image":
        return await readImage(input);
      case "email":
        return await readEmail(input);
    }
  },
};
