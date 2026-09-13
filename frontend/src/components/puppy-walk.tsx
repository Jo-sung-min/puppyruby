"use client";

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowDown, ArrowLeft, ArrowUpRight, Check, ChevronRight, Clock3, Heart, ImagePlus, Leaf, LoaderCircle, LockKeyhole, MapPin, MessageCircle, Moon, PawPrint, Plus, RefreshCw, Search, Send, Settings2, ShieldCheck, Sun, TreePine, UserRound, UserRoundCheck, UserRoundPlus, UsersRound, X } from "lucide-react";
import type { Puppy } from "@/lib/game";
import { ownerLabel, requestWalk, walkThemes, type WalkAction, type WalkActionInput, type WalkMe, type WalkProfile, type WalkResult, type WalkRoomSummary, type WalkState, type WalkTheme } from "@/lib/walk";
import { getWalkTime, walkSchedule, type WalkTime } from "@/lib/walk-time";
import { getImageUploadConfig, safeProfilePhoto, uploadProfilePhoto, type ImageUploadConfig, type ImageUploadStage } from "@/lib/image-upload";
import { useAccountSession } from "./account/use-account-session";
import { PuppySprite } from "./puppy-sprite";

type Mutate = (action: WalkAction, values?: WalkActionInput) => Promise<WalkResult | undefined>;
const themeIds: WalkTheme[] = ["meadow", "sunset", "night"];
const themeIcon = (theme: WalkTheme, size = 16) => theme === "night" ? <Moon size={size} /> : theme === "sunset" ? <Sun size={size} /> : <Leaf size={size} />;
function stableSeed(id: string) { return Array.from(id).reduce((seed, letter) => (seed * 31 + letter.charCodeAt(0)) >>> 0, 7); }
function displayTime(value: number) { return new Date(value).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }); }
function safePhoto(profile: WalkProfile) { return profile.friendship === "self" || profile.friendship === "friend" ? safeProfilePhoto(profile.photo) : null; }

function useWalkTime() {
  const [time, setTime] = useState<WalkTime | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    function update() {
      clearTimeout(timer);
      if (document.hidden) return;
      const now = Date.now();
      setTime(getWalkTime(now));
      timer = setTimeout(update, 60_000 - now % 60_000 + 25);
    }
    update(); document.addEventListener("visibilitychange", update); window.addEventListener("focus", update);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", update); window.removeEventListener("focus", update); };
  }, []);
  return time;
}

function WalkStars() {
  return <svg className="walk-stars" viewBox="0 0 600 180" preserveAspectRatio="none" aria-hidden="true"><g fill="currentColor">{Array.from({ length: 29 }, (_, index) => {
    const x = 13 + (index * 83) % 575, y = 9 + (index * 47) % 152;
    return index % 6 === 0 ? <path key={index} d={`M${x} ${y - 3}v6m-3-3h6`} stroke="currentColor" strokeWidth="1.4" style={{ animationDelay: `${-(index % 7)}s` }} /> : <circle key={index} cx={x} cy={y} r={index % 3 === 0 ? 1.5 : .85} style={{ animationDelay: `${-(index % 7)}s` }} />;
  })}</g></svg>;
}

function WalkSchedule({ time }: { time: WalkTime }) {
  return <section className="walk-time-panel" aria-label="한국 시간에 따른 산책 풍경"><div className="walk-time-heading"><span>{themeIcon(time.theme, 18)}<strong>지금은 {time.label}</strong></span><time>한국 시간 {time.clock}</time></div><ol className="walk-time-slots">{walkSchedule.map(slot => <li key={slot.period} aria-current={time.period === slot.period ? "time" : undefined}><span>{themeIcon(slot.theme, 15)}{slot.label}{time.period === slot.period && <i>지금</i>}</span><strong>{slot.hours}</strong></li>)}</ol><p>모든 산책방의 풍경이 한국 시간에 맞춰 자동으로 바뀌어요.</p></section>;
}

function WalkDialog({ title, children, onClose, busy = false, wide = false }: { title: string; children: ReactNode; onClose: () => void; busy?: boolean; wide?: boolean }) {
  const heading = useId();
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose); close.current = onClose;
  const blocked = useRef(busy); blocked.current = busy;
  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const first = panel.current?.querySelector<HTMLElement>("input, button:not([disabled]), textarea, select");
    (first || panel.current)?.focus();
    function keyboard(event: KeyboardEvent) {
      if (event.key === "Escape" && !blocked.current) { event.preventDefault(); close.current(); }
      if (event.key !== "Tab" || !panel.current) return;
      const focusable = Array.from(panel.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex='0']"));
      const firstItem = focusable[0], lastItem = focusable[focusable.length - 1];
      if (!firstItem) { event.preventDefault(); panel.current.focus(); }
      else if (event.shiftKey && (document.activeElement === firstItem || document.activeElement === panel.current)) { event.preventDefault(); lastItem.focus(); }
      else if (!event.shiftKey && document.activeElement === lastItem) { event.preventDefault(); firstItem.focus(); }
    }
    document.addEventListener("keydown", keyboard);
    return () => { document.removeEventListener("keydown", keyboard); document.body.style.overflow = previousOverflow; before?.focus(); };
  }, []);
  return <div className="walk-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}><div className={`walk-modal ${wide ? "walk-modal-wide" : ""}`} ref={panel} role="dialog" aria-modal="true" aria-labelledby={heading} tabIndex={-1}><div className="walk-modal-heading"><div><span className="walk-kicker"><PawPrint size={12} /> PUPPY NEIGHBORS</span><h2 id={heading}>{title}</h2></div><button className="walk-icon-button" onClick={onClose} disabled={busy} aria-label="창 닫기"><X size={19} /></button></div>{children}</div></div>;
}

