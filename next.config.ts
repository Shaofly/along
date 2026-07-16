import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  devIndicators: false,
  allowedDevOrigins: ["*.trycloudflare.com"],
  outputFileTracingExcludes: {
    "/api/media/*": ["./.data/**/*", "./next.config.ts"],
    "/api/posts/*": ["./.data/**/*", "./next.config.ts"],
  },
};

export default nextConfig;
