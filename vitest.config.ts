import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Agent worktrees live inside the repo; their tests are theirs to run.
    exclude: ["**/node_modules/**", ".claude/**", ".next*/**"],
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
  },
});
