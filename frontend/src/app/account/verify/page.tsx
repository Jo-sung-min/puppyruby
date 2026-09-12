import type { Metadata } from "next";
import { AccountShell } from "@/components/account/account-shell";
import { AccountRecovery } from "@/components/account/account-recovery";

export const metadata: Metadata = { title: "이메일 인증 · PuppyRuby", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function VerifyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  return <AccountShell><AccountRecovery kind="verify" token={typeof query.token === "string" ? query.token : ""} /></AccountShell>;
}
