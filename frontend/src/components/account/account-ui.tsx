"use client";

import Link from "next/link";
import { AlertCircle, CheckCircle2, LoaderCircle, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

export function AccountNotice({ children, kind = "info" }: { children: ReactNode; kind?: "info" | "error" | "success" }) {
  if (!children) return null;
  return (
    <div className={`account-notice account-notice-${kind}`} role={kind === "error" ? "alert" : "status"}>
      {kind === "success" ? <CheckCircle2 size={17} aria-hidden="true" /> : <AlertCircle size={17} aria-hidden="true" />}
      <div>{children}</div>
    </div>
  );
}

export function AccountLoading({ label = "계정을 확인하고 있어요." }: { label?: string }) {
  return <div className="account-state" role="status"><LoaderCircle className="spin" size={26} aria-hidden="true" /><p>{label}</p></div>;
}

export function AccountFailure({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="account-state">
      <AccountNotice kind="error">{message}</AccountNotice>
      <button type="button" className="account-button account-button-soft" onClick={retry}><RefreshCw size={15} aria-hidden="true" /> 다시 시도</button>
    </div>
  );
}

export function AccountAccess({ suspended = false, forbidden = false }: { suspended?: boolean; forbidden?: boolean }) {
  return (
    <div className="account-state account-card">
      <span className="account-kicker">MY LITTLE COMPANION</span>
      <h1>{suspended ? "이용이 제한된 계정이에요" : forbidden ? "관리자만 들어올 수 있어요" : "로그인하고 이어서 만나요"}</h1>
      <p>{suspended ? "현재 계정으로 서비스를 이용할 수 없어요." : forbidden ? "회원 관리와 산책방 관리는 관리자 계정에서 이용할 수 있어요." : "내 강아지와 함께한 기록을 확인할 수 있어요."}</p>
      <Link href={forbidden ? "/account/me" : "/account"} className="account-button">{forbidden ? "마이페이지로" : "로그인 화면으로"}</Link>
    </div>
  );
}

export function SubmitLabel({ busy, children }: { busy: boolean; children: ReactNode }) {
  return <>{busy && <LoaderCircle size={16} className="spin" aria-hidden="true" />}{children}</>;
}
