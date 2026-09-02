import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Bundles a minimal, self-contained server (.next/standalone) instead of
  // relying on the full node_modules tree — this is what the Tauri desktop
  // build packages as its sidecar server (see scripts/tauri/prebuild.mjs).
  // `npm run dev` / `npm run start` are unaffected by this.
  output: "standalone",
  // protobufjs reads these .proto files from disk at request time (not via static import),
  // so serverless bundlers need an explicit hint to trace and include them in the output.
  outputFileTracingIncludes: {
    "/api/export/propresenter": ["./vendor/propresenter7-proto/proto/**/*"],
  },
};

export default nextConfig;
