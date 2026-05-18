import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_LOCAL_DIST_DIR || ".next",
  outputFileTracingRoot: process.cwd(),
  typescript: {
    tsconfigPath: process.env.NEXT_LOCAL_TSCONFIG || "tsconfig.json",
  },
};

export default nextConfig;
