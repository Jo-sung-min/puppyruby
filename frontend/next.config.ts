import type { NextConfig } from "next";
import { publicAssetBaseUrl, publicDownloadBaseUrl, publicRubyRoundBaseUrl } from "./src/lib/asset-url";

// Validate once on startup/build, and limit any optimized remote images to this release.
const assetBase = publicAssetBaseUrl();
const downloadBase = publicDownloadBaseUrl();
const rubyRoundBase = publicRubyRoundBaseUrl();

const nextConfig: NextConfig = {
  devIndicators: false,
  images: { remotePatterns: [...(assetBase ? [new URL(`${assetBase}/images/**`)] : []), ...(rubyRoundBase ? [new URL(`${rubyRoundBase}/images/ruby-round-v1/**`)] : [])] },
  // Media lives outside Git. Keep existing links working without proxying large files through Vercel.
  async redirects() {
    return [
      ...(rubyRoundBase ? [
        { source: "/images/ruby-round-v1/:path*", destination: `${rubyRoundBase}/images/ruby-round-v1/:path*`, permanent: false },
        { source: "/downloads/ruby-round-v1/:path*", destination: `${rubyRoundBase}/downloads/ruby-round-v1/:path*`, permanent: false },
      ] : []),
      ...(assetBase ? [
        { source: "/images/:path((?!ruby-round-v1(?:/|$)).*)", destination: `${assetBase}/images/:path`, permanent: false },
        { source: "/favicon.svg", destination: `${assetBase}/favicon.svg`, permanent: false },
      ] : []),
      ...(downloadBase ? [{ source: "/downloads/:path((?!ruby-round-v1(?:/|$)).*)", destination: `${downloadBase}/downloads/:path`, permanent: false }] : []),
    ];
  },
  // Verification services must receive metadata in the initial HTML head, without JavaScript.
  htmlLimitedBots: /.*/,
  // Vercel's adapter packages the default output. Only opt in for the optional Docker build.
  output: !process.env.VERCEL && process.env.BUILD_STANDALONE === "true" ? "standalone" : undefined,
};

export default nextConfig;
