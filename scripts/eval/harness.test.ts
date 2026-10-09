// @vitest-environment node
import { copyFileSync, cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, expect, test } from "vitest";
import type { Filler, Matcher, Reader, Verifier } from "../../convex/lib/pipeline";
import { usage } from "../../convex/lib/usage";
import {
  fakeFiller,
  fakeMatcher,
  fakePipeline,
  fakeReader,
  fakeVerifier,
  type Recording,
} from "../../convex/test.setup";
import { evaluate, loadInput, parseEml } from "./harness";

const invoiceForm = {
  name: "invoice",
  fields: [
    { name: "invoiceNumber", type: "string" },
    { name: "total", type: "number" },
  ],
};

const invoiceRecording: Recording = {
  reading: { invoice: { number: "F-2024-001", total: "658,08", _pages: [1] } },
  textLayer: [{ page: 1, text: "Factuur F-2024-001 Totaal 658,08" }],
  matches: {
    invoiceNumber: { path: "invoice.number", probability: 0.98 },
    total: { path: "invoice.total", probability: 0.97 },
  },
  fills: { invoiceNumber: "F-2024-001", total: 685.08 },
  verifications: { invoiceNumber: { fit: 0.95, support: 0.96 }, total: { fit: 0.4, support: 0.3 } },
};

/** A fixtures folder as in fixtures/README.md, with one invoice Document. */
function fixturesWithInvoice() {
  const root = mkdtempSync(join(tmpdir(), "eval-"));
  mkdirSync(join(root, "forms"));
  writeFileSync(join(root, "forms/invoice.json"), JSON.stringify(invoiceForm));
  const document = join(root, "documents/invoice-001");
  mkdirSync(document, { recursive: true });
  writeFileSync(join(document, "document.pdf"), "%PDF-1.7 stand-in");
  writeFileSync(
    join(document, "expected.json"),
    JSON.stringify({
      form: "invoice",
      pages: 1,
      fieldValues: { invoiceNumber: "F-2024-001", total: 658.08 },
      verified: ["total"],
      unverified: ["invoiceNumber"],
      unknown: [],
    }),
  );
  return root;
}

/** The Seam 1 fakes, each also reporting the tokens a real model call would use. */
const metered = {
  reader: {
    async read(pdf) {
      usage.record({ model: "reader-model", inputTokens: 10_000, outputTokens: 2_000 });
      return fakeReader.read(pdf);
    },
  } satisfies Reader,
  matcher: {
    async match(reading, request) {
      usage.record({ model: "jev-model", inputTokens: 5_000, outputTokens: 0 });
      return fakeMatcher.match(reading, request);
    },
  } satisfies Matcher,
  filler: fakeFiller satisfies Filler,
  verifier: fakeVerifier satisfies Verifier,
};

const prices = {
  "reader-model": { inputPerMillion: 5, outputPerMillion: 25 },
  "jev-model": { inputPerMillion: 0.04, outputPerMillion: 0 },
};

beforeEach(() => fakePipeline.reset());

test("runs the pipeline on every fixture Document and reports its score, cost and latency", async () => {
  fakePipeline.replay(invoiceRecording);

  const report = await evaluate({
    fixturesDir: fixturesWithInvoice(),
    adapters: metered,
    prices,
    threshold: 0.8,
  });

  expect(fakePipeline.calls.map((c) => c.step)).toEqual(["read", "match", "fill", "verify"]);
  const [invoice] = report.documents;
  expect(invoice).toMatchObject({
    document: "invoice-001",
    pages: 1,
    score: {
      values: { right: 1, total: 2 },
      verifiedValues: { right: 0, total: 1 },
      needsReview: { flagged: 1, wrong: 1, wrongFlagged: 1 },
    },
    // 10k × $5 + 2k × $25 + 5k × $0.04, per million tokens
    costUsd: expect.closeTo(0.1002, 8),
  });
  expect(invoice.ms.total).toBeGreaterThanOrEqual(0);
  expect(report.totals).toMatchObject({
    values: { right: 1, total: 2 },
    lists: { right: 0, total: 0 },
    needsReview: { precision: 1, recall: 1 },
    costUsd: expect.closeTo(0.1002, 8),
  });
});

test("records what the models answered as a Recording the Seam 1 fakes replay to the same result", async () => {
  const fixturesDir = fixturesWithInvoice();
  fakePipeline.replay(invoiceRecording);
  const live = await evaluate({ fixturesDir, adapters: metered, prices, threshold: 0.8, record: true });

  fakePipeline.reset();
  const recorded = readFileSync(join(fixturesDir, "documents/invoice-001/recording.json"), "utf8");
  fakePipeline.replay(JSON.parse(recorded));
  const replayed = await evaluate({ fixturesDir, adapters: metered, prices, threshold: 0.8 });

  expect(replayed.documents[0].score).toEqual(live.documents[0].score);
  expect(replayed.documents[0].score.values).toEqual({ right: 1, total: 2 });
});

