"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { ArrowRight, Heart, Mail, MessageCircle } from "lucide-react";
import { AccountError, accountChanged, accountErrorMessage, authFetch, passwordProblem, type AccountResult } from "@/lib/account";
import { PuppySprite } from "@/components/puppy-sprite";
import { AccountFailure, AccountLoading, AccountNotice, SubmitLabel } from "./account-ui";
import { useAccountSession } from "./use-account-session";

const callbackErrors: Record<string, string> = {
  kakao_cancelled: "카카오 로그인을 취소했어요. 원하는 방법으로 다시 로그인해 주세요.",
  kakao_denied: "카카오 로그인을 취소했어요. 원하는 방법으로 다시 로그인해 주세요.",
  kakao_unavailable: "카카오 로그인을 준비하고 있어요. 이메일로 시작할 수 있어요.",
  kakao_failed: "카카오 로그인을 완료하지 못했어요. 다시 시도해 주세요.",
  kakao_state: "로그인 요청이 만료됐어요. 다시 시작해 주세요.",
  kakao_invalid_state: "로그인 요청이 만료됐어요. 다시 시작해 주세요.",
  invalid_state: "로그인 요청이 만료됐어요. 다시 시작해 주세요.",
  suspended: "현재 이용이 제한된 계정이에요.",
};

