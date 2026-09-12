import type { Metadata } from "next";
import { AccountShell } from "@/components/account/account-shell";
import { AccountRecovery } from "@/components/account/account-recovery";

export const metadata: Metadata = { title: "비밀번호 다시 만들기 · PuppyRuby", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function ResetPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  return <AccountShell><AccountRecovery kind="reset" token={typeof query.token === "string" ? query.token : ""} /></AccountShell>;
}