test("records what the pipeline made of the Document next to its Recording", async () => {
  const fixturesDir = fixturesWithInvoice();
  fakePipeline.replay(invoiceRecording);
  await evaluate({ fixturesDir, adapters: metered, prices, threshold: 0.8, record: true });

  const extracted = JSON.parse(
    readFileSync(join(fixturesDir, "documents/invoice-001/extracted.json"), "utf8"),
  );
  expect(extracted).toMatchObject({ jevVerified: true, lists: [] });
  expect(extracted.fieldValues.map((v: { key: string }) => v.key)).toContain("total");
});

test("a Document whose pipeline fails is reported with its error, and the others are still scored", async () => {
  const fixturesDir = fixturesWithInvoice();
  const second = join(fixturesDir, "documents/invoice-002");
  mkdirSync(second);
  writeFileSync(join(second, "document.pdf"), "%PDF-1.7 stand-in");
  writeFileSync(
    join(second, "expected.json"),
    readFileSync(join(fixturesDir, "documents/invoice-001/expected.json")),
  );
  fakePipeline.replay(invoiceRecording);
  fakePipeline.failOnce("read");

  const report = await evaluate({ fixturesDir, adapters: metered, prices, threshold: 0.8 });

  expect(report.failures).toEqual([{ document: "invoice-001", error: "read is down" }]);
  expect(report.documents.map((d) => d.document)).toEqual(["invoice-002"]);
  expect(report.totals.values).toEqual({ right: 1, total: 2 });
});

test("with a readings folder, each Document is read once and its stored Reading is reused after that", async () => {
  const fixturesDir = fixturesWithInvoice();
  const readingsDir = mkdtempSync(join(tmpdir(), "readings-"));
  fakePipeline.replay(invoiceRecording);
  const first = await evaluate({ fixturesDir, adapters: metered, prices, threshold: 0.8, readingsDir });

  fakePipeline.reset();
  fakePipeline.replay({ ...invoiceRecording, reading: { unrelated: "not read again" } });
  const second = await evaluate({ fixturesDir, adapters: metered, prices, threshold: 0.8, readingsDir });

  expect(fakePipeline.calls.map((c) => c.step)).toEqual(["match", "fill", "verify"]);
  expect(fakePipeline.calls[0]).toMatchObject({ reading: invoiceRecording.reading });
  expect(second.documents[0].score).toEqual(first.documents[0].score);
});

test("Verify gets the fixture Form's name and description, as it does in the app", async () => {
  const fixturesDir = fixturesWithInvoice();
  writeFileSync(
    join(fixturesDir, "forms/invoice.json"),
    JSON.stringify({ ...invoiceForm, description: "Supplier invoices for fleet repairs" }),
  );
  fakePipeline.replay(invoiceRecording);
  const seen: Array<{ formName: string; formDescription: string | null }> = [];
  const verifier: Verifier = {
    async verify(document, requests) {
      seen.push({ formName: document.formName, formDescription: document.formDescription });
      return fakeVerifier.verify(document, requests);
    },
  };

  await evaluate({ fixturesDir, adapters: { ...metered, verifier }, prices, threshold: 0.8 });

  expect(seen).toEqual([{ formName: "invoice", formDescription: "Supplier invoices for fleet repairs" }]);
});

// --- one fixture per kind (ADR 0010, step 4) ---

/** A fixtures folder with one of the committed synthetic Documents and its Form. */
function fixturesWith(document: string, form: string) {
  const root = mkdtempSync(join(tmpdir(), "eval-kind-"));
  mkdirSync(join(root, "forms"));
  cpSync(join("fixtures/forms", `${form}.json`), join(root, "forms", `${form}.json`));
  cpSync(join("fixtures/documents", document), join(root, "documents", document), { recursive: true });
  return root;
}

test("a PDF fixture is read as a PDF with the page count from its expected.json", async () => {
  fakePipeline.replay(invoiceRecording);

  await evaluate({ fixturesDir: fixturesWithInvoice(), adapters: metered, prices, threshold: 0.8 });

  expect(fakePipeline.reads).toEqual([{ kind: "pdf", bytes: expect.any(Uint8Array), pageCount: 1 }]);
});

test("the photo of a handwritten work order is read as an image, and its Verify has no text to check against", async () => {
  fakePipeline.replay({
    reading: { workOrder: { number: "4821", _pages: [1] }, customer: { name: "J. Hofman", _pages: [1] } },
    matches: {
      workOrderNumber: { path: "workOrder.number", probability: 0.95 },
      customerName: { path: "customer.name", probability: 0.9 },
    },
    fills: { workOrderNumber: "4821", customerName: "J. Hofman" },
  });

  const report = await evaluate({
    fixturesDir: fixturesWith("synthetic-workorder-photo-001", "work-order"),
    adapters: metered,
    prices,
    threshold: 0.8,
  });

  expect(report.failures).toEqual([]);
  expect(fakePipeline.reads).toEqual([
    { kind: "image", bytes: expect.any(Uint8Array), mimeType: "image/jpeg" },
  ]);
  expect(fakePipeline.calls).toContainEqual({
    step: "verify",
    fields: ["workOrderNumber", "customerName"],
    supportAskedFor: [],
  });
  expect(report.documents[0].score.values).toMatchObject({ right: 2 });
});

