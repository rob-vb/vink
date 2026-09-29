import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import noRawConvexFunctions from "./eslint-rules/no-raw-convex-functions.mjs";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["convex/**/*.{ts,js}"],
    ignores: ["convex/lib/functions.ts"],
    plugins: {
      vink: { rules: { "no-raw-convex-functions": noRawConvexFunctions } },
    },
    rules: { "vink/no-raw-convex-functions": "error" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-live/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "convex/_generated/**",
  ]),
]);

export default eslintConfig;
