// @vitest-environment node
// Read by kind (ADR 0010, step 4): the real Reader, Proposer and Vertex adapter
// run against a fake Vertex client; Match, Fill and Verify (Jev) are the fakes
// of test.setup.ts. The Reader is picked by the input's kind, never by a model.
import { PDFDocument, StandardFonts } from "pdf-lib";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { fakeFiller, fakeMatcher, fakePipeline, fakeVerifier, type Recording } from "../test.setup";
import { extract } from "./extract";
import { type FlatField, type ReaderInput } from "./pipeline";
import { proposer } from "./proposer";
import { reader } from "./reader";

type Part = { text?: string; inlineData?: { mimeType: string; data: string } };
type Request = {
  model: string;
  contents: Array<{ parts: Part[] }>;
  config: { thinkingConfig: { thinkingLevel: string } };
};

// Vertex, replaced: records every request and answers with `answer`.
const vertex = vi.hoisted(() => ({ requests: [] as unknown[], answer: "{}" }));
vi.mock("@google/genai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@google/genai")>()),
  GoogleGenAI: class {
    models = {
      generateContentStream: async (request: unknown) => {
        vertex.requests.push(request);
        return (async function* () {
          yield {
            candidates: [{ finishReason: "STOP", content: { parts: [{ text: vertex.answer }] } }],
            usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
          };
        })();
      },
    };
  },
}));