function Avatar({ profile, size = "normal" }: { profile: WalkProfile; size?: "normal" | "large" }) {
  const photo = safePhoto(profile);
  return <span className={`walk-avatar walk-avatar-${size}`}>{photo ? <img src={photo} referrerPolicy="no-referrer" alt={`${profile.nickname}의 프로필 사진`} /> : <UserRound size={size === "large" ? 29 : 18} />}</span>;
}

function ProfileEditor({ me, puppy, busy, mutate, onClose, serverError }: { me: WalkMe; puppy: Puppy; busy: boolean; mutate: Mutate; onClose: () => void; serverError: string }) {
  const account = useAccountSession();
  const [nickname, setNickname] = useState(me.configured ? me.nickname : `${puppy.name}엄마`);
  const [age, setAge] = useState(me.age === null ? "" : String(me.age));
  const [realName, setRealName] = useState(me.realName || "");
  const [photo, setPhoto] = useState<string | null>(safePhoto(me));
  const [photoPreview, setPhotoPreview] = useState<string | null>(safePhoto(me));
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoStatus, setPhotoStatus] = useState("");
  const [uploadConfig, setUploadConfig] = useState<ImageUploadConfig | null>(null);
  const [configError, setConfigError] = useState("");
  const [configRevision, setConfigRevision] = useState(0);
  const [error, setError] = useState("");
  const mounted = useRef(true);
  const uploadAbort = useRef<AbortController | null>(null);
  const uploadVersion = useRef(0);
  const saving = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; uploadVersion.current += 1; uploadAbort.current?.abort(); }; }, []);
  useEffect(() => {
    const controller = new AbortController();
    setUploadConfig(null); setConfigError("");
    getImageUploadConfig(controller.signal)
      .then(config => { if (!controller.signal.aborted) setUploadConfig(config); })
      .catch(() => { if (!controller.signal.aborted) setConfigError("사진 등록에 연결하지 못했어요."); });
    return () => controller.abort();
  }, [configRevision]);
  const waiting = busy || photoBusy;
  const signedIn = account.session?.user?.status === "ACTIVE";
  const canUpload = signedIn && uploadConfig?.enabled && !waiting;
  const uploadHelp = account.loading ? "로그인 상태를 확인하고 있어요."
    : account.error ? "로그인 상태를 확인하지 못했어요."
      : !signedIn ? "사진은 로그인한 뒤 등록할 수 있어요."
        : configError || (!uploadConfig ? "사진 등록을 준비하고 있어요." : !uploadConfig.enabled ? "사진 등록을 준비 중이에요. 기존 사진과 프로필은 그대로 저장할 수 있어요." : "10MB 이하 사진을 선택하면 작게 줄여 등록해요.");
  async function selectPhoto(file?: File) {
    if (!file || !canUpload || !uploadConfig || saving.current || uploadAbort.current) return;
    const controller = new AbortController(); uploadAbort.current = controller;
    const version = ++uploadVersion.current;
    const current = () => mounted.current && version === uploadVersion.current && !controller.signal.aborted;
    const stages: Record<ImageUploadStage, string> = { prepare: "사진을 작게 준비하고 있어요.", upload: "사진을 전송하고 있어요.", verify: "등록한 사진을 확인하고 있어요." };
    setPhotoBusy(true); setError(""); setPhotoStatus(stages.prepare);
    try {
      const result = await uploadProfilePhoto(file, uploadConfig, controller.signal, stage => { if (current()) setPhotoStatus(stages[stage]); });
      if (current()) { setPhoto(result.photo); setPhotoPreview(result.url); setPhotoStatus("사진 등록을 마쳤어요. 프로필을 저장하면 반영돼요."); }
    } catch (problem) {
      if (current()) { setError(problem instanceof Error ? problem.message : "사진을 등록하지 못했어요."); setPhotoStatus(""); }
    } finally {
      if (uploadAbort.current === controller) uploadAbort.current = null;
      if (current()) setPhotoBusy(false);
    }
  }
  function cancelPhoto() {
    uploadVersion.current += 1; uploadAbort.current?.abort(); uploadAbort.current = null;
    setPhotoBusy(false); setPhotoStatus("사진 등록을 취소했어요. 이전 사진을 유지해요."); setError("");
  }
  async function save() {
    if (waiting || saving.current || uploadAbort.current) return;
    const numericAge = age.trim() ? Number(age) : null;
    if (!nickname.trim()) { setError("산책에서 사용할 닉네임을 적어 주세요."); return; }
    if (numericAge !== null && (!Number.isInteger(numericAge) || numericAge < 1 || numericAge > 120)) { setError("나이는 1~120 사이로 적거나 비워 주세요."); return; }
    setError(""); saving.current = true;
    try {
      const result = await mutate("profile", { nickname: nickname.trim(), age: numericAge, realName: realName.trim() || null, photo });
      if (result && mounted.current) onClose();
    } finally { saving.current = false; }
  }
  return <WalkDialog title={me.configured ? "내 산책 프로필" : "산책 전에, 반가운 첫인사"} busy={waiting} onClose={onClose}>
    <p className="walk-modal-intro">강아지를 따라 우리도 천천히 알아가요.</p>
    <form onSubmit={event => { event.preventDefault(); void save(); }} className="walk-profile-form">
      <div className="walk-form-section"><h3><UsersRound size={15} /> 모두에게 보여요</h3><label>산책 닉네임 <b>필수</b><input autoComplete="off" value={nickname} onChange={event => setNickname(event.target.value)} maxLength={24} placeholder="쿠키엄마, 쿠키아빠" disabled={waiting} required /></label><p className="walk-field-note">강아지 이름을 넣어 ‘쿠키엄마’, ‘쿠키아빠’처럼 지어도 좋아요.</p><label>나이 <span>선택 · 입력하면 공개돼요</span><input type="number" inputMode="numeric" value={age} onChange={event => setAge(event.target.value)} min={1} max={120} placeholder="공개하고 싶을 때만 입력" disabled={waiting} /></label></div>
      <div className="walk-form-section walk-private-section">
        <h3><LockKeyhole size={15} /> 서로 친구가 된 사람에게만</h3>
        <p>친구 요청을 수락한 뒤에만 실명과 사진을 볼 수 있어요. 둘 다 비워 두어도 산책할 수 있어요.</p>
        <label>실명 <span>선택</span><input autoComplete="off" value={realName} onChange={event => setRealName(event.target.value)} maxLength={40} placeholder="친구에게 알려 줄 이름" disabled={waiting} /></label>
        <div className="walk-photo-field">
          {photoPreview ? <img className="walk-photo-preview" src={photoPreview} referrerPolicy="no-referrer" alt="내 프로필 사진 미리보기" /> : <span className="walk-photo-placeholder"><UserRound size={24} /></span>}
          <div>
            <label className={`walk-upload-button ${!canUpload ? "walk-disabled" : ""}`}>
              {photoBusy ? <LoaderCircle size={14} className="walk-spin" /> : <ImagePlus size={14} />} {photo ? "사진 바꾸기" : "내 기기에서 사진 선택"}
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" disabled={!canUpload} onChange={event => { void selectPhoto(event.target.files?.[0]); event.currentTarget.value = ""; }} />
            </label>
            {photo && <button className="walk-text-button" type="button" onClick={() => { setPhoto(null); setPhotoPreview(null); setPhotoStatus("프로필을 저장하면 사진이 지워져요."); setError(""); }} disabled={waiting}>사진 지우기</button>}
            {photoBusy && <button className="walk-text-button" type="button" onClick={cancelPhoto}>사진 등록 취소</button>}
            <small role="status" aria-live="polite">{photoStatus || uploadHelp}</small>
            {!account.loading && !account.error && !signedIn && <a className="walk-text-button" href="/account">로그인하기</a>}
            {(configError || account.error) && <button className="walk-text-button" type="button" disabled={waiting} onClick={() => { account.refresh(); setConfigRevision(value => value + 1); }}>다시 연결하기</button>}
          </div>
        </div>
      </div>
      {(error || serverError) && <p className="walk-form-error" role="alert">{error || serverError}</p>}
      <div className="walk-modal-footer"><button className="walk-secondary-button" type="button" onClick={onClose} disabled={waiting}>나중에</button><button className="walk-primary-button" disabled={waiting}>{waiting ? <LoaderCircle size={16} className="walk-spin" /> : <Check size={16} />} {me.configured ? "프로필 저장" : "이 닉네임으로 시작"}</button></div>
    </form>
  </WalkDialog>;
}

