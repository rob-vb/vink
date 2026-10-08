// @vitest-environment node
// With CLAUDE_BRIDGE_URL set, the Claude adapters send their prompt to the
// Claude bridge (scripts/claude-bridge) instead of Vertex.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { filler } from "./filler";
import { proposer } from "./proposer";
import { reader } from "./reader";
import { usage, type Usage } from "./usage";

type Sent = { url: string; authorization: string | null; body: Record<string, unknown> };
let sent: Sent[];

/** The bridge, answering every completion with `text`. */
function bridgeAnswers(text: string) {
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    sent.push({
      url,
      authorization: new Headers(init.headers).get("authorization"),
      body: JSON.parse(init.body as string),
    });
    return Response.json({ text, usage: { inputTokens: 1200, outputTokens: 300 } });
  });
}

beforeEach(() => {
  sent = [];
  vi.stubEnv("CLAUDE_BRIDGE_URL", "https://vink.example/claude-bridge");
  vi.stubEnv("CLAUDE_BRIDGE_SECRET", "s3cret");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  usage.listener = null;
});

test("Read sends the PDF and its text layer to the bridge and returns the Reading", async () => {
  const pdf = new Uint8Array(readFileSync(join(process.cwd(), "fixtures/documents/invoice-001/document.pdf")));
  bridgeAnswers('```json\n{"invoice":{"number":"F-2024-001","_pages":[1]}}\n```');
  const used: Usage[] = [];
  usage.listener = (u) => used.push(u);

  const { reading, textLayer } = await reader.read({ kind: "pdf", bytes: pdf, pageCount: 1 });

  expect(reading).toEqual({ invoice: { number: "F-2024-001", _pages: [1] } });
  expect(textLayer.length).toBeGreaterThan(0);
  expect(sent).toHaveLength(1);
  expect(sent[0].url).toBe("https://vink.example/claude-bridge/complete");
  expect(sent[0].authorization).toBe("Bearer s3cret");
  expect(sent[0].body.model).toBe("claude-opus-5");
  expect(Buffer.from(sent[0].body.pdf as string, "base64").equals(Buffer.from(pdf))).toBe(true);
  expect(sent[0].body.prompt).toContain(textLayer[0].text.slice(0, 40));
  expect(sent[0].body.prompt).toContain("Describe everything this Document says");
  expect(used).toEqual([{ model: "claude-opus-5", inputTokens: 1200, outputTokens: 300 }]);
});

test("Fill sends a JSON schema to the bridge and answers per request id", async () => {
  bridgeAnswers('{"v0":658.08,"v1":null}');
  const total = { key: "total", label: "Total", type: "number" as const, required: true };
  const position = { key: "position", label: "Position", type: "text" as const, required: false };

  const values = await filler.fill([
    { id: "total", field: total, source: { path: "invoice.total", text: "658,08 EUR" } },
    { id: "tyre_changes[0].position", field: position, source: { path: "changes[0].pos", text: "?" } },
  ]);

  expect(values).toEqual({ total: 658.08, "tyre_changes[0].position": null });
  expect(sent[0].body.model).toBe("claude-haiku-4-5@20251001");
  expect(sent[0].body.pdf).toBeUndefined();
  expect(sent[0].body.jsonSchema).toMatchObject({ required: ["v0", "v1"] });
  expect(sent[0].body.prompt).toContain("658,08 EUR");
});

test("the Proposer sends the sample's PDF and Reading to the bridge", async () => {
  bridgeAnswers(
    '{"fields":[{"label":"Factuurnummer","key":"invoice_number","type":"text","ticked":true}]}',
  );

  const proposed = await proposer.propose({
    input: { kind: "pdf", bytes: new Uint8Array(Buffer.from("%PDF-1.7 sample")), pageCount: 1 },
    reading: { invoice: { number: "F-1" } },
    textLayer: [{ page: 1, text: "Factuur F-1" }],
  });

  expect(proposed).toEqual([
    {
      field: { label: "Factuurnummer", key: "invoice_number", description: undefined, required: false, type: "text" },
      ticked: true,
    },
  ]);
  expect(sent[0].body.pdf).toBe(Buffer.from("%PDF-1.7 sample").toString("base64"));
  expect(sent[0].body.prompt).toContain('"number": "F-1"');
  expect(sent[0].body.prompt).toContain("Factuur F-1");
});

test("a failed completion fails the step with the bridge's message", async () => {
  vi.stubGlobal("fetch", async () => new Response("Claude Code failed: rate limited", { status: 502 }));
  const total = { key: "total", label: "Total", type: "number" as const, required: true };

  await expect(
    filler.fill([{ id: "total", field: total, source: { path: "t", text: "1" } }]),
  ).rejects.toThrow("Claude Code failed: rate limited");
});
