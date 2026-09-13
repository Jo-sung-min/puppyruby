import type { Metadata } from "next";
import { getServerSeo, publicPageSeoMetadata } from "@/lib/server-seo";
import { PuppyLanding } from "@/components/puppy-landing";
export async function generateMetadata(): Promise<Metadata> { return publicPageSeoMetadata(await getServerSeo(), "home"); }
export default function Page() { return <PuppyLanding />; }
