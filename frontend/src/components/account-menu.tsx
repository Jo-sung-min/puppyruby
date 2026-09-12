"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LogIn, ShieldCheck, UserRound } from "lucide-react";
import { authFetch, type AccountSession, type AccountUser } from "@/lib/account";

export function AccountMenu({ compact = false, sidebar = false }: { compact?: boolean; sidebar?: boolean }) {
  const [user, setUser] = useState<AccountUser | null>(null);
  useEffect(() => {
    let alive = true;
    let revision = 0;
    async function refresh() {
      const current = ++revision;
      try {
        const session = await authFetch<AccountSession>("me");
        if (alive && current === revision) setUser(session.user);
      } catch { if (alive && current === revision) setUser(null); }
    }
    const visible = () => { if (!document.hidden) void refresh(); };
    void refresh();
    window.addEventListener("puppyruby-auth-changed", refresh);
    document.addEventListener("visibilitychange", visible);
    return () => { alive = false; window.removeEventListener("puppyruby-auth-changed", refresh); document.removeEventListener("visibilitychange", visible); };
  }, []);

  if (compact) return <Link className="account-quick-link" href={user ? "/account/me" : "/account"} aria-label={user ? `${user.displayName} 마이페이지` : "로그인과 회원가입"} title={user ? "마이페이지" : "로그인 / 회원가입"}><UserRound size={18} /></Link>;

  return <div className={`account-menu${sidebar ? " account-menu-sidebar" : ""}`}>
    {user ? <>
      <Link href="/account/me" className="account-menu-main"><UserRound size={16} /><span>{sidebar ? user.displayName : "마이페이지"}</span></Link>
      {sidebar && <small>우리 강아지와 함께하는 집사님</small>}
      {user.role === "ADMIN" && <Link href="/admin" className="account-menu-admin"><ShieldCheck size={14} />관리자</Link>}
    </> : <>
      <Link href="/account" className="account-menu-main"><LogIn size={15} />로그인</Link>
      <Link href="/account?mode=signup" className="account-menu-signup">회원가입</Link>
      {sidebar && <small>지금 키우는 강아지를 계정에 저장해요.</small>}
    </>}
  </div>;
}
