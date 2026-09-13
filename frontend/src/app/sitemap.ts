import type { MetadataRoute } from "next";
import { getServerSeo, seoSitemap } from "@/lib/server-seo";

export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return seoSitemap(await getServerSeo());
}