function CreateRoom({ busy, mutate, onClose, serverError, time }: { busy: boolean; mutate: Mutate; onClose: () => void; serverError: string; time: WalkTime }) {
  const [title, setTitle] = useState(""); const [description, setDescription] = useState("");
  const [theme, setTheme] = useState<WalkTheme>(time.theme); const [capacity, setCapacity] = useState(8);
  return <WalkDialog title="우리의 작은 산책길 만들기" onClose={onClose} busy={busy}>
    <p className="walk-modal-intro">함께 걷고 싶은 분위기로 이웃을 초대해요.</p>
    <form className="walk-profile-form" onSubmit={event => { event.preventDefault(); if (!title.trim() || busy) return; void mutate("create", { title: title.trim(), description: description.trim(), theme, capacity }).then(result => { if (result) onClose(); }); }}>
      <label>산책방 이름<input value={title} onChange={event => setTitle(event.target.value)} maxLength={40} placeholder="예: 퇴근하고 가볍게 한 바퀴" required disabled={busy} /></label>
      <label>한 줄 소개 <span>선택</span><textarea value={description} onChange={event => setDescription(event.target.value)} maxLength={120} placeholder="어떤 이야기와 산책을 함께할까요?" rows={2} disabled={busy} /></label>
      <fieldset className="walk-theme-options"><legend>산책방 종류</legend>{themeIds.map(id => <button key={id} className="walk-theme-choice" type="button" aria-pressed={theme === id} onClick={() => setTheme(id)} disabled={busy}>{themeIcon(id, 21)}<strong>{walkThemes[id].label}</strong>{theme === id && <Check size={13} />}</button>)}</fieldset>
      <p className="walk-field-note">이웃이 찾아올 방 종류를 골라 주세요. 풍경은 종류와 관계없이 지금의 {time.label} 시간에 맞춰져요.</p>
      <fieldset className="walk-capacity-options"><legend>함께 걸을 인원</legend>{[4, 8, 12].map(value => <button type="button" key={value} aria-pressed={capacity === value} onClick={() => setCapacity(value)} disabled={busy}><UsersRound size={15} /> {value}명</button>)}</fieldset>
      {serverError && <p className="walk-form-error" role="alert">{serverError}</p>}
      <div className="walk-modal-footer"><button className="walk-secondary-button" type="button" onClick={onClose} disabled={busy}>취소</button><button className="walk-primary-button" disabled={busy || !title.trim()}><Plus size={16} /> 산책방 만들기</button></div>
    </form>
  </WalkDialog>;
}

