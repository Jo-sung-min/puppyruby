import type { Metadata } from "next";
import { AccountShell } from "@/components/account/account-shell";
import { PaymentResult } from "@/components/commerce/payment-result";
export const metadata: Metadata = { title: "결제 확인 · PuppyRuby", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function SuccessPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const text = (key: string) => typeof params[key] === "string" ? params[key] as string : "";
  return <AccountShell><PaymentResult orderId={text("orderId")} paymentKey={text("paymentKey")} amount={text("amount")} /></AccountShell>;
}
