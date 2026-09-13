import type { Metadata } from "next";
import { getServerSeo, publicPageSeoMetadata } from "@/lib/server-seo";
import { AccountShell } from "@/components/account/account-shell";
import { PuppyShop } from "@/components/commerce/puppy-shop";

export async function generateMetadata(): Promise<Metadata> { return publicPageSeoMetadata(await getServerSeo(), "shop"); }

export default function ShopPage() {
  return <AccountShell wide><PuppyShop /></AccountShell>;
}