function FriendActions({ profile, busy, mutate }: { profile: WalkProfile; busy: boolean; mutate: Mutate }) {
  if (profile.friendship === "self") return <span className="walk-self-chip">내 프로필이에요</span>;
  if (profile.friendship === "friend") return <div className="walk-friend-actions"><span className="walk-friend-chip"><UserRoundCheck size={14} /> 서로 친구</span><button className="walk-text-button" disabled={busy} onClick={() => void mutate("friend-remove", { targetId: profile.id })}>친구 해제</button></div>;
  if (profile.friendship === "incoming") return <div className="walk-friend-actions"><button className="walk-primary-button" disabled={busy} onClick={() => void mutate("friend-accept", { targetId: profile.id })}><Check size={14} /> 친구 수락</button><button className="walk-secondary-button" disabled={busy} onClick={() => void mutate("friend-decline", { targetId: profile.id })}>거절</button></div>;
  if (profile.friendship === "outgoing") return <span className="walk-pending-chip"><Clock3 size={14} /> 친구 요청을 보냈어요</span>;
  return <button className="walk-primary-button" disabled={busy} onClick={() => void mutate("friend-request", { targetId: profile.id })}><UserRoundPlus size={15} /> 친구 요청 보내기</button>;
}

function ProfileCard({ profile, busy, mutate, onClose, serverError }: { profile: WalkProfile; busy: boolean; mutate: Mutate; onClose: () => void; serverError: string }) {
  const privateVisible = profile.friendship === "self" || profile.friendship === "friend";
  return <WalkDialog title="이웃의 산책 카드" busy={busy} onClose={onClose}>
    <div className="walk-profile-card"><Avatar profile={profile} size="large" /><span className="walk-kicker">OUR LITTLE NEIGHBOR</span><h3>{ownerLabel(profile)}</h3><p>{profile.friendship === "self" ? "함께 걷는 나의 프로필" : profile.friendship === "friend" ? "이제 서로를 조금 더 아는 사이" : "닉네임으로 먼저 가볍게 인사해요"}</p></div>
    {privateVisible ? <div className="walk-profile-details"><span><ShieldCheck size={15} /> {profile.friendship === "self" ? "친구에게 보이는 정보" : "친구에게만 공개된 정보"}</span><div><small>이름</small><strong>{profile.realName || "아직 등록하지 않았어요"}</strong></div><p>프로필 사진과 이름은 각자 선택해서 공개해요.</p></div> : <div className="walk-locked-profile"><LockKeyhole size={24} /><div><strong>실명과 사진은 서로 친구가 된 뒤에</strong><p>친구 요청을 수락하면 등록된 정보를 볼 수 있어요.</p></div></div>}
    <div className="walk-profile-action-row"><FriendActions profile={profile} busy={busy} mutate={mutate} /></div>
    {serverError && <p className="walk-form-error" role="alert">{serverError}</p>}
  </WalkDialog>;
}

