import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Tauri desktop shell's webview loads http://127.0.0.1:3000 in dev
  // (see src-tauri/src/lib.rs) — matches the loopback host the production
  // sidecar binds to. Next's dev server otherwise blocks that as a
  // cross-origin request since it only trusts "localhost" by default.
  allowedDevOrigins: ["127.0.0.1"],
  // Bundles a minimal, self-contained server (.next/standalone) instead of
  // relying on the full node_modules tree — this is what the Tauri desktop
  // build packages as its sidecar server (see scripts/tauri/prebuild.mjs).
  // Only turned on for that build (via the TAURI_BUILD env var it sets):
  // standalone mode changes Next's own output-tracing in a way that Vercel's
  // deploy pipeline doesn't expect, so a plain `next build` (Vercel, `npm run
  // build`, `npm run dev`) must not set it.
  ...(process.env.TAURI_BUILD === "true" ? { output: "standalone" as const } : {}),
  // protobufjs reads these .proto files from disk at request time (not via static import),
  // so serverless bundlers need an explicit hint to trace and include them in the output.
  outputFileTracingIncludes: {
    "/api/export/propresenter": ["./vendor/propresenter7-proto/proto/**/*"],
    "/api/playlists/scan": ["./vendor/propresenter7-proto/proto/**/*"],
  },
};

export default nextConfig;
