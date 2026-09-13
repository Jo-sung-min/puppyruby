import type { Metadata } from "next";
import { getServerSeo, publicPageSeoMetadata } from "@/lib/server-seo";
import { PuppyHome } from "@/components/puppy-home";

export async function generateMetadata(): Promise<Metadata> { return publicPageSeoMetadata(await getServerSeo(), "play"); }
export default function PlayPage() { return <PuppyHome />; }
