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
    "next-env.d.ts",
    // The e2e run's own build directory (see next.config.ts) — generated
    // output, same as .next, and the default ignore list doesn't know it.
    ".next-e2e/**",
    // Playwright's artefacts: traces, screenshots and the HTML report.
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