test("the complaint email is read as an email with its headers and body, and its text is the one page of source text", async () => {
  fakePipeline.replay({
    reading: { complaint: { orderNumber: "KB-20417", _pages: [1] } },
    textLayer: [{ page: 1, text: "Op 21 september 2026 heb ik een broodsnijmachine BS-300 gekocht (bestelnummer KB-20417)" }],
    matches: { orderNumber: { path: "complaint.orderNumber", probability: 0.97 } },
    fills: { orderNumber: "KB-20417" },
  });

  const report = await evaluate({
    fixturesDir: fixturesWith("synthetic-complaint-email-001", "complaint"),
    adapters: metered,
    prices,
    threshold: 0.8,
  });

  expect(report.failures).toEqual([]);
  expect(fakePipeline.reads).toEqual([
    {
      kind: "email",
      subject: "Klacht broodsnijmachine BS-300, bestelling KB-20417",
      from: "Anouk de Wit <anouk.dewit@bakkerij-dewit.example>",
      date: "Tue, 6 Oct 2026 09:12:00 +0200",
      body: expect.stringContaining("bestelnummer KB-20417"),
      attachments: [],
    },
  ]);
  expect(fakePipeline.calls).toContainEqual({ step: "verify", fields: ["orderNumber"], supportAskedFor: ["orderNumber"] });
  expect(report.documents[0].score.values).toMatchObject({ right: 1 });
});

test("every committed synthetic fixture loads, and its expected.json names only fields of its Form", () => {
  const forms: Record<string, string> = {
    "synthetic-workorder-photo-001": "work-order",
    "synthetic-complaint-email-001": "complaint",
  };
  for (const [document, form] of Object.entries(forms)) {
    const expected = JSON.parse(readFileSync(join("fixtures/documents", document, "expected.json"), "utf8"));
    const fields = JSON.parse(readFileSync(join("fixtures/forms", `${form}.json`), "utf8")).fields as Array<{ name: string }>;
    expect(expected.form).toBe(form);
    expect(Object.keys(expected.fieldValues).sort()).toEqual(fields.map((f) => f.name).sort());
    expect(() => loadInput(join("fixtures/documents", document), expected.pages)).not.toThrow();
  }
});

test("an email fixture can bring its attachments in an attachments folder; a Reading is stored per email", async () => {
  const fixturesDir = fixturesWith("synthetic-complaint-email-001", "complaint");
  const dir = join(fixturesDir, "documents/synthetic-complaint-email-001");
  mkdirSync(join(dir, "attachments"));
  copyFileSync("fixtures/documents/synthetic-workorder-photo-001/document.jpg", join(dir, "attachments/werkbon.jpg"));

  expect(loadInput(dir, 1)).toMatchObject({
    kind: "email",
    attachments: [{ filename: "werkbon.jpg", mimeType: "image/jpeg", bytes: expect.any(Uint8Array) }],
  });

  const readingsDir = mkdtempSync(join(tmpdir(), "readings-"));
  fakePipeline.replay({ reading: { complaint: { orderNumber: "KB-20417" } }, matches: {}, fills: {} });
  await evaluate({ fixturesDir, adapters: metered, prices, threshold: 0.8, readingsDir });
  await evaluate({ fixturesDir, adapters: metered, prices, threshold: 0.8, readingsDir });
  // The second run reused the stored Reading.
  expect(fakePipeline.reads).toHaveLength(1);
});

test("parseEml reads a plain-text mail, and refuses a multipart or encoded one with the reason", () => {
  const mail = "Subject: Hallo\r\nFrom: a@b.example\r\nDate: Tue, 6 Oct 2026 09:12:00 +0200\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\nRegel een.\r\n\r\nRegel twee.\r\n";
  expect(parseEml(mail)).toEqual({
    subject: "Hallo",
    from: "a@b.example",
    date: "Tue, 6 Oct 2026 09:12:00 +0200",
    body: "Regel een.\n\nRegel twee.",
  });
  expect(() => parseEml("Subject: x\nFrom: a\nDate: d\nContent-Type: multipart/mixed; boundary=b\n\nbody")).toThrow(
    "Only a plain-text, 7bit or 8bit .eml is supported",
  );
  expect(() => parseEml("From: a\nDate: d\n\nbody")).toThrow("The .eml has no subject header");
});
