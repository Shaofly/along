import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingExcludes: {
    "/api/media/*": ["./.data/**/*", "./next.config.ts"],
    "/api/posts/*": ["./.data/**/*", "./next.config.ts"],
  },
};

export default nextConfig;