beforeEach(() => {
  vi.stubEnv("GOOGLE_VERTEX_CREDENTIALS", JSON.stringify({ project_id: "test-project" }));
  vi.stubEnv("READER_THINKING", undefined);
  vertex.requests = [];
  fakePipeline.reset();
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** A one-page digital PDF with a text layer. */
async function pdfWithText(lines: string[]) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  // Repeated, so pdf-inspector sees a real text page rather than a scan.
  Array.from({ length: 40 }, (_, i) => lines[i % lines.length]).forEach((line, i) =>
    page.drawText(line, { x: 40, y: 800 - i * 16, size: 11, font }),
  );
  return new Uint8Array(await doc.save());
}

// A stand-in for a JPEG and a PNG: the fake Vertex never decodes them.
const photo = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const base64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");

const lastRequest = () => vertex.requests.at(-1) as Request;
const partsOf = (request: Request) => request.contents[0].parts;
const filesIn = (request: Request) => partsOf(request).flatMap((p) => (p.inlineData ? [p.inlineData] : []));
const textsIn = (request: Request) => partsOf(request).flatMap((p) => (p.text !== undefined ? [p.text] : []));

const invoiceNumber: FlatField = { type: "text", key: "invoice_number", label: "Invoice number", required: true };
const complaintSubject: FlatField = { type: "text", key: "subject", label: "Subject", required: false };
const workOrderNumber: FlatField = { type: "text", key: "work_order_number", label: "Work order", required: false };

/** Match, Fill and Verify on a Reader's output, with Jev's fakes replaying `recording`. */
async function matchFillVerify(
  read: { reading: Recording["reading"]; textLayer: Array<{ page: number; text: string }> },
  recording: Omit<Recording, "reading" | "textLayer">,
  fields: FlatField[],
) {
  fakePipeline.replay({ ...recording, reading: read.reading, textLayer: read.textLayer });
  const extracted = await extract(
    { ...read, formName: "Form", formDescription: null, fields, lists: [] },
    { matcher: fakeMatcher, filler: fakeFiller, verifier: fakeVerifier },
  );
  const verify = fakePipeline.calls.find((c) => c.step === "verify");
  return { extracted, supportAskedFor: verify?.step === "verify" ? verify.supportAskedFor : [] };
}

// --- pdf ---

test("a PDF is sent as application/pdf with its text layer, and Verify checks the value against that text", async () => {
  const bytes = await pdfWithText(["Factuur F-2024-001", "Totaal 658,08"]);
  vertex.answer = JSON.stringify({ invoice: { number: "F-2024-001", _pages: [1] } });
  const input: ReaderInput = { kind: "pdf", bytes, pageCount: 1 };

  const read = await reader.read(input);

  const request = lastRequest();
  expect(filesIn(request)).toEqual([{ mimeType: "application/pdf", data: base64(bytes) }]);
  const [textLayer, prompt] = textsIn(request);
  expect(textLayer).toMatch(/^# Text layer\n\n## Page 1\n\nFactuur F-2024-001/);
  // The PDF prompt is the benchmarked one.
  expect(prompt).toContain(
    "Describe everything this Document says as one clean JSON object, so that a program can pick any fact out of it. The Document is a PDF that may bundle several papers about the same job (an invoice, a work order, handwritten forms). You get the page images and the text layer per page (when a page has one).\n\n- **Model the real world, not the paper.**",
  );
  expect(read.textLayer.map((p) => p.page)).toEqual([1]);
  expect(request.config.thinkingConfig.thinkingLevel).toBe("MEDIUM");

  const { extracted, supportAskedFor } = await matchFillVerify(
    read,
    {
      matches: { invoice_number: { path: "invoice.number", probability: 0.98 } },
      fills: { invoice_number: "F-2024-001" },
    },
    [invoiceNumber],
  );
  expect(supportAskedFor).toEqual(["invoice_number"]);
  expect(extracted.fieldValues[0]).toMatchObject({ value: "F-2024-001", pages: [1] });
  expect(extracted.fieldValues[0].signals.support).toBe(1);
});

// --- image ---

test("an image is sent with its own MIME type, has no text layer, and Verify skips the support check", async () => {
  vertex.answer = JSON.stringify({ workOrder: { number: "WB-2217", _pages: [1] } });

  const read = await reader.read({ kind: "image", bytes: photo, mimeType: "image/heic" });

  const request = lastRequest();
  expect(filesIn(request)).toEqual([{ mimeType: "image/heic", data: base64(photo) }]);
  expect(textsIn(request)[0]).toContain("(no text layer: read the image)");
  expect(textsIn(request)[1]).toContain("The Document is a photo or scan");
  // Handwriting is likely on a photo.
  expect(request.config.thinkingConfig.thinkingLevel).toBe("HIGH");
  expect(read).toEqual({ reading: { workOrder: { number: "WB-2217", _pages: [1] } }, textLayer: [] });

  const { extracted, supportAskedFor } = await matchFillVerify(
    read,
    {
      matches: { work_order_number: { path: "workOrder.number", probability: 0.9 } },
      fills: { work_order_number: "WB-2217" },
    },
    [workOrderNumber],
  );
  // Fit is still asked; support is not.
  expect(supportAskedFor).toEqual([]);
  expect(fakePipeline.calls).toContainEqual({ step: "verify", fields: ["work_order_number"], supportAskedFor: [] });
  expect(extracted.fieldValues[0].signals).toMatchObject({ fit: 1, support: null });
});

test("an image of a type that can't be read is refused before any model call", async () => {
  await expect(reader.read({ kind: "image", bytes: photo, mimeType: "image/gif" })).rejects.toThrow(
    "Not an image type that can be read: image/gif",
  );
  expect(vertex.requests).toEqual([]);
});

// --- email ---

const complaint = {
  kind: "email" as const,
  subject: "Klacht over levering 4410",
  from: "Anouk de Wit <anouk@bakkerij-dewit.example>",
  date: "Tue, 6 Oct 2026 09:12:00 +0200",
  body: "Goedemorgen,\n\nDe levering van gisteren was onvolledig.\n\nGroet, Anouk",
};

test("an email's subject, sender, date and body go in as text, and its body is page 1 of the text layer", async () => {
  vertex.answer = JSON.stringify({ complaint: { subject: "Klacht over levering 4410", _pages: [1] } });

  const read = await reader.read({ ...complaint, attachments: [] });

  const request = lastRequest();
  expect(filesIn(request)).toEqual([]);
  const [textLayer, prompt] = textsIn(request);
  expect(textLayer).toContain("## Page 1 (the email)\n\nSubject: Klacht over levering 4410\nFrom: Anouk de Wit");
  expect(textLayer).toContain("Date: Tue, 6 Oct 2026 09:12:00 +0200");
  expect(textLayer).toContain("De levering van gisteren was onvolledig.");
  expect(prompt).toContain("The Document is one email.");
  expect(request.config.thinkingConfig.thinkingLevel).toBe("MEDIUM");
  expect(read.textLayer).toEqual([
    { page: 1, text: expect.stringContaining("De levering van gisteren was onvolledig.") },
  ]);

  const { extracted, supportAskedFor } = await matchFillVerify(
    read,
    {
      matches: { subject: { path: "complaint.subject", probability: 0.99 } },
      fills: { subject: "Klacht over levering 4410" },
    },
    [complaintSubject],
  );
  // The body is the one page of source text, so support is asked for it.
  expect(supportAskedFor).toEqual(["subject"]);
  expect(extracted.fieldValues[0]).toMatchObject({ pages: [1], signals: { support: 1 } });
});

test("an email with an empty body still gives its headers as page 1", async () => {
  vertex.answer = "{}";

  const read = await reader.read({ ...complaint, body: "  ", attachments: [] });

  expect(textsIn(lastRequest())[0]).toContain("(no text in the body)");
  expect(read.textLayer).toEqual([{ page: 1, text: expect.stringContaining("Subject: Klacht over levering 4410") }]);
});

test("an email's image attachment goes in as an extra part before the texts, and its page has no text layer", async () => {
  vertex.answer = JSON.stringify({
    complaint: { subject: "Klacht over levering 4410", _pages: [1] },
    photo: { workOrderNumber: "WB-2217", _pages: [2] },
  });

  const read = await reader.read({
    ...complaint,
    attachments: [{ filename: "werkbon.jpg", mimeType: "image/jpeg", bytes: photo }],
  });

  const request = lastRequest();
  expect(filesIn(request)).toEqual([{ mimeType: "image/jpeg", data: base64(photo) }]);
  // The files come first, then the texts, as for a PDF.
  expect(partsOf(request)[0].inlineData).toBeDefined();
  expect(textsIn(request)[0]).toContain('## Page 2 (attachment "werkbon.jpg", image)\n\n(no text layer: read the image)');
  // An image may hold handwriting.
  expect(request.config.thinkingConfig.thinkingLevel).toBe("HIGH");
  expect(read.textLayer.map((p) => p.page)).toEqual([1]);

  const { supportAskedFor } = await matchFillVerify(
    read,
    {
      matches: {
        subject: { path: "complaint.subject", probability: 0.99 },
        work_order_number: { path: "photo.workOrderNumber", probability: 0.9 },
      },
      fills: { subject: "Klacht over levering 4410", work_order_number: "WB-2217" },
    },
    [complaintSubject, workOrderNumber],
  );
  // The subject is checked against the body; the number read from the photo is not.
  expect(supportAskedFor).toEqual(["subject"]);
});

test("a PDF attachment's pages follow the email's page 1 with their own text layer, in order", async () => {
  const bytes = await pdfWithText(["Factuur F-2024-001", "Totaal 658,08"]);
  vertex.answer = JSON.stringify({ invoice: { number: "F-2024-001", _pages: [2] } });

  const read = await reader.read({
    ...complaint,
    attachments: [
      { filename: "factuur.pdf", mimeType: "application/pdf", bytes },
      { filename: "foto.png", mimeType: "image/png", bytes: photo },
    ],
  });

  const request = lastRequest();
  expect(filesIn(request).map((f) => f.mimeType)).toEqual(["application/pdf", "image/png"]);
  const [textLayer] = textsIn(request);
  expect(textLayer).toContain('## Page 2 (attachment "factuur.pdf", page 1)\n\nFactuur F-2024-001');
  expect(textLayer).toContain('## Page 3 (attachment "foto.png", image)');
  expect(read.textLayer.map((p) => p.page)).toEqual([1, 2]);

  const { supportAskedFor } = await matchFillVerify(
    read,
    {
      matches: { invoice_number: { path: "invoice.number", probability: 0.98 } },
      fills: { invoice_number: "F-2024-001" },
    },
    [invoiceNumber],
  );
  expect(supportAskedFor).toEqual(["invoice_number"]);
});

test("an email attachment of another type is refused before any model call", async () => {
  await expect(
    reader.read({
      ...complaint,
      attachments: [{ filename: "sheet.xlsx", mimeType: "application/vnd.ms-excel", bytes: photo }],
    }),
  ).rejects.toThrow("An attachment of type application/vnd.ms-excel can't be read: sheet.xlsx");
  expect(vertex.requests).toEqual([]);
});

// --- Proposer ---

test("the Proposer gets a PDF sample as before, and an image or email sample with its own files and words", async () => {
  vertex.answer = JSON.stringify({ fields: [{ label: "Onderwerp", key: "subject", type: "text", ticked: true }] });
  const reading = { complaint: { subject: "Klacht" } };

  const pdf = await pdfWithText(["Factuur F-1"]);
  await proposer.propose({ input: { kind: "pdf", bytes: pdf, pageCount: 1 }, reading, textLayer: [] });
  expect(filesIn(lastRequest())).toEqual([{ mimeType: "application/pdf", data: base64(pdf) }]);
  expect(textsIn(lastRequest()).at(-1)).toContain("You get the PDF, its text layer, and the Reading");

  await proposer.propose({ input: { kind: "image", bytes: photo, mimeType: "image/png" }, reading, textLayer: [] });
  expect(filesIn(lastRequest())).toEqual([{ mimeType: "image/png", data: base64(photo) }]);
  expect(textsIn(lastRequest()).at(-1)).toContain("You get the photo (it has no text layer) and the Reading");

  const proposed = await proposer.propose({
    input: { ...complaint, attachments: [{ filename: "foto.jpg", mimeType: "image/jpeg", bytes: photo }] },
    reading,
    textLayer: [{ page: 1, text: "Subject: Klacht" }],
  });
  expect(filesIn(lastRequest())).toEqual([{ mimeType: "image/jpeg", data: base64(photo) }]);
  expect(textsIn(lastRequest()).at(-1)).toContain("You get the email as text");
  expect(textsIn(lastRequest())[0]).toContain("## Page 1\n\nSubject: Klacht");
  expect(proposed.map((p) => p.field.key)).toEqual(["subject"]);
});

test("the Proposer describes a Form from words alone: text only, no files, no Reading, the same Field shape", async () => {
  vertex.answer = JSON.stringify({
    fields: [
      { label: "Onderwerp", key: "subject", type: "text", ticked: true },
      { label: "Soort klacht", key: "kind", type: "choice", options: ["Levering", "Kwaliteit"], ticked: true },
      { label: "Kapot", key: "Not A Key", type: "text" },
    ],
  });

  const proposed = await proposer.describe("Een klacht van een klant: onderwerp en soort klacht.");

  const request = lastRequest();
  expect(filesIn(request)).toEqual([]);
  expect(textsIn(request)[0]).toContain("Een klacht van een klant: onderwerp en soort klacht.");
  expect(textsIn(request).at(-1)).toContain("You have no sample");
  // A Field without a valid key is dropped, like a sample's proposal; none is required.
  expect(proposed).toEqual([
    { field: { type: "text", label: "Onderwerp", key: "subject", required: false }, ticked: true },
    {
      field: {
        type: "choice",
        label: "Soort klacht",
        key: "kind",
        required: false,
        options: [{ value: "Levering" }, { value: "Kwaliteit" }],
      },
      ticked: true,
    },
  ]);
});

// --- the Claude bridge ---

test("the Claude bridge reads a single PDF only: an image or an email's attachments don't go to it", async () => {
  vi.stubEnv("CLAUDE_BRIDGE_URL", "https://vink.example/claude-bridge");
  vi.stubEnv("CLAUDE_BRIDGE_SECRET", "s3cret");

  await expect(reader.read({ kind: "image", bytes: photo, mimeType: "image/png" })).rejects.toThrow(
    "The Claude bridge reads a single PDF only",
  );
  expect(vertex.requests).toEqual([]);
});
