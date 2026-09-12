import type { Metadata } from "next";
import { AccountShell } from "@/components/account/account-shell";
import { PuppyShop } from "@/components/commerce/puppy-shop";

export const metadata: Metadata = { title: "상점 · PuppyRuby", description: "강아지 친구와 아우라, 치장품을 만나고 보관함에서 꾸며요." };

export default function ShopPage() {
  return <AccountShell wide><PuppyShop /></AccountShell>;
}
