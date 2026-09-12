import type { Metadata } from "next";
import { AccountShell } from "@/components/account/account-shell";
import { MyAccount } from "@/components/account/my-account";

export const metadata: Metadata = { title: "마이페이지 · PuppyRuby", robots: { index: false, follow: false } };

export default async function MyAccountPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  return <AccountShell wide><MyAccount kakaoConnected={query.connected === "kakao"} /></AccountShell>;
}
