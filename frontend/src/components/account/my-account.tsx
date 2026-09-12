"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Check, Heart, KeyRound, LogOut, Mail, MessageCircle, Monitor, PawPrint, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { accountChanged, accountDate, accountErrorMessage, authFetch, isAccountAccessError, passwordProblem, type AccountResult, type AccountUser, type MessageResult } from "@/lib/account";
import { breeds, requestGame, type GameState } from "@/lib/game";
import { DesktopLink } from "@/components/desktop-link";
import { PuppySprite } from "@/components/puppy-sprite";
import { AccountAccess, AccountFailure, AccountLoading, AccountNotice, SubmitLabel } from "./account-ui";
import { useAccountSession } from "./use-account-session";

export function MyAccount({ kakaoConnected = false }: { kakaoConnected?: boolean }) {
  const router = useRouter();
  const { session, loading, error, unauthorized, forbidden, refresh } = useAccountSession();
  const [game, setGame] = useState<GameState | null>(null);
  const [gameError, setGameError] = useState("");
  const [gameLoading, setGameLoading] = useState(false);
  const [gameRevision, setGameRevision] = useState(0);
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState("");
  const pending = useRef(false);
  const announcedKakao = useRef(false);
  const user = session?.user;
  const userId = user?.status === "ACTIVE" ? user.id : null;

  useEffect(() => {
    if (!kakaoConnected || announcedKakao.current) return;
    announcedKakao.current = true;
    accountChanged();
    router.replace("/account/me");
  }, [kakaoConnected, router]);

  useEffect(() => {
    let disposed = false;
    setGame(null);
    setGameError("");
    if (!userId) { setGameLoading(false); return; }
    setGameLoading(true);
    requestGame<GameState>()
      .then(result => { if (!disposed) setGame(result); })
      .catch(problem => { if (!disposed) setGameError(accountErrorMessage(problem)); })
      .finally(() => { if (!disposed) setGameLoading(false); });
    return () => { disposed = true; };
  }, [userId, gameRevision]);

  async function simpleAction(action: "logout" | "verify-email/request") {
    if (pending.current) return;
    pending.current = true;
    setBusy(action);
    setActionError("");
    setNotice("");
    try {
      const result = await authFetch<MessageResult>(action, {});
      if (action === "logout") {
        accountChanged();
        router.replace("/account");
        router.refresh();
      } else setNotice(result.message);
    } catch (problem) {
      if (isAccountAccessError(problem)) accountChanged();
      setActionError(accountErrorMessage(problem));
    } finally {
      pending.current = false;
      setBusy("");
    }
  }

  if (loading) return <AccountLoading />;
  if (unauthorized || (!error && !user)) return <AccountAccess />;
  if (forbidden || user?.status === "SUSPENDED") return <AccountAccess suspended />;
  if (error) return <AccountFailure message={accountErrorMessage(error)} retry={refresh} />;
  if (!user || !session) return <AccountAccess />;
  const selected = game?.puppies.find(puppy => puppy.id === game.selectedId) || game?.puppies[0];

  return (
    <div className="account-dashboard">
      <div className="account-page-heading">
        <div><span className="account-kicker">MY LITTLE DAYS</span><h1>나의 퍼피루비</h1><p>{user.displayName}님과 강아지의 소중한 일상.</p></div>
        <div className="account-heading-actions">
          {user.role === "ADMIN" && <Link href="/admin" className="account-button account-button-soft"><ShieldCheck size={15} aria-hidden="true" /> 관리자</Link>}
          <button type="button" className="account-text-button" onClick={() => void simpleAction("logout")} disabled={!!busy}><SubmitLabel busy={busy === "logout"}><LogOut size={15} aria-hidden="true" /> 로그아웃</SubmitLabel></button>
        </div>
      </div>
      <AccountNotice kind="success">{notice}</AccountNotice>
      <AccountNotice kind="error">{actionError}</AccountNotice>

      <div className="account-profile-grid">
        <section className="account-card" aria-labelledby="profile-heading">
          <div className="account-section-heading"><span className="account-section-icon"><UserRound size={18} aria-hidden="true" /></span><div><h2 id="profile-heading">내 프로필</h2><p>퍼피루비에서 사용할 별명이에요.</p></div></div>
          <div className="account-profile-summary"><span className="account-avatar" aria-hidden="true">{[...user.displayName][0] || "멍"}</span><div><strong>{user.displayName}</strong><small>{accountDate(user.createdAt)}부터 함께했어요</small></div></div>
          <ProfileForm user={user} onSaved={message => { setNotice(message); accountChanged(); }} />
        </section>

        <section className="account-card" aria-labelledby="login-method-heading">
          <div className="account-section-heading"><span className="account-section-icon"><ShieldCheck size={18} aria-hidden="true" /></span><div><h2 id="login-method-heading">로그인 수단</h2><p>지금 연결된 계정을 확인해요.</p></div></div>
          <div className="account-provider-row">
            <span className={`account-provider-icon${user.provider === "KAKAO" ? " account-provider-kakao" : ""}`}>{user.provider === "KAKAO" ? <MessageCircle size={19} aria-hidden="true" /> : <Mail size={19} aria-hidden="true" />}</span>
            <div><strong>{user.provider === "KAKAO" ? "카카오" : "이메일"} 로그인</strong><p>{user.email || "연결된 카카오 계정으로 로그인해요."}</p></div>
            <span className="account-badge account-badge-green"><Check size={12} aria-hidden="true" /> 연결됨</span>
          </div>
          {user.email && <div className="account-verification">
            <div><strong>이메일 인증</strong><span className={`account-badge ${user.emailVerified ? "account-badge-green" : "account-badge-amber"}`}>{user.emailVerified ? "인증 완료" : "인증 대기"}</span></div>
            <p>{user.emailVerified ? "내 이메일 확인이 끝났어요." : "인증을 마치면 내 계정을 더 편하게 이용할 수 있어요."}</p>
            {!user.emailVerified && <>
              <button type="button" className="account-button account-button-soft" disabled={!!busy || !session.config.emailEnabled} onClick={() => void simpleAction("verify-email/request")}>
                <SubmitLabel busy={busy === "verify-email/request"}><Mail size={15} aria-hidden="true" /> 인증 메일 받기</SubmitLabel>
              </button>
              {!session.config.emailEnabled && <p className="account-small-note">메일 발송을 준비하고 있어요. 준비가 끝나면 인증 메일을 받을 수 있어요.</p>}
            </>}
          </div>}
        </section>
      </div>

      <section className="account-card account-dogs-section" aria-labelledby="account-dogs-heading">
        <div className="account-section-heading">
          <span className="account-section-icon"><PawPrint size={19} aria-hidden="true" /></span>
          <div><h2 id="account-dogs-heading">함께하는 강아지</h2><p>매일 쌓아 온 작은 성장을 한눈에.</p></div>
          <Link href="/play" className="account-text-link">만나러 가기 <ArrowRight size={14} aria-hidden="true" /></Link>
        </div>
        {gameLoading ? <AccountLoading label="강아지의 하루를 불러오고 있어요." /> : gameError ? <AccountFailure message={gameError} retry={() => setGameRevision(value => value + 1)} /> : game && <>
          <div className="account-growth-summary">
            <div><PawPrint size={17} aria-hidden="true" /><strong>{game.puppies.length.toLocaleString()}</strong><span>함께하는 친구</span></div>
            <div><Heart size={17} aria-hidden="true" /><strong>{game.careCount.toLocaleString()}</strong><span>마음을 나눈 돌봄</span></div>
            <div><Sparkles size={17} aria-hidden="true" /><strong>{game.trainingCount.toLocaleString()}</strong><span>함께 배운 훈련</span></div>
          </div>
          {game.puppies.length ? <div className="account-dog-grid">{game.puppies.map(puppy => (
            <article className={`account-dog-card${puppy.id === game.selectedId ? " account-dog-selected" : ""}`} key={puppy.id}>
              <div className="account-dog-art"><PuppySprite puppy={puppy} decorative /><span className={`grade grade-${puppy.grade}`}>{puppy.grade}</span></div>
              <div className="account-dog-name"><h3>{puppy.name}</h3>{puppy.id === game.selectedId && <span className="account-badge">지금 함께</span>}</div>
              <p>{breeds[puppy.breed]?.name || "강아지"}</p>
              <div className="account-dog-xp"><span>성장 경험치</span><strong>{puppy.xp.toLocaleString()} XP</strong></div>
              <div className="account-dog-mood"><span>행복 {puppy.happiness}%</span><span>체력 {puppy.energy}%</span></div>
            </article>
          ))}</div> : <p className="account-empty">아직 함께하는 강아지가 없어요. 첫 친구를 만나러 가 볼까요?</p>}
        </>}
      </section>

      <section className="account-pc-section" aria-labelledby="account-pc-heading">
        <div className="account-section-heading"><span className="account-section-icon"><Monitor size={18} aria-hidden="true" /></span><div><h2 id="account-pc-heading">연결된 PC 관리</h2><p>바탕화면에서도 같은 강아지와 함께해요.</p></div></div>
        {selected ? <DesktopLink puppy={selected} /> : <p className="account-card account-empty">강아지를 불러오면 연결된 PC를 관리할 수 있어요.</p>}
      </section>

      <section className="account-card account-password-section" aria-labelledby="account-security-heading">
        <div className="account-section-heading">
          <span className="account-section-icon"><KeyRound size={18} aria-hidden="true" /></span>
          <div><h2 id="account-security-heading">계정 보안</h2><p>{user.provider === "EMAIL" ? "비밀번호를 새로 바꿀 수 있어요." : "카카오 계정으로 안전하게 로그인하고 있어요."}</p></div>
        </div>
        {user.provider === "EMAIL" ? <PasswordForm onSaved={() => { accountChanged(); router.replace("/account?notice=password_changed"); router.refresh(); }} /> : <p className="account-small-note">카카오 로그인 계정은 카카오에서 비밀번호를 관리해 주세요.</p>}
      </section>
    </div>
  );
}

