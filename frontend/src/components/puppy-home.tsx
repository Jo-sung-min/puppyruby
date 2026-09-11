"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ArrowRight, BookHeart, Check, ChevronRight, CircleHelp, Crown, Gift, Heart, Home, LoaderCircle, Moon, PawPrint, Pencil, Plus, Shirt, Sparkles, Sun, Utensils, Volleyball, X, Zap } from "lucide-react";
import { accessories, breeds, eyeOptions, furOptions, requestGame, type ActionResult, type GameState, type Grade, type Puppy } from "@/lib/game";
import { PuppySprite } from "./puppy-sprite";

type View = "home" | "adopt" | "closet" | "collection";
type Dialog = "guide" | "rename" | "adopted" | null;
const nav = [{ id: "home", label: "우리 집", icon: Home }, { id: "adopt", label: "새 가족 만나기", icon: PawPrint }, { id: "closet", label: "옷장", icon: Shirt }, { id: "collection", label: "강아지 도감", icon: BookHeart }] as const;
const gradeLabels: Record<Grade, string> = { N: "소중한", R: "특별한", SR: "빛나는", SSR: "운명의" };

function GradeBadge({ grade }: { grade: Grade }) { return <span className={`grade grade-${grade}`}>{grade === "SSR" && <Sparkles size={11} />}{grade}</span>; }
function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => { const d = ref.current; d?.showModal(); return () => d?.close(); }, []);
  return <dialog ref={ref} className="modal" aria-labelledby={titleId} onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="modal-inner"><button className="icon-button modal-close" aria-label="닫기" onClick={onClose}><X size={21} /></button><h2 id={titleId}>{title}</h2>{children}</div>
  </dialog>;
}
function Meter({ label, value, icon, color }: { label: string; value: number; icon: ReactNode; color: string }) {
  return <div className="meter"><div className="meter-heading"><span>{icon}{label}</span><b>{value}<small> / 100</small></b></div><div className="meter-track" role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${value}%`, background: color }} /></div></div>;
}

export function PuppyHome() {
  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState("");
  const [view, setView] = useState<View>("home");
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState("");
  const [speech, setSpeech] = useState("기다리고 있었어. 오늘도 반가워! ♡");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [newDogId, setNewDogId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [animation, setAnimation] = useState("");
  const [now, setNow] = useState(0);
  const busyRef = useRef(false);
  const puppy = state?.puppies.find(d => d.id === state.selectedId) || state?.puppies[0];
  const load = useCallback(async () => { setError(""); try { setState(await requestGame<GameState>()); } catch (e) { setError((e as Error).message); } }, []);
  useEffect(() => { void load(); const timer = setInterval(() => setNow(Date.now()), 1000); setNow(Date.now()); return () => clearInterval(timer); }, [load]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 5000); return () => clearTimeout(t); }, [toast]);
  useEffect(() => { if (!animation) return; const t = setTimeout(() => setAnimation(""), 1600); return () => clearTimeout(t); }, [animation]);

  async function act(action: string, extra: Record<string, unknown> = {}) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(action);
    try {
      const result = await requestGame<ActionResult>(`/${action}`, { puppyId: puppy?.id, ...extra });
      setState(result.state); setToast(result.message);
      if (["feed", "play", "rest", "train"].includes(action)) {
        setSpeech(action === "feed" ? "냠냠, 정말 맛있어! 고마워 ♡" : action === "rest" ? "네 곁이라서 더 포근해… zZ" : action === "play" ? "한 번만 더! 너랑 노는 게 제일 좋아!" : result.success ? "이렇게 하는 거 맞지? 칭찬해 줘!" : "갸우뚱… 우리 한 번 더 해볼까?");
        setAnimation(action === "rest" ? "resting" : result.success ? "bouncing" : "wiggling");
      }
      if (action === "adopt") { setNewDogId(result.newPuppyId); setDialog("adopted"); }
      return result;
    } catch (e) { setToast((e as Error).message); }
    finally { busyRef.current = false; setBusy(""); }
  }
  function navigate(next: View) { setView(next); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function cooldown(timestamp: number, seconds: number) { return Math.max(0, seconds - Math.floor((now - timestamp) / 1000)); }
  const grade = state?.grades.find(g => g.id === puppy?.grade);
  const adoptedDog = state?.puppies.find(d => d.id === newDogId);

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">본문으로 건너뛰기</a>
    <aside className="sidebar">
      <button className="brand" onClick={() => navigate("home")} aria-label="PuppyRuby 우리 집"><span className="brand-icon"><PawPrint size={26} fill="currentColor" /></span><span>Puppy<span className="brand-accent">Ruby</span><small>너와 나의 작은 행복</small></span></button>
      <div className="nav-label">MY LITTLE WORLD</div>
      <nav aria-label="주 메뉴">{nav.map(item => <button key={item.id} className={`nav-item ${view === item.id ? "active" : ""}`} onClick={() => navigate(item.id)} aria-current={view === item.id ? "page" : undefined}><item.icon size={21} strokeWidth={1.8} /><span>{item.label}</span>{item.id === "adopt" && <span className="nav-new">NEW</span>}</button>)}</nav>
      <div className="sidebar-note"><Heart size={23} strokeWidth={1.5} /><p>작은 발걸음이 모여<br />커다란 행복이 될 거예요.</p><span>함께라서, 매일이 따뜻해요</span></div>
      <button className="help-button" onClick={() => setDialog("guide")}><CircleHelp size={18} />처음 오셨나요?<ChevronRight size={16} /></button>
      <div className="sidebar-profile"><span className="profile-avatar"><PawPrint size={21} /></span><div><b>다정한 집사님</b><span>우리 집에 오신 걸 환영해요</span></div></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb"><Home size={16} /><span>PuppyRuby</span><ChevronRight size={13} /><b>{nav.find(n => n.id === view)?.label}</b></div><div className="topbar-actions"><span className="wallet" aria-label={`보유 하트 ${state?.coins ?? 0}개`}><Heart size={17} fill="currentColor" /><strong>{state ? state.coins.toLocaleString() : "—"}</strong><span>하트</span></span><button className="daily-button" disabled={!state || !state.giftAvailable || !!busy} onClick={() => act("gift")}><Gift size={17} /><span>{state?.giftAvailable === false ? "오늘 선물 받음" : "오늘의 선물"}</span>{state?.giftAvailable && <i />}</button></div></header>
      <main id="main-content" tabIndex={-1}>
        {error ? <div className="connection-state"><PawPrint size={44} /><h1>강아지 집 문을 여는 중이에요</h1><p>{error}</p><button className="primary-button" onClick={load}>다시 연결하기</button></div> : !state || !puppy ? <div className="connection-state"><LoaderCircle className="spin" size={36} /><p>작은 친구가 마중 나오는 중이에요…</p></div> : <>
          <section className="page-heading"><div><div className="eyebrow"><Sun size={15} /> {view === "home" ? "A LITTLE LOVE, EVERY DAY" : view === "adopt" ? "A NEW BEST FRIEND" : view === "closet" ? "MADE TO BE YOURS" : "EVERY PUPPY IS SPECIAL"}</div><h1>{view === "home" ? <>오늘도, <span>네가 와서 좋아.</span></> : view === "adopt" ? "어떤 인연이 기다리고 있을까요?" : view === "closet" ? "귀여움에, 나만의 취향을 더해요." : "작은 발자국, 소중한 친구들."}</h1><p>{view === "home" ? "바쁜 하루에 잠깐 쉼표. 작은 친구와 포근한 시간을 보내세요." : view === "adopt" ? "모습도 성격도 다른 작은 친구. 우연한 만남이 소중한 가족이 돼요." : view === "closet" ? "보드라운 털부터 반짝이는 눈동자까지, 우리 아이답게." : "모든 강아지는 사랑과 함께 최고 등급 SSR까지 성장할 수 있어요."}</p></div>{view === "home" && <div className="today-label"><span>OUR COZY HOME</span><b><PawPrint size={15} /> {state.puppies.length}마리와 함께하는 일상</b></div>}</section>

          {view === "home" && <>
            <div className="home-grid"><section className="room-card"><div className="room-top"><span><span className="room-dot" />우리의 포근한 거실</span><span><Sun size={15} /> 따스한 오후</span></div><div className="room-scene"><img className="room-image" src="/images/cozy-room.png" alt="햇살이 들어오는 포근한 강아지 거실" /><div className="room-vignette" /><span className="room-caption">Home, sweet home.</span><div className="speech-bubble" aria-live="polite">{speech}</div><button className={`room-puppy ${animation}`} onClick={() => { setAnimation("bouncing"); setSpeech("나도 네가 정말 좋아! ♡"); }} aria-label={`${puppy.name} 쓰다듬기`}><PuppySprite puppy={puppy} /></button><div className="room-name"><Heart size={13} fill="currentColor" />{puppy.name}의 행복한 하루</div><button className="room-dress" onClick={() => navigate("closet")}><Shirt size={16} />꾸며 주기</button></div><div className="care-actions">{[{ id: "feed", title: "밥 주기", sub: "든든하게 냠냠", icon: Utensils, last: puppy.lastFeed }, { id: "play", title: "놀아 주기", sub: "신나게 폴짝", icon: Volleyball, last: puppy.lastPlay }, { id: "rest", title: "쉬게 하기", sub: "포근하게 쿨쿨", icon: Moon, last: puppy.lastRest }].map(a => { const wait = cooldown(a.last, 30); return <button key={a.id} onClick={() => act(a.id)} disabled={!!busy || wait > 0}><span className={`care-icon ${a.id}`}><a.icon size={24} strokeWidth={1.65} /></span><span><b>{a.title}</b><small>{wait > 0 ? `${wait}초 후 다시` : a.sub}</small></span>{busy === a.id ? <LoaderCircle className="spin" size={17} /> : <Plus size={15} />}</button>; })}</div></section>
              <aside className="pet-panel"><div className="panel-eyebrow">MY LITTLE BEST FRIEND<Heart size={16} /></div><div className="pet-title"><h2>{puppy.name}</h2><GradeBadge grade={puppy.grade} /><button className="icon-button" aria-label="강아지 이름 바꾸기" onClick={() => { setNewName(puppy.name); setDialog("rename"); }}><Pencil size={15} /></button></div><p className="pet-description">{breeds[puppy.breed].name}<span>·</span>{gradeLabels[puppy.grade]} 친구</p><div className="pet-mood"><span>♡</span> {puppy.energy < 20 ? "너랑 같이 쉬고 싶어" : puppy.hunger < 30 ? "맛있는 밥이 먹고 싶어" : "집사님이 와서 기분 최고!"}</div><div className="meters"><Meter label="포만감" value={puppy.hunger} icon={<Utensils size={15} />} color="#e9af68" /><Meter label="행복도" value={puppy.happiness} icon={<Heart size={15} />} color="#ed9eac" /><Meter label="에너지" value={puppy.energy} icon={<Zap size={15} />} color="#9aaf8e" /></div><div className="growth"><div><span><Sparkles size={15} />함께 쌓은 성장</span><b>{puppy.xp}<small> / {state.promotionXp} XP</small></b></div><div className="xp-track"><i style={{ width: `${Math.min(puppy.xp / state.promotionXp * 100, 100)}%` }} /></div><div className="growth-note">{puppy.grade === "SSR" ? "최고 등급이에요. 언제나 너의 친구!" : <>다음 등급 <b>{state.grades[state.grades.findIndex(g => g.id === puppy.grade) + 1]?.id}</b><button disabled={puppy.xp < state.promotionXp || !!busy} onClick={() => act("promote")}>등급 올리기 <ChevronRight size={12} /></button></>}</div></div><div className="training"><div className="section-row"><h3>우리, 같이 배워 볼까?</h3><span>성공률 <b>{grade?.obedience}%</b></span></div><p>조금 서툴러도 괜찮아. 천천히 함께해요.</p><div className="command-buttons">{["앉아", "손", "기다려"].map(command => <button key={command} disabled={!!busy || cooldown(puppy.lastTrain, 5) > 0 || puppy.energy < 5} onClick={() => act("train", { value: command })}>{command}{command === "손" ? " 🐾" : command === "앉아" ? " ↓" : " ♡"}</button>)}</div></div></aside>
            </div>
            <div className="lower-grid"><section className="family-section"><div className="section-row"><h2>함께하는 우리 가족 <span>{state.puppies.length}</span></h2><button className="text-button" onClick={() => navigate("collection")}>모두 보기 <ChevronRight size={15} /></button></div><div className="family-list">{state.puppies.slice(0, 5).map(d => <button key={d.id} onClick={() => { void act("select", { puppyId: d.id }); setSpeech("오늘도 나랑 함께해 줘서 고마워 ♡"); }} disabled={!!busy} className={`family-card ${d.id === puppy.id ? "selected" : ""}`} aria-pressed={d.id === puppy.id}><GradeBadge grade={d.grade} />{d.id === puppy.id && <Check className="selected-check" size={14} />}<PuppySprite puppy={d} decorative /><b>{d.name}</b><span>{breeds[d.breed].name}</span></button>)}<button className="family-add" onClick={() => navigate("adopt")}><span><Plus size={24} strokeWidth={1.5} /></span><b>새 가족 만나기</b><small>설레는 만남이 기다려요</small></button></div></section><section className="adoption-teaser"><div><span className="tiny-label">A FATEFUL LITTLE MEETING</span><h2>빈자리를 채울<br />작은 발자국.</h2><p>어떤 친구가 찾아올까요?</p><button onClick={() => navigate("adopt")}>새 가족 만나러 가기 <ArrowRight size={16} /></button></div><PuppySprite puppy={{ breed: 1 }} decorative /></section></div>
            <div className="comfort-note"><Heart size={16} /><span>완벽한 집사일 필요 없어요. 곁에 있어 주는 것만으로 충분해요.</span></div>
          </>}

          {view === "adopt" && <div className="adopt-layout"><section className="adopt-stage"><div className="adopt-stage-label"><Sparkles size={16} />작은 인연 상자</div><div className={`adopt-pups ${busy === "adopt" ? "drawing" : ""}`}><PuppySprite puppy={{ breed: 2 }} decorative /><PuppySprite puppy={{ breed: 0 }} decorative /><PuppySprite puppy={{ breed: 3 }} decorative /></div><h2>우리, 가족이 되어 줄래?</h2><p>여섯 견종 중 한 마리가 당신을 찾아와요.<br />어떤 등급이든, 사랑스러움은 똑같아요.</p><button className="primary-button adopt-button" disabled={!!busy || state.coins < state.adoptionCost || state.puppies.length >= 100} onClick={() => act("adopt")}>{busy === "adopt" ? <><LoaderCircle className="spin" size={19} />친구를 만나는 중…</> : <><PawPrint size={19} />새 가족 만나기 <span><Heart fill="currentColor" size={15} />{state.adoptionCost}</span></>}</button>{state.coins < state.adoptionCost && <p className="inline-note">하트가 부족해요. 돌봄이나 오늘의 선물로 모아 보세요.</p>}<span className="adoption-footnote">만날 때마다 새로운 가족 1마리가 함께해요 · 최대 100마리</span></section><aside className="adopt-info"><section className="white-card"><h2>모든 만남은 소중하니까</h2><p>모든 견종은 동일한 확률로 만나요.<br />각 견종에 모든 등급이 존재해요.</p><div className="probability-table">{state.grades.map(g => <div key={g.id}><GradeBadge grade={g.id} /><span>{g.label}</span><b>{g.probability}%</b></div>)}</div><div className="info-note"><Sparkles size={17} /><p>모든 강아지는 돌봄과 훈련을 통해<br /><b>최고 등급 SSR</b>까지 성장할 수 있어요.</p></div></section><section className="white-card gift-card"><Gift size={30} /><div><h3>오늘의 작은 선물</h3><p>매일 하트 150개를 드려요.</p></div><button className="secondary-button" disabled={!state.giftAvailable || !!busy} onClick={() => act("gift")}>{state.giftAvailable ? "선물 받기" : "내일 또 만나요"}</button></section></aside></div>}

          {view === "closet" && <Closet key={puppy.id} puppy={puppy} puppies={state.puppies} busy={!!busy} onSelect={id => act("select", { puppyId: id })} onSave={draft => act("customize", draft)} />}
          {view === "collection" && <Collection state={state} busy={!!busy} onSelect={async id => { const result = await act("select", { puppyId: id }); if (result) navigate("home"); }} />}
        </>}
      </main><footer className="footer"><span><PawPrint size={13} />PuppyRuby</span><span>작은 친구와 함께, 조금 더 다정한 하루.</span><button onClick={() => setDialog("guide")}>이용 안내</button></footer>
    </div>
    {toast && <div className="toast" role="status"><PawPrint size={19} /><span>{toast}</span><button aria-label="알림 닫기" onClick={() => setToast("")}><X size={16} /></button></div>}
    {dialog === "guide" && <Modal title="반가워요, 다정한 집사님!" onClose={() => setDialog(null)}><p className="modal-lead">이곳은 작은 강아지와 마음을 나누는 집이에요.</p><ol className="guide-list"><li><PawPrint /><div><b>소중한 가족을 만나요</b><p>처음에는 루비와 하트 1,000개가 함께해요. 하트 100개로 여섯 견종 중 한 마리를 분양받아요.</p></div></li><li><Heart /><div><b>함께하면서 자라요</b><p>밥 주기·놀기·쉬기로 하트와 경험치를 모아요. 돌봄은 각각 30초, 훈련은 5초마다 할 수 있어요.</p></div></li><li><Crown /><div><b>모든 친구가 SSR까지</b><p>경험치 100으로 한 등급씩 성장해요. 명령 성공률은 N 45%, R 65%, SR 80%, SSR 95%예요.</p></div></li><li><Shirt /><div><b>우리 아이답게 꾸며요</b><p>털색, 눈동자, 액세서리는 자유롭게 바꾸고 저장할 수 있어요.</p></div></li></ol><p className="guide-storage">체험 버전 · 이 브라우저의 방문 정보로 서버에 저장돼요. 쿠키를 지우거나 다른 브라우저를 사용하면 새로 시작해요. 로그인과 결제는 아직 제공하지 않아요.</p><button className="primary-button full-width" onClick={() => setDialog(null)}>우리 집으로 가기</button></Modal>}
    {dialog === "rename" && puppy && <Modal title="어떤 이름으로 불러 줄까요?" onClose={() => setDialog(null)}><form onSubmit={async e => { e.preventDefault(); const result = await act("rename", { value: newName }); if (result) setDialog(null); }}><label className="field-label" htmlFor="puppy-name">강아지 이름</label><input id="puppy-name" className="text-input" value={newName} onChange={e => setNewName(e.target.value)} maxLength={12} required autoFocus /><p className="input-hint">1~12자로 소중한 이름을 지어 주세요.</p><button className="primary-button full-width" disabled={!!busy || !newName.trim()}>이름 저장하기</button></form></Modal>}
    {dialog === "adopted" && adoptedDog && <Modal title="우리 가족이 되어 줘서 고마워!" onClose={() => setDialog(null)}><div className="adopted-result"><span className="result-sparkles">✦ &nbsp; ♡ &nbsp; ✦</span><PuppySprite puppy={adoptedDog} /><div><GradeBadge grade={adoptedDog.grade} /><h3>{adoptedDog.name}</h3></div><p>{breeds[adoptedDog.breed].name} · {breeds[adoptedDog.breed].personality}</p><span>안녕! 앞으로 오래오래 함께하자 ♡</span></div><button className="primary-button full-width" onClick={() => { setDialog(null); navigate("home"); setSpeech("조금 떨리지만, 너를 만나서 정말 기뻐! ♡"); }}>함께 집으로 가기 <ArrowRight size={17} /></button></Modal>}
  </div>;
}

function Closet({ puppy, puppies, busy, onSelect, onSave }: { puppy: Puppy; puppies: Puppy[]; busy: boolean; onSelect: (id: string) => unknown; onSave: (draft: Record<string, unknown>) => Promise<unknown> }) {
  const [draft, setDraft] = useState({ fur: puppy.fur, eyes: puppy.eyes, accessory: puppy.accessory });
  const changed = draft.fur !== puppy.fur || draft.eyes !== puppy.eyes || draft.accessory !== puppy.accessory;
  return <div className="closet-layout"><section className="closet-preview"><span className="closet-label"><Shirt size={17} />{puppy.name}의 옷장</span><PuppySprite puppy={{ ...puppy, ...draft }} /><div className="preview-name"><h2>{puppy.name}</h2><GradeBadge grade={puppy.grade} /></div><p>{changed ? "저장하기를 누르면 이 모습으로 함께해요." : "오늘도 세상에서 제일 귀여워!"}</p><label className="pet-select-label">꾸며 줄 강아지<select value={puppy.id} onChange={e => onSelect(e.target.value)} disabled={busy}>{puppies.map(d => <option key={d.id} value={d.id}>{d.name} · {breeds[d.breed].name}</option>)}</select></label></section><section className="closet-options white-card"><div className="section-row"><h2>우리 아이의 새로운 모습</h2><span className="free-label">모두 무료</span></div><fieldset><legend>01 <b>보드라운 털색</b></legend><div className="swatches">{furOptions.map(o => <button key={o.id} aria-label={o.label} aria-pressed={draft.fur === o.id} className={draft.fur === o.id ? "chosen" : ""} onClick={() => setDraft({ ...draft, fur: o.id })}><span style={{ background: o.color }}>{draft.fur === o.id && <Check size={20} />}</span><small>{o.label}</small></button>)}</div></fieldset><fieldset><legend>02 <b>반짝이는 눈동자</b></legend><div className="swatches eyes">{eyeOptions.map(o => <button key={o.id} aria-label={o.label} aria-pressed={draft.eyes === o.id} className={draft.eyes === o.id ? "chosen" : ""} onClick={() => setDraft({ ...draft, eyes: o.id })}><span style={{ background: o.color }}><i />{draft.eyes === o.id && <Check size={18} />}</span><small>{o.label}</small></button>)}</div></fieldset><fieldset><legend>03 <b>귀여움을 더하는 액세서리</b></legend><div className="accessory-options">{accessories.map(o => <button key={o.id} className={draft.accessory === o.id ? "chosen" : ""} aria-pressed={draft.accessory === o.id} onClick={() => setDraft({ ...draft, accessory: o.id })}><span>{o.emoji}</span><small>{o.label}</small>{draft.accessory === o.id && <Check size={14} />}</button>)}</div></fieldset><div className="closet-save"><button className="secondary-button" disabled={!changed || busy} onClick={() => setDraft({ fur: puppy.fur, eyes: puppy.eyes, accessory: puppy.accessory })}>되돌리기</button><button className="primary-button" disabled={!changed || busy} onClick={() => onSave(draft)}>{busy ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}이 모습으로 저장하기</button></div></section></div>;
}

function Collection({ state, busy, onSelect }: { state: GameState; busy: boolean; onSelect: (id: string) => unknown }) {
  const [tab, setTab] = useState<"family" | "all">("family");
  const [filter, setFilter] = useState("all");
  const discovered = new Set(state.puppies.map(p => p.breed)).size;
  const filtered = state.puppies.filter(p => filter === "all" || p.grade === filter);
  return <><div className="collection-toolbar"><div className="tabs" role="tablist" aria-label="강아지 보기" onKeyDown={event => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? "family" : event.key === "End" ? "all" : tab === "family" ? "all" : "family";
    setTab(next);
    document.getElementById('collection-tab-' + next)?.focus();
  }}><button id="collection-tab-family" role="tab" aria-controls="collection-panel" tabIndex={tab === "family" ? 0 : -1} aria-selected={tab === "family"} onClick={() => setTab("family")}>우리 가족 <span>{state.puppies.length}</span></button><button id="collection-tab-all" role="tab" aria-controls="collection-panel" tabIndex={tab === "all" ? 0 : -1} aria-selected={tab === "all"} onClick={() => setTab("all")}>전체 견종 <span>{discovered}/6</span></button></div>{tab === "family" && <label className="grade-filter">등급<select value={filter} onChange={e => setFilter(e.target.value)}><option value="all">모든 등급</option>{state.grades.map(g => <option key={g.id}>{g.id}</option>)}</select></label>}</div><div id="collection-panel" role="tabpanel" aria-labelledby={"collection-tab-" + tab} className="collection-grid">{tab === "family" ? filtered.map(d => <button className="collection-card" key={d.id} disabled={busy} onClick={() => onSelect(d.id)}><div className="collection-image" style={{ background: breeds[d.breed].color }}><GradeBadge grade={d.grade} /><PuppySprite puppy={d} decorative /></div><div className="collection-copy"><h3>{d.name}<ChevronRight size={18} /></h3><p>{breeds[d.breed].name}</p><span>성장 {d.xp} XP · 명령 성공률 {state.grades.find(g => g.id === d.grade)?.obedience}%</span></div></button>) : breeds.map((b, i) => <article className="collection-card" key={b.name}><div className="collection-image" style={{ background: b.color }}><span className="breed-number">NO. 0{i + 1}</span><PuppySprite puppy={{ breed: i }} decorative /></div><div className="collection-copy"><h3>{b.name}{state.puppies.some(p => p.breed === i) && <Check size={18} />}</h3><p>{b.personality}</p><span>N · R · SR · SSR &nbsp; 최고 등급까지 함께해요</span></div></article>)}</div>{tab === "family" && filtered.length === 0 && <div className="empty-state"><PawPrint size={34} /><h3>아직 이 등급의 친구는 없어요.</h3><p>새로운 인연을 만나거나 우리 가족의 등급을 올려 보세요.</p></div>}</>;
}
