"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { ArrowLeft, CheckCircle2, KeyRound, Mail } from "lucide-react";
import { accountChanged, accountErrorMessage, authFetch, passwordProblem, type MessageResult } from "@/lib/account";
import { AccountFailure, AccountLoading, AccountNotice, SubmitLabel } from "./account-ui";
import { useAccountSession } from "./use-account-session";

export function AccountRecovery({ kind, token }: { kind: "verify" | "reset"; token: string }) {
  const { session, loading, error: configError, refresh } = useAccountSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const pending = useRef(false);
  const verifying = kind === "verify";
  const requesting = !verifying && !token;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || done) return;
    if (!requesting && !verifying) {
      const invalid = passwordProblem(password);
      if (invalid) { setError(invalid); return; }
      if (password !== confirmation) { setError("두 비밀번호가 달라요. 다시 확인해 주세요."); return; }
    }
    pending.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const path = verifying ? "verify-email/confirm" : requesting ? "password-reset/request" : "password-reset/confirm";
      const body = verifying ? { token } : requesting ? { email: email.trim() } : { token, password };
      const result = await authFetch<MessageResult>(path, body);
      setMessage(result.message);
      setDone(true);
      setPassword("");
      setConfirmation("");
      if (!requesting) {
        window.history.replaceState(null, "", verifying ? "/account/verify" : "/account/reset");
        accountChanged();
      }
    } catch (problem) {
      setError(accountErrorMessage(problem));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="account-card account-recovery-card" aria-labelledby="recovery-title">
      <span className="account-feature-icon">{verifying ? <Mail size={25} aria-hidden="true" /> : <KeyRound size={25} aria-hidden="true" />}</span>
      <span className="account-kicker">{verifying ? "ONE LAST HELLO" : "WELCOME BACK"}</span>
      <h1 id="recovery-title">{verifying ? "이메일 인증" : "비밀번호 다시 만들기"}</h1>
      <p className="account-lead">{verifying ? "이 이메일이 내 이메일인지 확인해요." : requesting ? "가입한 이메일로 비밀번호 변경 링크를 보내 드려요." : "앞으로 사용할 새 비밀번호를 입력해 주세요."}</p>
      {done ? (
        <div className="account-recovery-result">
          <CheckCircle2 size={35} aria-hidden="true" />
          <AccountNotice kind="success">{message}</AccountNotice>
          {requesting && <p>메일이 보이지 않으면 스팸함도 확인해 주세요.<br />링크는 받은 뒤 30분 동안 사용할 수 있어요.</p>}
          <Link href={verifying ? "/account/me" : "/account"} className="account-button">{verifying ? "마이페이지로" : "로그인으로"}</Link>
        </div>
      ) : verifying && !token ? (
        <>
          <AccountNotice kind="error">인증 링크가 없어요. 마이페이지에서 인증 메일을 다시 받아 주세요.</AccountNotice>
          <Link href="/account/me" className="account-button">마이페이지로</Link>
        </>
      ) : requesting && loading ? <AccountLoading label="메일 발송이 가능한지 확인하고 있어요." />
        : requesting && configError ? <AccountFailure message={accountErrorMessage(configError)} retry={refresh} />
          : requesting && !session?.config.emailEnabled ? (
            <AccountNotice>메일 발송을 준비하고 있어요. 준비가 끝나면 비밀번호를 다시 만들 수 있어요.</AccountNotice>
          ) : (
            <form className="account-form" onSubmit={submit}>
              {requesting && <label className="account-field" htmlFor="reset-email">가입한 이메일
                <input id="reset-email" type="email" name="email" autoComplete="email" inputMode="email" value={email} onChange={event => setEmail(event.target.value)} required maxLength={254} placeholder="hello@example.com" disabled={busy} />
              </label>}
              {!requesting && !verifying && <>
                <label className="account-field" htmlFor="reset-password">새 비밀번호
                  <input id="reset-password" type="password" name="newPassword" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} required aria-describedby="reset-password-hint" disabled={busy} />
                  <small id="reset-password-hint">8자 이상으로 입력해 주세요.</small>
                </label>
                <label className="account-field" htmlFor="reset-confirmation">새 비밀번호 확인
                  <input id="reset-confirmation" type="password" name="confirmPassword" autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} required disabled={busy} />
                </label>
                <p className="account-small-note">변경하면 모든 기기에서 로그아웃돼요. 새 비밀번호로 다시 로그인해 주세요.</p>
              </>}
              <AccountNotice kind="error">{error}</AccountNotice>
              <button type="submit" className="account-button account-button-full" disabled={busy}>
                <SubmitLabel busy={busy}>{verifying ? "내 이메일 인증하기" : requesting ? "변경 링크 받기" : "새 비밀번호 저장"}</SubmitLabel>
              </button>
              {error && token && <Link className="account-text-link" href={verifying ? "/account/me" : "/account/reset"}>새 {verifying ? "인증 메일" : "변경 링크"} 받기</Link>}
            </form>
          )}
      <Link href="/account" className="account-back-link"><ArrowLeft size={14} aria-hidden="true" /> 로그인으로 돌아가기</Link>
    </section>
  );
}
