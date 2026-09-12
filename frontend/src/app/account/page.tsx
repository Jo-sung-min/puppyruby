import type { Metadata } from "next";
import { AccountShell } from "@/components/account/account-shell";
import { AccountEntry } from "@/components/account/account-entry";

export const metadata: Metadata = { title: "로그인 · PuppyRuby", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function AccountPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  return (
    <AccountShell>
      <AccountEntry
        initialMode={query.mode === "signup" || query.tab === "register" ? "register" : "login"}
        callbackError={typeof query.error === "string" ? query.error : ""}
        passwordChanged={query.notice === "password_changed"}
      />
    </AccountShell>
  );
}
