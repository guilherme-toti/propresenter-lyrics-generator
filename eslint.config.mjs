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
    // Rust build output + the standalone Next.js server it bundles as a
    // sidecar (see scripts/tauri/prebuild.mjs) — not source we own.
    "src-tauri/target/**",
    "src-tauri/resources/**",
  ]),
]);

export default eslintConfig;
