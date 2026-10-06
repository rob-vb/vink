import { defineConfig } from "vitest/config";

export default defineConfig({
  // The same "@/…" imports as tsconfig.json, so tests can load app code.
  resolve: { alias: { "@": new URL(".", import.meta.url).pathname.replace(/\/$/, "") } },
  test: {
    // Agent worktrees live inside the repo; their tests are theirs to run.
    exclude: ["**/node_modules/**", ".claude/**", ".next*/**"],
    // The VPS is shared; a cold first test can take a few seconds.
    testTimeout: 15_000,
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
  },
});
