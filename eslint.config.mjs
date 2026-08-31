import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    ".data/**",
    "public/vendor/**",
    ".playwright-cli/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
    // Agent workspaces and scratch areas (never part of the product code):
    ".pi/**",
    ".pi-lens/**",
    ".work/**",
    ".devtools/**",
  ]),
]);

export default eslintConfig;
