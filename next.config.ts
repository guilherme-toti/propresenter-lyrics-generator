import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Tauri desktop shell's webview loads http://127.0.0.1:3100 in dev
  // (see src-tauri/src/lib.rs) — matches the loopback host the production
  // sidecar binds to. Next's dev server otherwise blocks that as a
  // cross-origin request since it only trusts "localhost" by default.
  allowedDevOrigins: ["127.0.0.1"],
  // Bundles a minimal, self-contained server (.next/standalone) instead of
  // relying on the full node_modules tree — this is what the Tauri desktop
  // build packages as its sidecar server (see scripts/tauri/prebuild.mjs).
  output: "standalone",
  // protobufjs reads these .proto files from disk at request time (not via static import),
  // so the standalone output's file tracing can't see them and would leave them out.
  // Every API route may decode ProPresenter files, so all of them get the schemas, rather than a
  // per-route list that a new route can silently be missing from.
  outputFileTracingIncludes: {
    "/api/**": ["./vendor/propresenter7-proto/proto/**/*"],
  },
  experimental: {
    // proxy.ts guards /api/*, and with a proxy Next buffers request bodies up to this size (10 MB
    // by default). A still video sent as base64 can pass that; see MAX_STILL_VIDEO_BYTES.
    proxyClientMaxBodySize: "40mb",
  },
};

export default nextConfig;
