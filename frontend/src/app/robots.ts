import type { MetadataRoute } from "next";
import { getServerSeo, seoRobots } from "@/lib/server-seo";

export const dynamic = "force-dynamic";
export default async function robots(): Promise<MetadataRoute.Robots> {
  return seoRobots(await getServerSeo());
}