function RoomCard({ room, busy, onJoin, time }: { room: WalkRoomSummary; busy: boolean; onJoin: () => void; time: WalkTime }) {
  const full = room.memberCount >= room.capacity;
  return <article className="walk-room-card"><div className={`walk-room-art walk-time-${time.period}`}><WalkStars /><span className="walk-art-orb" aria-hidden="true" /><span className="walk-art-cloud" aria-hidden="true" /><TreePine className="walk-art-tree" size={47} aria-hidden="true" /><TreePine className="walk-art-tree walk-art-tree-small" size={31} aria-hidden="true" /><span className="walk-art-path" aria-hidden="true" /><span className="walk-art-flower" aria-hidden="true">✦</span><span className="walk-room-theme">방 종류 · {walkThemes[room.theme].label}</span><span className="walk-room-scene-time">{themeIcon(time.theme, 12)}{time.label}</span></div><div className="walk-room-copy"><div className="walk-room-card-meta"><span>{room.owner ? "이웃이 만든 산책길" : "퍼피루비 산책길"}</span><b className={full ? "walk-full" : ""}><UsersRound size={12} /> {room.memberCount}<small>/{room.capacity}</small></b></div><h3>{room.title}</h3><p>{room.description || walkThemes[room.theme].description}</p><div className="walk-room-card-footer"><span><UserRound size={12} />{room.owner ? ownerLabel(room.owner) : "퍼피루비"}</span><button onClick={onJoin} disabled={busy || full} aria-label={`${room.title} ${full ? "정원 가득 참" : "입장"}`}>{full ? "정원이 찼어요" : "함께 걷기"}<ArrowUpRight size={14} /></button></div></div></article>;
}

