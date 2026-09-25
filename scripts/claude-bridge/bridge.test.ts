// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { createBridge, type Cli } from "./bridge";

/** What `claude -p --output-format json` prints for a finished answer. */
function cliAnswer(result: string, extra: object = {}) {
  return JSON.stringify({
    is_error: false,
    result,
    usage: { input_tokens: 10, cache_creation_input_tokens: 90, output_tokens: 20 },
    ...extra,
  });
}

function complete(body: object, secret = "s3cret") {
  return new Request("http://bridge/complete", {
    method: "POST",
    headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("a completion with a PDF runs Claude Code on that PDF and returns its answer", async () => {
  const calls: Array<{ args: string[]; pdf: string | null }> = [];
  const cli: Cli = async (args, { cwd }) => {
    const path = join(cwd, "document.pdf");
    calls.push({ args, pdf: existsSync(path) ? readFileSync(path, "utf8") : null });
    return cliAnswer('{"invoice":{"number":"F-1"}}');
  };
  const bridge = createBridge({ secret: "s3cret", cli });

  const response = await bridge(
    complete({
      model: "claude-haiku-4-5@20251001",
      prompt: "Describe this Document.",
      pdf: Buffer.from("%PDF-1.7 invoice").toString("base64"),
    }),
  );

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    text: '{"invoice":{"number":"F-1"}}',
    usage: { inputTokens: 100, outputTokens: 20 },
  });
  expect(calls).toHaveLength(1);
  expect(calls[0].pdf).toBe("%PDF-1.7 invoice");
  const { args } = calls[0];
  // Vertex's `@` version becomes the first-party model id.
  expect(args[args.indexOf("--model") + 1]).toBe("claude-haiku-4-5-20251001");
  // Only the Read tool, and none of the box's settings, MCP servers or CLAUDE.md.
  expect(args[args.indexOf("--tools") + 1]).toBe("Read");
  expect(args).toContain("--strict-mcp-config");
  expect(args[args.indexOf("--setting-sources") + 1]).toBe("");
  expect(args.at(-1)).toContain("document.pdf");
  expect(args.at(-1)).toContain("Describe this Document.");
});

test("a request without the secret is refused and runs nothing", async () => {
  let ran = false;
  const bridge = createBridge({
    secret: "s3cret",
    cli: async () => {
      ran = true;
      return cliAnswer("{}");
    },
  });

  const response = await bridge(complete({ model: "claude-opus-5", prompt: "Hi" }, "guess"));

  expect(response.status).toBe(401);
  expect(ran).toBe(false);
});

test("a completion with a JSON schema answers with the structured output, and no tools", async () => {
  let args: string[] = [];
  const bridge = createBridge({
    secret: "s3cret",
    cli: async (a) => {
      args = a;
      return cliAnswer("Here you go", { structured_output: { v0: 658.08 } });
    },
  });
  const schema = { type: "object", properties: { v0: { type: "number" } } };

  const response = await bridge(complete({ model: "claude-opus-5", prompt: "Fill", jsonSchema: schema }));

  expect(await response.json()).toMatchObject({ text: '{"v0":658.08}' });
  expect(JSON.parse(args[args.indexOf("--json-schema") + 1])).toEqual(schema);
  expect(args[args.indexOf("--tools") + 1]).toBe("");
});

test("an error from Claude Code is passed on as a failed completion", async () => {
  const bridge = createBridge({
    secret: "s3cret",
    cli: async () => JSON.stringify({ is_error: true, result: "Credit balance is too low" }),
  });

  const response = await bridge(complete({ model: "claude-opus-5", prompt: "Hi" }));

  expect(response.status).toBe(502);
  expect(await response.text()).toContain("Credit balance is too low");
});
