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
    // Any build directory other than .next (see next.config.ts, which reads
    // NEXT_DIST_DIR) — generated output, same as .next, and the default
    // ignore list only knows the default name. The e2e suite builds into
    // .next-e2e; a build made while the server is running needs a directory
    // of its own, because writing into the one being read crashes webpack.
    // Named one at a time, a stray .next-build put fifteen thousand
    // problems in front of a real one.
    ".next-*/**",
    // Playwright's artefacts: traces, screenshots and the HTML report.
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
