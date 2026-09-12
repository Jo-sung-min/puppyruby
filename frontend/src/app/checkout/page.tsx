import type { Metadata } from "next";
import { AccountShell } from "@/components/account/account-shell";
import { TossCheckout } from "@/components/commerce/toss-checkout";
export const metadata: Metadata = { title: "뽑기권 구매 · PuppyRuby", robots: { index: false, follow: false } };
export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ product?: string }> }) {
  const params = await searchParams;
  return <AccountShell><TossCheckout productId={typeof params.product === "string" ? params.product : ""} /></AccountShell>;
}