export function PuppyWalk({ puppy }: { puppy: Puppy }) {
  const time = useWalkTime();
  const [state, setState] = useState<WalkState | null>(null);
  const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true);
  const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const [search, setSearch] = useState(""); const [filter, setFilter] = useState<WalkTheme | "all">("all");
  const [editor, setEditor] = useState(false); const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<WalkProfile | null>(null);
  const [draft, setDraft] = useState(""); const [unseen, setUnseen] = useState(0);
  const live = useRef(true); const stateRef = useRef<WalkState | null>(null);
  const actionPending = useRef(false); const version = useRef(0);
  const readAbort = useRef<AbortController | null>(null); const writeAbort = useRef<AbortController | null>(null);
  const retry = useRef<() => void>(() => {}); const chatLog = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true); const seenMessageIds = useRef<Set<string>>(new Set());
  const composing = useRef(false); const moveAt = useRef(0);
  const pendingMessage = useRef<{ roomId: string; text: string; clientId: string } | null>(null);

  const adoptState = useCallback((next: WalkState) => { stateRef.current = next; setState(next); }, []);
  useEffect(() => {
    live.current = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let reading = false;
    let disposed = false;
    function schedule() { clearTimeout(timer); if (!disposed && !document.hidden) timer = setTimeout(() => void refresh(), stateRef.current?.room ? 2000 : 5000); }
    async function refresh() {
      if (disposed) return;
      clearTimeout(timer);
      if (document.hidden || actionPending.current || reading) { schedule(); return; }
      reading = true;
      const stamp = version.current;
      const controller = new AbortController(); readAbort.current = controller;
      try {
        const next = await requestWalk<WalkState>(undefined, undefined, controller.signal);
        if (!disposed && stamp === version.current && !controller.signal.aborted) { adoptState(next); setError(""); }
      } catch (problem) {
        if (!disposed && !controller.signal.aborted && stamp === version.current) setError(problem instanceof Error ? problem.message : "산책길에 연결하지 못했어요.");
      } finally { reading = false; if (readAbort.current === controller) readAbort.current = null; if (!disposed) { setLoading(false); schedule(); } }
    }
    retry.current = () => void refresh();
    function visibility() { if (document.hidden) { clearTimeout(timer); readAbort.current?.abort(); } else void refresh(); }
    document.addEventListener("visibilitychange", visibility); void refresh();
    return () => { disposed = true; live.current = false; clearTimeout(timer); readAbort.current?.abort(); writeAbort.current?.abort(); document.removeEventListener("visibilitychange", visibility); };
  }, [adoptState]);

  const mutate: Mutate = async (action, values) => {
    if (actionPending.current || !live.current) return;
    actionPending.current = true; version.current += 1; readAbort.current?.abort();
    const controller = new AbortController(); writeAbort.current = controller;
    setBusy(true); setError("");
    try {
      const result = await requestWalk<WalkResult>(action, values, controller.signal);
      if (!live.current || controller.signal.aborted) return;
      adoptState(result.state);
      if (action !== "move" && action !== "message") setNotice(result.message);
      return result;
    } catch (problem) {
      if (live.current && !controller.signal.aborted) setError(problem instanceof Error ? problem.message : "잠깐 연결이 어려워요. 다시 시도해 주세요.");
    } finally { actionPending.current = false; if (writeAbort.current === controller) writeAbort.current = null; if (live.current) setBusy(false); }
  };

  const room = state?.room;
  const latestMessage = room?.messages[room.messages.length - 1]?.id;
  useEffect(() => { setDraft(""); setUnseen(0); nearBottom.current = true; seenMessageIds.current = new Set(); pendingMessage.current = null; }, [room?.id]);
  useEffect(() => {
    if (!room || !chatLog.current) return;
    const newMessages = room.messages.filter(message => !seenMessageIds.current.has(message.id)).length;
    seenMessageIds.current = new Set(room.messages.map(message => message.id));
    if (nearBottom.current) { chatLog.current.scrollTop = chatLog.current.scrollHeight; setUnseen(0); }
    else if (newMessages) setUnseen(value => value + newMessages);
  }, [room?.id, latestMessage]); // Only new messages, never each presence poll, affect the scroll position.
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(""), 5000); return () => clearTimeout(timer); }, [notice]);

  function openProfile(profile: WalkProfile) {
    setSelected({ id: profile.id, nickname: profile.nickname, age: profile.age, friendship: "none", realName: null, photo: null });
  }
  const profiles = state ? [state.me, ...state.friends, ...state.requests, ...(room?.members.map(member => member.profile) || []), ...(room?.messages.flatMap(message => message.author ? [message.author] : []) || []), ...state.rooms.flatMap(item => item.owner ? [item.owner] : [])] : [];
  const selectedProfile = selected ? profiles.find(profile => profile.id === selected.id) || selected : null;
  const incoming = state?.requests.filter(profile => profile.friendship === "incoming") || [];

  function requireProfile(action: () => void) { if (!state?.me.configured) setEditor(true); else action(); }
  async function sendMessage() {
    const submitted = draft; const text = submitted.trim(); if (!text || actionPending.current || !room || composing.current) return;
    nearBottom.current = true;
    if (pendingMessage.current?.roomId !== room.id || pendingMessage.current.text !== text) pendingMessage.current = { roomId: room.id, text, clientId: crypto.randomUUID() };
    const result = await mutate("message", { text, clientId: pendingMessage.current.clientId });
    if (result) { setDraft(current => current === submitted ? "" : current); pendingMessage.current = null; }
  }
  function movePuppy(x: number, y: number) {
    if (actionPending.current || Date.now() - moveAt.current < 350) return;
    moveAt.current = Date.now();
    void mutate("move", { x: Math.max(10, Math.min(90, x)), y: Math.max(32, Math.min(82, y)) });
  }

  function renderSocialPanel() {
    return <aside className="walk-social-panel"><div className="walk-panel-title"><Heart size={16} /><h3>나의 산책 친구</h3><span>{state?.friends.length || 0}</span></div>{incoming.length > 0 && <div className="walk-request-section"><h4>도착한 친구 요청 <b>{incoming.length}</b></h4>{incoming.map(profile => <div className="walk-request" key={profile.id}><button className="walk-person-summary" onClick={() => openProfile(profile)}><Avatar profile={profile} /><span><strong>{ownerLabel(profile)}</strong><small>함께 친구가 되고 싶대요</small></span></button><div><button disabled={busy} className="walk-accept" onClick={() => void mutate("friend-accept", { targetId: profile.id })}>수락</button><button disabled={busy} onClick={() => void mutate("friend-decline", { targetId: profile.id })}>거절</button></div></div>)}</div>}
      {state?.friends.length ? <div className="walk-friend-list">{state.friends.map(profile => <button key={profile.id} className="walk-person-summary" onClick={() => openProfile(profile)}><Avatar profile={profile} /><span><strong>{ownerLabel(profile)}</strong><small>{room?.members.some(member => member.profile.id === profile.id) ? "이 산책길에 접속 중" : "서로 친구"}</small></span><ChevronRight size={13} /></button>)}</div> : <div className="walk-friends-empty"><span><UserRoundPlus size={23} /></span><strong>첫 산책 친구를 만나 보세요</strong><p>산책방에서 닉네임을 누르면<br />친구 요청을 보낼 수 있어요.</p></div>}
      <div className="walk-social-note"><LockKeyhole size={14} /><p>실명과 사진은 서로 친구가 된 사람에게만 보여요.</p></div></aside>;
  }

  if (!state || !time) return <section className="walk-shell walk-loading" aria-live="polite"><div className="walk-loading-puppy"><PuppySprite puppy={puppy} decorative /></div><span className="walk-kicker">A LITTLE WALK TOGETHER</span><h2>{loading ? "산책길 문을 여는 중이에요" : "산책길에 잠깐 연결이 어려워요"}</h2><p>{error || `${puppy.name}와 함께 걸을 준비를 하고 있어요.`}</p>{loading ? <LoaderCircle size={22} className="walk-spin" /> : <button className="walk-primary-button" onClick={() => { setLoading(true); retry.current(); }}><RefreshCw size={15} /> 다시 연결하기</button>}</section>;

  const filteredRooms = state.rooms.filter(item => (filter === "all" || item.theme === filter) && `${item.title} ${item.description} ${item.owner?.nickname || ""}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const myMember = room?.members.find(member => member.profile.id === state.me.id);
  return <section className="walk-shell" aria-label="강아지와 함께하는 소셜 산책">
    <header className="walk-page-heading"><div><span className="walk-kicker"><PawPrint size={13} /> A LITTLE WALK TOGETHER</span><h1>함께 걸으면, <span>더 다정한 하루</span></h1><p>강아지는 자유롭게 뛰놀고, 우리는 천천히 가까워져요.</p></div><button className="walk-my-profile" onClick={() => setEditor(true)}><Avatar profile={state.me} /><span><strong>{state.me.configured ? ownerLabel(state.me) : "내 산책 닉네임 정하기"}</strong><small>나의 산책 프로필</small></span><Settings2 size={15} /></button></header>
    {error && <div className="walk-error" role="alert"><span>{error}</span><button onClick={() => retry.current()} disabled={busy}><RefreshCw size={13} /> 다시 연결</button></div>}
    {notice && <div className="walk-notice" role="status"><Check size={14} /><span>{notice}</span><button aria-label="알림 닫기" onClick={() => setNotice("")}><X size={14} /></button></div>}
    <WalkSchedule time={time} />
    {!room ? <div className="walk-lobby-layout"><div className="walk-lobby-main"><div className={`walk-welcome walk-time-${time.period}`}><div><span className="walk-welcome-tag">{themeIcon(time.theme, 14)} 지금은 {time.label}</span><h2>{puppy.name}, <br />우리 이웃 만나러 갈까?</h2><p>{time.description}<br />우리만의 산책방을 만들어도 좋아요.</p><button className="walk-primary-button" disabled={busy} onClick={() => requireProfile(() => setCreating(true))}><Plus size={16} /> 새 산책방 만들기</button></div><div className="walk-welcome-art" aria-hidden="true"><WalkStars /><span className="walk-welcome-sun" /><span className="walk-welcome-cloud" /><span className="walk-welcome-ground" /><TreePine className="walk-welcome-tree" size={90} /><PuppySprite puppy={puppy} decorative /><span className="walk-welcome-flower">✿</span><span className="walk-welcome-speech">같이 걷자 멍!</span></div></div>
      <div className="walk-lobby-title"><div><MapPin size={18} /><h2>열려 있는 산책길</h2><span>{state.rooms.length}</span></div><p>현재 인원은 실제 접속 기준이에요</p></div>
      <div className="walk-room-toolbar"><div className="walk-theme-tabs" role="group" aria-label="산책방 종류 필터"><button aria-pressed={filter === "all"} onClick={() => setFilter("all")}>전체</button>{themeIds.map(id => <button key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>{themeIcon(id, 13)}{walkThemes[id].label}</button>)}</div><label className="walk-room-search"><Search size={15} /><input aria-label="산책방 검색" value={search} onChange={event => setSearch(event.target.value)} placeholder="산책방 찾기" maxLength={80} /></label></div>
      <p className="walk-filter-note">방 종류를 골라 보세요. 모든 방은 같은 {time.label} 풍경이에요.</p>
      {filteredRooms.length ? <div className="walk-room-grid">{filteredRooms.map(item => <RoomCard key={item.id} room={item} busy={busy} time={time} onJoin={() => requireProfile(() => { void mutate("join", { roomId: item.id }); })} />)}</div> : <div className="walk-empty-rooms"><Search size={27} /><h3>아직 이 조건의 산책길은 없어요</h3><p>다른 종류를 고르거나 첫 산책방을 열어 보세요.</p><button className="walk-secondary-button" onClick={() => { setSearch(""); setFilter("all"); }}>모든 산책길 보기</button></div>}
      <div className="walk-lobby-footnote"><PawPrint size={16} /><p>먼저 다가가는 작은 인사가, 오래 함께할 산책 친구가 될지도 몰라요.</p></div></div>{renderSocialPanel()}</div> : <div className="walk-room-layout"><div className="walk-room-main"><div className="walk-room-heading"><div><button className="walk-back-button" disabled={busy} onClick={() => void mutate("leave")}><ArrowLeft size={14} /> 산책방 나가기</button><h2>{room.title}</h2><p>{room.description || walkThemes[room.theme].description}</p></div><span className="walk-presence"><i /> {room.members.length}명 접속 중</span></div>
      <div className={`walk-park walk-time-${time.period}`} role="group" aria-label={`${walkThemes[room.theme].label}, 지금은 ${time.label} 풍경`} tabIndex={0} onKeyDown={event => { if (!myMember || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key) || event.target !== event.currentTarget) return; event.preventDefault(); movePuppy(myMember.x + (event.key === "ArrowLeft" ? -7 : event.key === "ArrowRight" ? 7 : 0), myMember.y + (event.key === "ArrowUp" ? -6 : event.key === "ArrowDown" ? 6 : 0)); }} onClick={event => { if (!myMember) return; const box = event.currentTarget.getBoundingClientRect(); movePuppy((event.clientX - box.left) / box.width * 100, (event.clientY - box.top) / box.height * 100); }}>
        <div className="walk-park-scenery" aria-hidden="true"><WalkStars /><span className="walk-park-sun" /><span className="walk-park-cloud walk-cloud-one" /><span className="walk-park-cloud walk-cloud-two" /><span className="walk-park-hills" /><span className="walk-park-path" /><span className="walk-pixel-tree walk-tree-one" /><span className="walk-pixel-tree walk-tree-two" /><span className="walk-pixel-tree walk-tree-three" /><span className="walk-park-bench" /><span className="walk-park-flowers walk-flowers-one">✦ · ✿</span><span className="walk-park-flowers walk-flowers-two">✿ · ✦</span></div>
        <span className="walk-park-title">{themeIcon(time.theme, 14)} 지금은 {time.label}</span><span className="walk-park-hint"><PawPrint size={12} /> 빈 곳을 누르거나 방향키로 이동</span>
        {room.members.map(member => { const seed = stableSeed(member.profile.id); const mine = member.profile.id === state.me.id; return <div className={`walk-park-pet ${mine ? "walk-park-pet-mine" : ""}`} key={member.profile.id} style={{ left: `clamp(52px, ${Math.max(10, Math.min(90, member.x))}%, calc(100% - 52px))`, top: `clamp(112px, ${Math.max(32, Math.min(82, member.y))}%, calc(100% - 57px))`, zIndex: Math.round(member.y), "--walk-drift-x": `${(member.x > 50 ? -1 : 1) * (22 + seed % 17)}px`, "--walk-drift-y": `${(member.y > 60 ? -1 : 1) * (9 + seed % 12)}px`, "--walk-delay": `${-(seed % 23)}s`, "--walk-duration": `${8 + seed % 5}s` } as CSSProperties}><button className="walk-roaming-pet" onClick={event => { event.stopPropagation(); openProfile(member.profile); }} aria-label={`${ownerLabel(member.profile)}의 강아지 ${member.puppy.name}, 프로필 보기`}><PuppySprite puppy={member.puppy} mood="walk" decorative /><span className="walk-pet-name">{member.puppy.name}{mine && <b>나</b>}</span><span className="walk-owner-name">{ownerLabel(member.profile)}</span></button></div>; })}
      </div>
      <section className="walk-chat" aria-labelledby="walk-chat-heading"><div className="walk-chat-heading"><div><MessageCircle size={17} /><h3 id="walk-chat-heading">산책길 이야기</h3><span>LIVE</span></div><p>강아지를 보며 도란도란</p></div><div className="walk-chat-body"><div className="walk-chat-log" ref={chatLog} role="log" aria-label="산책방 대화" aria-live="polite" aria-relevant="additions" tabIndex={0} onScroll={() => { const log = chatLog.current; if (!log) return; nearBottom.current = log.scrollHeight - log.clientHeight - log.scrollTop < 70; if (nearBottom.current) setUnseen(0); }}>
        {room.messages.length ? room.messages.map(message => message.system ? <p className="walk-system-message" key={message.id}><span>{message.text}</span></p> : <div className={`walk-chat-message ${message.author?.id === state.me.id ? "walk-chat-mine" : ""}`} key={message.id}><div className="walk-message-author">{message.author ? <button onClick={() => openProfile(message.author!)}>{ownerLabel(message.author)}</button> : <span>산책 이웃</span>}<time dateTime={new Date(message.createdAt).toISOString()}>{displayTime(message.createdAt)}</time></div><p>{message.text}</p></div>) : <div className="walk-chat-empty"><MessageCircle size={24} /><strong>작은 인사로 시작해 볼까요?</strong><p>아직 대화가 없어요. 첫 인사를 건네 보세요.</p></div>}
      </div>{unseen > 0 && <button className="walk-new-messages" onClick={() => { if (chatLog.current) chatLog.current.scrollTop = chatLog.current.scrollHeight; nearBottom.current = true; setUnseen(0); }}><ArrowDown size={13} /> 새로운 이야기 {unseen}개</button>}</div><form className="walk-chat-composer" onSubmit={event => { event.preventDefault(); void sendMessage(); }}><label className="walk-sr-only" htmlFor="walk-chat-draft">산책방에 보낼 메시지</label><textarea id="walk-chat-draft" value={draft} onChange={event => setDraft(event.target.value)} maxLength={500} rows={2} placeholder={`${state.me.nickname}님의 다정한 인사를 남겨 보세요`} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && !composing.current && event.keyCode !== 229) { event.preventDefault(); void sendMessage(); } }} /><div><span>{draft.length}/500</span><button className="walk-primary-button" type="submit" disabled={busy || !draft.trim()} aria-label="메시지 보내기"><Send size={16} /><span>보내기</span></button></div></form><p className="walk-chat-note">Enter로 보내기 · Shift + Enter로 줄바꿈</p></section></div>
      <div className="walk-room-side"><aside className="walk-members-panel"><div className="walk-panel-title"><UsersRound size={16} /><h3>함께 걷는 이웃</h3><span>{room.members.length}/{room.capacity}</span></div><div className="walk-member-list">{room.members.map(member => <button className="walk-member-row" key={member.profile.id} onClick={() => openProfile(member.profile)}><span className="walk-member-puppy"><PuppySprite puppy={member.puppy} decorative /></span><span><strong>{ownerLabel(member.profile)}{member.profile.id === state.me.id && <b>나</b>}</strong><small>{member.puppy.name}와 산책 중</small><em><i /> 접속 중{member.profile.friendship === "friend" && " · 서로 친구"}</em></span><ChevronRight size={13} /></button>)}</div><p className="walk-member-note">닉네임을 눌러 프로필을 보고 친구가 되어 보세요.</p></aside>{renderSocialPanel()}</div></div>}
    {editor && <ProfileEditor me={state.me} puppy={puppy} busy={busy} mutate={mutate} serverError={error} onClose={() => setEditor(false)} />}
    {creating && <CreateRoom busy={busy} mutate={mutate} serverError={error} time={time} onClose={() => setCreating(false)} />}
    {selectedProfile && <ProfileCard profile={selectedProfile} busy={busy} mutate={mutate} serverError={error} onClose={() => setSelected(null)} />}
  </section>;
}
