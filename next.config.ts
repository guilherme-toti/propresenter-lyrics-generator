import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // protobufjs reads these .proto files from disk at request time (not via static import),
  // so serverless bundlers need an explicit hint to trace and include them in the output.
  outputFileTracingIncludes: {
    "/api/export/propresenter": ["./vendor/propresenter7-proto/proto/**/*"],
  },
};

export default nextConfig;
