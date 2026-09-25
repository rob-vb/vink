// Serves the Claude bridge (bridge.ts) on 127.0.0.1; nginx exposes it at
// https://docuhelper.robvb.com/claude-bridge/. Runs under pm2 (ecosystem.config.cjs).
//
// Needs CLAUDE_BRIDGE_SECRET (in .env), the same value as on the Convex
// deployment, and a signed-in `claude` CLI on this box.
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { createBridge, type Cli } from "./bridge";

const port = Number(process.env.CLAUDE_BRIDGE_PORT ?? 3004);

const cli: Cli = (args, { cwd }) =>
  new Promise((resolve, reject) => {
    execFile(
      "claude",
      args,
      // Under the 10-minute limit of the Convex action that waits for it.
      { cwd, timeout: 9 * 60_000, maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => {
        // `claude -p` exits non-zero on is_error but still prints its JSON.
        if (stdout.trim()) resolve(stdout);
        else reject(error ?? new Error(stderr || "claude printed nothing"));
      },
    );
  });

const bridge = createBridge({ secret: process.env.CLAUDE_BRIDGE_SECRET ?? "", cli });

createServer(async (req, res) => {
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const request = new Request(`http://bridge${req.url}`, {
      method: req.method,
      headers: req.headers as Record<string, string>,
      body: req.method === "POST" ? Buffer.concat(chunks) : undefined,
    });
    const started = Date.now();
    const response = await bridge(request);
    console.log(`${req.method} ${req.url} ${response.status} ${Date.now() - started}ms`);
    res.writeHead(response.status, { "content-type": response.headers.get("content-type") ?? "text/plain" });
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error(error);
    res.writeHead(500).end(String(error));
  }
}).listen(port, "127.0.0.1", () => console.log(`Claude bridge on 127.0.0.1:${port}`));
