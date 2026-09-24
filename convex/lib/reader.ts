"use node";
// Read (ADR 0003): the vision model gets the PDF, which it sees as page
// images, plus pdf-inspector's per-page markdown, and writes the Reading.
import { extractPagesMarkdown } from "@firecrawl/pdf-inspector";
import { models, parseJsonObject, textOf, vertex } from "./models";
import type { PageText, Reader, Reading } from "./pipeline";
import { usage } from "./usage";

const PROMPT = `Describe everything this Document says as one clean JSON object, so that a program can pick any fact out of it. The Document is a PDF that may bundle several papers about the same job (an invoice, a work order, handwritten forms). You get the page images and the text layer per page (when a page has one).

- **Model the real world, not the paper.** One object per real thing: the supplier, the customer, the vehicle, each tyre change, each invoice line, the totals. When several papers record the same thing, write it once and merge what they say. Keep conflicting readings side by side (e.g. \`"position": "6"\` and \`"positionAlt": "2L1"\`, or a \`conflicts\` note), never pick silently.
- **Arrays of objects** for anything that repeats (tyre changes, line items). Only put something in an array of events if it actually happened: a tread depth measured on a tyre that wasn't changed is a measurement, not a change.
- **Your own keys**, descriptive and in English (\`invoiceNumber\`, \`mounted.serial\`, \`removed.treadDepthMm\`). Values as written on the Document (no reformatting), except that you may split a combined text into parts.
- Add \`"_pages": [..]\` to every object: the pages its facts came from.
- Skip running prose (terms and conditions, email boilerplate).
- Never guess what you can't read; write what you see and add \`"_unsure": ["key", …]\` to that object.

Answer with the JSON object only.`;

/** The markdown of every page that has a text layer (a scan has none), and the page count. */
function textLayerOf(pdf: Uint8Array) {
  const { pages } = extractPagesMarkdown(Buffer.from(pdf));
  const textLayer = pages.flatMap((page): PageText[] => {
    const text = page.needsOcr ? "" : page.markdown.trim();
    return text ? [{ page: page.page + 1, text }] : [];
  });
  return { textLayer, pageCount: pages.length };
}

/** The text layer as the vision model gets it: every page, scans noted. */
function describe(textLayer: PageText[], pageCount: number) {
  return Array.from({ length: pageCount }, (_, i) => {
    const text = textLayer.find((p) => p.page === i + 1)?.text;
    return `## Page ${i + 1}\n\n${text ?? "(no text layer: read the image)"}`;
  }).join("\n\n");
}

export const reader: Reader = {
  async read(pdf) {
    const { textLayer, pageCount } = textLayerOf(pdf);
    const message = await vertex()
      .messages.stream({
        model: models.reader,
        max_tokens: 64000,
        thinking: { type: "adaptive" },
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: {
                  type: "base64",
                  media_type: "application/pdf",
                  data: Buffer.from(pdf).toString("base64"),
                },
              },
              { type: "text", text: `# Text layer\n\n${describe(textLayer, pageCount)}` },
              { type: "text", text: PROMPT },
            ],
          },
        ],
      })
      .finalMessage();
    usage.record({
      model: models.reader,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    });
    return { reading: parseJsonObject(textOf(message)) as Reading, textLayer };
  },
};
