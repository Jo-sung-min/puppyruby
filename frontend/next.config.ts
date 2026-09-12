import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Vercel's adapter packages the default output. Only opt in for the optional Docker build.
  output: !process.env.VERCEL && process.env.BUILD_STANDALONE === "true" ? "standalone" : undefined,
};

export default nextConfig;
