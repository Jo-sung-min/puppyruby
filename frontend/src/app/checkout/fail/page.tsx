import type { Metadata } from "next";
import { AccountShell } from "@/components/account/account-shell";
import { PaymentFailure } from "@/components/commerce/payment-result";
export const metadata: Metadata = { title: "결제 안내 · PuppyRuby", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function FailPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const params = await searchParams;
  return <AccountShell><PaymentFailure code={typeof params.code === "string" ? params.code : ""} /></AccountShell>;
}