export function AccountEntry({ initialMode = "login", callbackError = "", passwordChanged = false }: { initialMode?: "login" | "register"; callbackError?: string; passwordChanged?: boolean }) {
  const router = useRouter();
  const { session, loading, error: sessionError, refresh } = useAccountSession();
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const isRegister = mode === "register";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    if (isRegister) {
      const invalid = passwordProblem(password);
      if (invalid) { setError(invalid); return; }
      if (password !== confirmation) { setError("두 비밀번호가 달라요. 다시 확인해 주세요."); return; }
      if (!displayName.trim()) { setError("사용할 별명을 입력해 주세요."); return; }
    }
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await authFetch<AccountResult>(mode, isRegister
        ? { email: email.trim(), password, displayName: displayName.trim() }
        : { email: email.trim(), password });
      setPassword("");
      setConfirmation("");
      accountChanged();
      router.replace("/account/me");
      router.refresh();
    } catch (problem) {
      setError(accountErrorMessage(problem));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  function switchMode(next: "login" | "register") {
    if (pending.current) return;
    setMode(next);
    setPassword("");
    setConfirmation("");
    setError("");
  }

  return (
    <div className="account-entry-layout">
      <section className="account-welcome" aria-labelledby="account-welcome-title">
        <span className="account-kicker"><Heart size={13} aria-hidden="true" /> A LITTLE HOME FOR YOU</span>
        <h1 id="account-welcome-title">우리의 작은 하루,<br /><em>계속 함께해요.</em></h1>
        <p>다시 만날 때도 반갑게 꼬리를 흔들어요.<br />내 강아지와 함께하는 퍼피루비.</p>
        <div className="account-welcome-art" aria-hidden="true">
          <span className="account-art-speech">기다리고 있었다 멍!</span>
          <PuppySprite puppy={{ breed: 0 }} decorative />
          <span className="account-art-flower">✳</span>
        </div>
        <span className="account-welcome-footnote">작은 친구, 오래 함께할 기억.</span>
      </section>

      <section className="account-card account-entry-card" aria-label="회원 로그인과 가입">
        {loading ? <AccountLoading /> : session?.user?.status === "ACTIVE" ? (
          <div className="account-state">
            <span className="account-kicker">WELCOME BACK</span>
            <h2>{session.user.displayName}님, 반가워요.</h2>
            <p>이미 로그인되어 있어요.<br />내 강아지와 함께한 기록을 만나 보세요.</p>
            <Link href="/account/me" className="account-button">마이페이지로 <ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
        ) : (
          <>
            <div className="account-tabs" aria-label="로그인 또는 회원가입 선택">
              <button type="button" aria-pressed={!isRegister} onClick={() => switchMode("login")} disabled={busy}>로그인</button>
              <button type="button" aria-pressed={isRegister} onClick={() => switchMode("register")} disabled={busy}>회원가입</button>
            </div>
            <h2>{isRegister ? "반가워요, 새 집사님!" : "어서 와요, 집사님!"}</h2>
            <p className="account-lead">{isRegister ? "이메일과 별명으로 가볍게 시작해요." : "내 강아지가 기다리고 있어요."}</p>
            {sessionError instanceof AccountError && sessionError.status === 401 && <AccountNotice>로그인이 만료됐어요. 다시 로그인해 주세요.</AccountNotice>}
            {passwordChanged && <AccountNotice kind="success">비밀번호를 변경하고 모든 기기에서 로그아웃했어요. 새 비밀번호로 로그인해 주세요.</AccountNotice>}
            {callbackError && <AccountNotice kind="error">{callbackErrors[callbackError] || "로그인을 완료하지 못했어요. 다시 시도해 주세요."}</AccountNotice>}
            <form onSubmit={submit} className="account-form">
              {isRegister && <label className="account-field" htmlFor="account-display-name">별명
                <input id="account-display-name" name="displayName" value={displayName} onChange={event => setDisplayName(event.target.value)} required maxLength={40} autoComplete="nickname" placeholder="강아지가 불러 줄 이름" disabled={busy} />
              </label>}
              <label className="account-field" htmlFor="account-email">이메일
                <input id="account-email" name="email" type="email" inputMode="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required maxLength={254} placeholder="hello@example.com" disabled={busy} />
              </label>
              <label className="account-field" htmlFor="account-password">비밀번호
                <input
                  id="account-password" name="password" type="password"
                  autoComplete={isRegister ? "new-password" : "current-password"}
                  value={password} onChange={event => setPassword(event.target.value)} required
                  placeholder={isRegister ? "8자 이상 입력해 주세요" : "비밀번호를 입력해 주세요"}
                  aria-describedby={isRegister ? "account-password-hint" : undefined} disabled={busy}
                />
                {isRegister && <small id="account-password-hint">8자 이상으로 만들어 주세요. 다른 곳에서 쓰지 않는 비밀번호가 좋아요.</small>}
              </label>
              {isRegister && <label className="account-field" htmlFor="account-confirm-password">비밀번호 확인
                <input
                  id="account-confirm-password" name="confirmPassword" type="password" autoComplete="new-password"
                  value={confirmation} onChange={event => setConfirmation(event.target.value)}
                  required placeholder="한 번 더 입력해 주세요" disabled={busy}
                />
              </label>}
              <AccountNotice kind="error">{error}</AccountNotice>
              <button className="account-button account-button-full" type="submit" disabled={busy}>
                <SubmitLabel busy={busy}>{isRegister ? "퍼피루비 시작하기" : "로그인"}</SubmitLabel>
                {!busy && <ArrowRight size={16} aria-hidden="true" />}
              </button>
            </form>
            {!isRegister && <Link className="account-forgot" href="/account/reset">비밀번호를 잊었나요?</Link>}
            <div className="account-divider"><span>또는</span></div>
            {session?.config.kakaoEnabled ? (
              <a className="account-kakao" href="/api/auth/kakao/start"><MessageCircle size={19} fill="currentColor" aria-hidden="true" /> 카카오로 시작하기</a>
            ) : (
              <>
                <button type="button" className="account-kakao" disabled><MessageCircle size={19} fill="currentColor" aria-hidden="true" /> 카카오로 시작하기</button>
                {!sessionError && <p className="account-small-note">카카오 로그인을 준비하고 있어요. 이메일로 먼저 만나요.</p>}
              </>
            )}
            {sessionError && <AccountFailure message="로그인 방법을 불러오지 못했어요. 이메일로 로그인하거나 다시 확인해 주세요." retry={refresh} />}
            <p className="account-private-note"><Mail size={13} aria-hidden="true" /> 실명 대신, 편한 별명으로 함께해요.</p>
          </>
        )}
      </section>
    </div>
  );
}