function ProfileForm({ user, onSaved }: { user: AccountUser; onSaved: (message: string) => void }) {
  const [name, setName] = useState(user.displayName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    if (!name.trim()) { setError("사용할 별명을 입력해 주세요."); return; }
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await authFetch<AccountResult>("profile", { displayName: name.trim() });
      onSaved(result.message);
    } catch (problem) {
      if (isAccountAccessError(problem)) accountChanged();
      setError(accountErrorMessage(problem));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <form className="account-form" onSubmit={submit}>
      <label className="account-field" htmlFor="profile-display-name">별명
        <input id="profile-display-name" name="displayName" autoComplete="nickname" value={name} onChange={event => setName(event.target.value)} maxLength={40} required disabled={busy} aria-describedby="profile-name-hint" />
        <small id="profile-name-hint">1~40자, 실명 대신 편한 이름을 사용해요.</small>
      </label>
      <AccountNotice kind="error">{error}</AccountNotice>
      <button type="submit" className="account-button account-button-soft" disabled={busy || name.trim() === user.displayName}><SubmitLabel busy={busy}>별명 저장</SubmitLabel></button>
    </form>
  );
}

function PasswordForm({ onSaved }: { onSaved: () => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const invalid = passwordProblem(newPassword);
    if (invalid) { setError(invalid); return; }
    if (newPassword !== confirmation) { setError("두 비밀번호가 달라요. 다시 확인해 주세요."); return; }
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await authFetch<MessageResult>("password", { currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmation("");
      onSaved();
    } catch (problem) {
      if (isAccountAccessError(problem)) accountChanged();
      setError(accountErrorMessage(problem));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <form className="account-form" onSubmit={submit}>
      <div className="account-password-fields">
        <label className="account-field" htmlFor="security-current-password">현재 비밀번호
          <input id="security-current-password" name="currentPassword" type="password" autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} required disabled={busy} />
        </label>
        <label className="account-field" htmlFor="security-new-password">새 비밀번호
          <input id="security-new-password" name="newPassword" type="password" autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} required placeholder="8자 이상 입력해 주세요" disabled={busy} />
        </label>
        <label className="account-field" htmlFor="security-confirm-password">새 비밀번호 확인
          <input id="security-confirm-password" name="confirmPassword" type="password" autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} required disabled={busy} />
        </label>
      </div>
      <p className="account-small-note">변경하면 모든 기기에서 로그아웃돼요. 새 비밀번호로 다시 로그인해 주세요.</p>
      <AccountNotice kind="error">{error}</AccountNotice>
      <button type="submit" className="account-button account-button-soft" disabled={busy}><SubmitLabel busy={busy}>비밀번호 변경</SubmitLabel></button>
    </form>
  );
}
