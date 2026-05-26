import type { NextConfig } from "next";

const allowedDevOrigins = (
  process.env.NEXT_ALLOWED_DEV_ORIGINS ??
  "127.0.0.1,169.254.191.245"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_LOCAL_DIST_DIR || ".next",
  outputFileTracingRoot: process.cwd(),
  typescript: {
    tsconfigPath: process.env.NEXT_LOCAL_TSCONFIG || "tsconfig.json",
  },
  allowedDevOrigins,
};

export default nextConfig;
