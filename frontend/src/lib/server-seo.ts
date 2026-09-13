import "server-only";
import { cache } from "react";
import type { Metadata, MetadataRoute } from "next";
import { apiBase } from "./server-session";
import { assetUrl } from "./asset-url";
import { defaultSeoConfig, parseSeoConfig, seoPages, type SeoConfig, type SeoPageKey } from "./seo";

const publicPages = Object.fromEntries(seoPages.map(page => [page.id, page.path])) as Record<SeoPageKey, string>;

/** An administrator setting or deployment variable is trusted; request Host headers never are. */
export function publicSeoOrigin(config: Pick<SeoConfig, "siteUrl">, environmentUrl = process.env.PUBLIC_SITE_URL): string | undefined {
  const value = config.siteUrl.trim() || environmentUrl?.trim();
  if (!value) return undefined;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/"
      || !host.includes(".") || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.startsWith("[")) return undefined;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
      const [a, b] = host.split(".").map(Number);
      if (a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224) return undefined;
    }
    return url.origin;
  } catch { return undefined; }
}

/** React memoizes this per server render only; saved settings are fetched again on the next request. */
export const getServerSeo = cache(async (): Promise<SeoConfig> => {
  try {
    const response = await fetch(`${apiBase()}/seo`, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(3000) });
    if (!response.ok) return defaultSeoConfig;
    return parseSeoConfig(await response.json());
  } catch { return defaultSeoConfig; }
});

function shareMetadata(config: SeoConfig, title: string, description: string, pageUrl?: string): Pick<Metadata, "openGraph" | "twitter"> {
  const images = config.ogImageUrl ? [{ url: config.ogImageUrl, alt: config.ogImageAlt || config.siteName }] : [];
  return {
    openGraph: { type: "website", locale: "ko_KR", siteName: config.siteName, title, description, ...(pageUrl ? { url: pageUrl } : {}), images },
    twitter: { card: images.length ? "summary_large_image" : "summary", title, description, images },
  };
}

export function rootSeoMetadata(config: SeoConfig, environmentUrl?: string): Metadata {
  const origin = publicSeoOrigin(config, environmentUrl);
  return {
    title: config.defaultTitle, description: config.defaultDescription, applicationName: config.siteName,
    metadataBase: origin ? new URL(origin) : null,
    icons: { icon: assetUrl("/favicon.svg") }, referrer: "no-referrer",
    robots: { index: config.indexingEnabled, follow: true },
    verification: {
      ...(config.googleVerification ? { google: config.googleVerification } : {}),
      ...(config.naverVerification ? { other: { "naver-site-verification": config.naverVerification } } : {}),
    },
    // Canonical and og:url belong to individual public pages, never every child of the root layout.
    ...shareMetadata(config, config.defaultTitle, config.defaultDescription),
  };
}

export function publicPageSeoMetadata(config: SeoConfig, page: SeoPageKey, environmentUrl?: string): Metadata {
  const entry = config.pages[page];
  const title = entry.title || config.defaultTitle, description = entry.description || config.defaultDescription;
  const origin = publicSeoOrigin(config, environmentUrl), canonical = origin ? new URL(publicPages[page], origin).href : undefined;
  return {
    title: { absolute: title }, description,
    ...(canonical ? { alternates: { canonical } } : {}),
    robots: { index: config.indexingEnabled && entry.indexable, follow: true },
    ...shareMetadata(config, title, description, canonical),
  };
}

export function seoRobots(config: SeoConfig, environmentUrl?: string): MetadataRoute.Robots {
  const origin = publicSeoOrigin(config, environmentUrl);
  const anyIndexable = config.indexingEnabled && Object.values(config.pages).some(page => page.indexable);
  return {
    // HTML remains crawlable so search engines can see noindex, including after an administrator disables indexing.
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/downloads/"] },
    ...(origin && anyIndexable ? { sitemap: new URL("/sitemap.xml", origin).href } : {}),
  };
}

export function seoSitemap(config: SeoConfig, environmentUrl?: string): MetadataRoute.Sitemap {
  const origin = publicSeoOrigin(config, environmentUrl);
  if (!origin || !config.indexingEnabled) return [];
  const modified = config.updatedAt === null ? undefined : new Date(config.updatedAt);
  return (Object.keys(publicPages) as SeoPageKey[]).filter(page => config.pages[page].indexable).map(page => ({
    url: new URL(publicPages[page], origin).href,
    ...(modified && !Number.isNaN(modified.getTime()) ? { lastModified: modified } : {}),
  }));
}
