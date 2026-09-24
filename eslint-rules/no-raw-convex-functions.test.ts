// @vitest-environment node
import { RuleTester } from "@typescript-eslint/rule-tester";
import { afterAll, describe, it } from "vitest";
import rule from "./no-raw-convex-functions.mjs";

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

new RuleTester().run("no-raw-convex-functions", rule, {
  valid: [
    {
      name: "a function built with the tenancy wrapper",
      code: `
        import { orgQuery } from "./lib/functions";
        export const home = orgQuery({ args: {}, handler: async () => null });
      `,
    },
    {
      name: "internal functions are not public",
      code: `
        import { internalMutation } from "./_generated/server";
        export const cleanUp = internalMutation({ args: {}, handler: async () => {} });
      `,
    },
    {
      name: "types from the generated server",
      code: `import type { QueryCtx } from "../_generated/server";`,
    },
  ],
  invalid: [
    {
      name: "a raw query",
      code: `
        import { query } from "./_generated/server";
        export const leak = query({ args: {}, handler: async () => null });
      `,
      errors: [{ messageId: "raw" }],
    },
    {
      name: "a raw mutation from a nested module",
      code: `import { mutation } from "../_generated/server";`,
      errors: [{ messageId: "raw" }],
    },
    {
      name: "a raw action under another name",
      code: `import { action as a } from "./_generated/server";`,
      errors: [{ messageId: "raw" }],
    },
    {
      name: "the generic builders from convex/server",
      code: `import { queryGeneric, mutationGeneric, actionGeneric } from "convex/server";`,
      errors: [{ messageId: "raw" }, { messageId: "raw" }, { messageId: "raw" }],
    },
    {
      name: "a namespace import of the generated server",
      code: `
        import * as server from "./_generated/server";
        export const leak = server.query({ args: {}, handler: async () => null });
      `,
      errors: [{ messageId: "raw" }],
    },
  ],
});
