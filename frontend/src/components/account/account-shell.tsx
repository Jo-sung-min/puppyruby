import Link from "next/link";
import { ArrowUpRight, PawPrint } from "lucide-react";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/theme-provider";

export function AccountShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="account-site">
      <a className="skip-link" href="#account-content">본문으로 바로 가기</a>
      <header className="account-header">
        <Link href="/" className="account-brand" aria-label="퍼피루비 홈">
          <PawPrint size={26} aria-hidden="true" />
          <span>Puppy<span>Ruby</span><small>작은 강아지와 함께하는 하루</small></span>
        </Link>
        <div className="account-header-actions">
          <Link href="/play" className="account-header-link">강아지 만나러 가기 <ArrowUpRight size={15} aria-hidden="true" /></Link>
          <ThemeToggle compact className="account-theme-toggle" />
        </div>
      </header>
      <main id="account-content" className={`account-main${wide ? " account-main-wide" : ""}`}>
        {children}
      </main>
    </div>
  );
}
