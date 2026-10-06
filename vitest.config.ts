import { defineConfig } from "vitest/config";

export default defineConfig({
  // The same "@/…" imports as tsconfig.json, so tests can load app code.
  resolve: { alias: { "@": new URL(".", import.meta.url).pathname.replace(/\/$/, "") } },
  test: {
    // Agent worktrees live inside the repo; their tests are theirs to run.
    // The Zapier app has its own package and runs its tests with jest.
    exclude: ["**/node_modules/**", ".claude/**", ".next*/**", "integrations/zapier/**"],
    // The VPS is shared; a cold first test can take a few seconds.
    testTimeout: 15_000,
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
  },
});
