import type { Metadata } from "next";
import { AccountShell } from "@/components/account/account-shell";
import { AdminDashboard } from "@/components/account/admin-dashboard";

export const metadata: Metadata = { title: "관리자 · PuppyRuby", robots: { index: false, follow: false } };

export default function AdminPage() {
  return <AccountShell wide><AdminDashboard /></AccountShell>;
}
