"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUpRight, Bone, Check, ChevronDown, Download, Heart, Keyboard, Maximize2, Moon, MousePointer2, Pause, PawPrint, Play, RotateCcw, Sun, Volleyball } from "lucide-react";
import { PixelDog, pixelBreeds, type PixelBreed, type PixelMood } from "./styled-pixel-dog";
import { usePuppyInput } from "./use-puppy-input";
import { AccountMenu } from "./account-menu";
import { ThemeToggle, useTheme } from "./theme-provider";

const coats = [{ name: "오리지널", value: undefined, swatch: "#dda469" }, { name: "흑시바", value: "#514944", swatch: "#514944" }, { name: "크림", value: "#f7e8cb", swatch: "#f7e8cb" }, { name: "초코", value: "#967057", swatch: "#967057" }, { name: "딸기 우유", value: "#d7a0a2", swatch: "#d7a0a2" }];
const reactions: Record<PixelMood, string> = { idle: "안녕! 나랑 친구 할래?", love: "헤헤, 네 손길이 제일 좋아 ♡", eat: "냠냠! 하나만 더 주면 안 돼?", play: "멍! 공놀이가 제일 신나!", sleep: "네 옆에서 잠깐 쉴게… zZ", typing: "나도 같이 타닥타닥!", excited: "우와, 엄청 빠르다!", scroll: "데굴데굴~", drag: "우리 어디 가는 거야?", walk: "같이 가자 멍!" };

export function PuppyLanding() {
  const [breed, setBreed] = useState<PixelBreed>("shiba");
  const [mood, setMood] = useState<PixelMood>("idle");
  const [coat, setCoat] = useState(0);
  const { theme, toggleTheme } = useTheme();
  const night = theme === "dark";
  const [paused, setPaused] = useState(false);
  const [petCount, setPetCount] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [seconds, setSeconds] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const deadline = useRef(0);
  const stage = useRef<HTMLDivElement>(null);
  const playground = useRef<HTMLDivElement>(null);
  const input = usePuppyInput(stage, paused);
  const [manualUntil, setManualUntil] = useState(0);
  const [dogOffset, setDogOffset] = useState({ x: 0, y: 0 });
  const drag = useRef({ active: false, moved: false, x: 0, y: 0, originalX: 0, originalY: 0, minX: 0, maxX: 0, minY: 0, maxY: 0 });
  const previewMood = input.reaction && input.reaction.at > manualUntil ? input.reaction.mood : mood;
  const previewSpeech = input.reaction && input.reaction.at > manualUntil ? input.reaction.label : reactions[mood];
  const selected = pixelBreeds.find(b => b.id === breed)!;
  useEffect(() => {
    if (mood === "idle" || mood === "sleep") return;
    const timer = setTimeout(() => setMood("idle"), 3500);
    return () => clearTimeout(timer);
  }, [mood, petCount]);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000));
      setSeconds(remaining);
      if (!remaining) setRunning(false);
    }, 250);
    return () => clearInterval(timer);
  }, [running]);
  useEffect(() => {
    if (!expanded) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focused = document.activeElement as HTMLElement | null;
    stage.current?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
      if (event.key === "Tab") {
        const controls = playground.current?.querySelectorAll<HTMLElement>("button,input,a,[tabindex='0']");
        if (!controls?.length) return;
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === stage.current)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", close);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", close); focused?.focus(); };
  }, [expanded]);
  function react(next: PixelMood) { setMood(next); setManualUntil(performance.now()); setPetCount(n => n + 1); }
  function choose(next: PixelBreed) { setBreed(next); setCoat(0); setMood("idle"); setDogOffset({ x: 0, y: 0 }); }
  function toggleTimer() {
    if (running) { setSeconds(Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000))); setRunning(false); }
    else { const duration = seconds || 25 * 60; setSeconds(duration); deadline.current = Date.now() + duration * 1000; setRunning(true); }
  }
  const dog = { breed, fur: coats[coat].value };

  return <div className={`puppy-site ${paused ? "motion-paused" : ""}`} id="top">
    <a className="skip-link" href="#puppy-main">본문으로 건너뛰기</a>
    <header className="site-header"><div className="site-container header-content">
      <Link href="/" className="pixel-brand" aria-label="퍼피루비 홈"><span className="brand-dog"><PixelDog decorative /></span><span>PUPPY<span>RUBY</span><small>작은 발자국, 커다란 행복</small></span></Link>
      <nav aria-label="메인 메뉴"><a href="#friends">강아지 소개</a><a href="#moments">함께하는 일상</a><a href="#questions">궁금해요</a></nav>
      <div className="site-header-actions"><ThemeToggle compact className="landing-theme-toggle" /><AccountMenu /><a href="/downloads/PuppyRuby.exe" download className="header-start" aria-label="Windows용 PuppyRuby 다운로드"><span className="header-download-full">Windows 다운로드</span><span className="header-download-short">다운로드</span><Download size={16} /></a></div>
    </div></header>

    <main id="puppy-main" className="landing-main">
      <section className="hero-section site-container" aria-labelledby="hero-title">
        <div className="hero-copy">
          <span className="little-label"><i /> YOUR LITTLE PIXEL COMPANION</span>
          <h1 id="hero-title">너의 하루에<br />작은 <span className="hero-highlight">멍!</span> 하나<span className="title-dot">.</span></h1>
          <p className="hero-description">마우스를 따라 보고, 함께 타닥타닥.<br />다른 앱을 쓸 때도 화면 위에서 함께하는<br />나만의 작은 픽셀 강아지를 만나세요.</p>
          <div className="hero-buttons"><a className="pixel-button coral" href="/downloads/PuppyRuby.exe" download><Download size={19} /> Windows용 강아지 받기 <ArrowRight size={18} /></a><a className="demo-link" href="#playground" onClick={() => stage.current?.focus()}><Play size={15} fill="currentColor" /> 먼저 놀아보기</a></div>
          <div className="hero-notes"><span><Check size={13} /> Windows 10·11 · 바로 실행</span><span><Heart size={13} /> 입력 내용은 기록하지 않아요</span></div>
          <div className="hello-note"><span className="tiny-pups"><PixelDog breed="samoyed" decorative /><PixelDog breed="poodle" decorative /><PixelDog breed="corgi" decorative /></span><p>성격도, 모습도 제각각.<br /><b>당신만의 단짝을 만나 보세요.</b></p><span className="hand-star">✧</span></div>
        </div>

        <div className={`playground-wrap ${expanded ? "expanded" : ""}`} id="playground" ref={playground} role={expanded ? "dialog" : undefined} aria-modal={expanded || undefined} aria-label={expanded ? "강아지 정원" : undefined}>
          <div className="garden-sticker">100% PIXEL<br /><span>200% LOVE</span><Heart size={13} fill="currentColor" /></div>
          <div className="playground-window" ref={stage} tabIndex={-1}>
            <div className="window-bar"><span className="window-dots"><i /><i /><i /></span><span>puppyruby / 작은 정원</span><button aria-label={expanded ? "정원 축소" : "정원 확대"} aria-expanded={expanded} onClick={() => setExpanded(v => !v)}><Maximize2 size={13} /></button></div>
            <div className={`pixel-garden ${night ? "night" : ""}`}>
              <div className="garden-night-sky" aria-hidden="true"><span className="garden-moon" />{Array.from({ length: 9 }, (_, index) => <i key={index} className={`garden-star garden-star-${index + 1}`} />)}</div>
              <div className="garden-time"><span className="live-dot" />{night ? "고요한 밤, 너와 함께" : "햇살 좋은 오후"}</div>
              <button className="day-toggle" aria-label={night ? "라이트 모드로 바꾸기" : "다크 모드로 바꾸기"} title={night ? "사이트 전체를 밝게 바꾸기" : "사이트 전체를 어둡게 바꾸기"} aria-pressed={night} onClick={toggleTheme}>{night ? <Moon size={16} /> : <Sun size={17} />}</button>
              <div className="garden-speech" aria-live="polite">{previewSpeech}<span /></div>
              <button className="garden-dog" aria-label={`${selected.name} 쓰다듬기`} style={{ marginLeft: dogOffset.x, marginBottom: -dogOffset.y }}
                onPointerDown={e => {
                  if (e.button !== 0) return;
                  const bounds = e.currentTarget.parentElement!.getBoundingClientRect();
                  const puppyBounds = e.currentTarget.getBoundingClientRect();
                  drag.current = { active: true, moved: false, x: e.clientX, y: e.clientY, originalX: dogOffset.x, originalY: dogOffset.y, minX: bounds.left - puppyBounds.left, maxX: bounds.right - puppyBounds.right, minY: bounds.top - puppyBounds.top + 15, maxY: bounds.bottom - puppyBounds.bottom - 20 };
                  e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerMove={e => {
                  const d = drag.current;
                  if (!d.active) return;
                  const dx = e.clientX - d.x, dy = e.clientY - d.y;
                  if (Math.abs(dx) + Math.abs(dy) > 5 && !d.moved) { d.moved = true; react("drag"); }
                  if (d.moved) setDogOffset({ x: d.originalX + Math.max(d.minX, Math.min(d.maxX, dx)), y: d.originalY + Math.max(d.minY, Math.min(d.maxY, dy)) });
                }}
                onPointerUp={e => { if (drag.current.active) { drag.current.active = false; e.currentTarget.releasePointerCapture(e.pointerId); if (drag.current.moved) react("love"); } }}
                onPointerCancel={() => { drag.current.active = false; setDogOffset({ x: 0, y: 0 }); react("idle"); }}
                onClick={e => { if (!drag.current.moved || e.detail === 0) react("love"); }}><PixelDog {...dog} mood={previewMood} look={input.look} frame={input.frame} decorative /></button>
              {previewMood === "play" && <span className="garden-ball" aria-hidden="true" />}
              <div className="garden-name"><Heart size={10} fill="currentColor" /> {selected.name} <span>·</span> 나의 작은 친구</div>
              <span className="garden-coordinate">HOME, SWEET HOME.</span>
            </div>
            <div className="garden-controls">{([{ id: "eat", label: "간식 주기", icon: Bone }, { id: "play", label: "공놀이", icon: Volleyball }, { id: "sleep", label: mood === "sleep" ? "깨우기" : "낮잠 자기", icon: Moon }] as const).map(action => <button key={action.id} aria-pressed={mood === action.id} onClick={() => react(action.id === "sleep" && mood === "sleep" ? "idle" : action.id)}><action.icon size={17} />{action.label}</button>)}</div>
          </div>
          <div className="playground-caption"><span><MousePointer2 size={13} /> 강아지를 콕! 눌러 쓰다듬어 보세요.</span><button onClick={() => setPaused(v => !v)} aria-label={paused ? "애니메이션 재생" : "애니메이션 일시정지"}>{paused ? <Play size={13} /> : <Pause size={13} />}</button></div>
          <label className="typing-preview"><Keyboard size={16} /><input aria-label="키보드 반응 체험" placeholder="여기에 타이핑하면 강아지도 타닥타닥!" autoComplete="off" maxLength={120} /><span>TRY ME</span></label>
          <p className="desktop-preview-note">웹 체험은 이 페이지에서만 반응해요. 다른 앱에서도 함께하려면 Windows 실행파일을 받아 주세요.</p>
        </div>
      </section>

      <div className="love-strip" aria-hidden="true"><div><PawPrint size={16} /><span>SMALL PIXELS, BIG LOVE</span><span className="strip-star">✦</span><span>작지만 확실한 행복</span><Heart size={16} /><span>YOUR NEW BEST FRIEND</span><span className="strip-star">✦</span><span>오늘도 꼬리 흔들며 기다릴게</span><PawPrint size={16} /></div></div>

      <section className="friends-section site-container" id="friends" aria-labelledby="friends-title">
        <div className="section-heading"><div><span className="section-kicker">MEET YOUR BEST FRIEND</span><h2 id="friends-title">어떤 친구에게 마음이 가나요<span>?</span></h2><p>닮은 듯 다른 매력. 콕 고르면 위 정원에서 먼저 만날 수 있어요.</p></div><a href="#playground">우리 친구 만나기 <ArrowUpRight size={17} /></a></div>
        <div className="breed-grid">{pixelBreeds.map((b, index) => <button key={b.id} className={`breed-card ${breed === b.id ? "chosen" : ""}`} aria-pressed={breed === b.id} onClick={() => choose(b.id)}><span className="breed-index">NO. 0{index + 1}</span>{breed === b.id && <span className="breed-selected"><Check size={12} /> 함께하는 중</span>}<span className="breed-art"><PixelDog breed={b.id} decorative /></span><strong>{b.name}</strong><span className="breed-note">{b.note}</span><span className="breed-select-label">{breed === b.id ? "반가워, 내 친구!" : "이 친구 만나기"}<ArrowRight size={13} /></span></button>)}</div>
        <div className="friends-footnote"><Heart size={13} /> 어떤 모습이든, 사랑스러움은 똑같으니까.</div>
      </section>

      <section className="moments-section" id="moments" aria-labelledby="moments-title"><div className="site-container">
        <div className="section-heading centered"><span className="section-kicker">LITTLE MOMENTS, LOTS OF LOVE</span><h2 id="moments-title">함께라서 더 귀여운 일상.</h2><p>거창한 건 없어도 괜찮아요. 작은 순간들이 우리를 가까워지게 해요.</p></div>
        <div className="moment-grid">
          <article className="moment-card"><div className="moment-art petting-art"><span className="floating-heart">♥</span><PixelDog breed="samoyed" mood="love" decorative /><MousePointer2 className="petting-pointer" size={34} fill="white" /></div><span className="moment-number">01 / A LITTLE AFFECTION</span><h3>콕, 마음을 전해요.</h3><p>한 번의 쓰다듬기에도 방긋.<br />당신의 작은 관심이 제일 큰 행복이에요.</p><button onClick={() => { choose("samoyed"); react("love"); stage.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }}>쓰다듬어 보기 <ArrowRight size={14} /></button></article>
          <article className="moment-card"><div className="moment-art customize-art"><PixelDog {...dog} accessory="scarf" decorative /><div className="mini-swatches">{coats.map((c, i) => <button key={c.name} style={{ background: c.swatch }} onClick={() => setCoat(i)} aria-label={`${c.name} 털색`} aria-pressed={coat === i}>{coat === i && <Check size={13} />}</button>)}</div></div><span className="moment-number">02 / ONE OF A KIND</span><h3>세상에 하나뿐인 내 강아지.</h3><p>좋아하는 털색부터 귀여운 액세서리까지.<br />우리 집 옷장에서 취향을 더해 주세요.</p><Link href="/play#closet">우리 아이 꾸미기 <ArrowRight size={14} /></Link></article>
          <article className="moment-card"><div className="moment-art focus-art"><span className="timer-label">{seconds === 0 ? "잘했어요! 잠깐 쉬어요" : running ? "우리, 같이 집중하자" : "너의 곁에서 기다릴게"}</span><span className="pixel-timer" role="timer" aria-label="집중 타이머">{String(Math.floor(seconds / 60)).padStart(2, "0")}<span>:</span>{String(seconds % 60).padStart(2, "0")}</span><PixelDog breed="poodle" mood={running ? "idle" : "sleep"} decorative /><div className="timer-controls"><button onClick={toggleTimer} aria-label={running ? "타이머 일시정지" : "타이머 시작"}>{running ? <Pause size={13} /> : <Play size={13} />}</button><button onClick={() => { setRunning(false); setSeconds(1500); }} aria-label="타이머 초기화"><RotateCcw size={13} /></button></div></div><span className="moment-number">03 / BETTER TOGETHER</span><h3>집중할 때도, 쉴 때도.</h3><p>25분 동안 작은 친구와 함께 집중해요.<br />시간이 다 되면 잠깐 쉬어 가세요.</p><button onClick={toggleTimer}>{running ? "잠깐 쉬어 가기" : "함께 집중하기"} <ArrowRight size={14} /></button></article>
        </div>
      </div></section>

      <section className="adopt-banner site-container"><div className="banner-puppies"><PixelDog breed="corgi" decorative /><PixelDog breed="samoyed" decorative /><PixelDog breed="shiba" decorative /></div><div><span className="section-kicker">A HOME IS BETTER WITH PAWS</span><h2>우리, 오늘부터 가족 할까요?</h2><p>완벽한 집사일 필요 없어요. 곁에 있어 주는 것만으로 충분해요.</p></div><Link href="/play" className="pixel-button coral">나의 강아지 만나기 <ArrowRight size={17} /></Link></section>

      <section className="faq-section site-container" id="questions"><div><span className="section-kicker">A FEW LITTLE ANSWERS</span><h2>궁금한 게 있나요?</h2><p>처음 만나는 친구를 위한 작은 안내서.</p><PawPrint size={39} strokeWidth={1.2} /></div><div className="faq-list">{[
        ["퍼피루비는 어떤 서비스인가요?", "브라우저에서 픽셀 강아지를 만나고 돌보는 작은 반려 공간이에요. 첫 화면의 정원에서 먼저 놀아 보고, ‘나의 강아지 만나기’를 누르면 분양·돌봄·훈련·꾸미기를 즐길 수 있어요."],
        ["다른 프로그램을 사용할 때도 반응하나요?", "Windows용 PuppyRuby.exe를 실행하면 강아지가 마우스 옆으로 따라오고 클릭·키보드·스크롤에 반응해요. 우클릭 → ‘여기에 멈추기’로 멈추거나 ‘마우스 따라가기’로 다시 걸어요. 드래그해 놓은 자리에도 머물러요. 평소에는 강아지만 보이고 대답할 때 짧은 말풍선이 나타나요. 웹 정원 체험은 이 페이지에서만 반응해요."],
        ["키보드 입력은 저장되나요?", "입력한 문자나 키 이름을 읽거나 저장하지 않아요. 입력 발생 여부와 최근 입력 속도만 반응에 사용하며, 네트워크로 보내지 않아요. 트레이의 ‘입력 반응 일시정지’를 켜면 입력 감지도 중지해요. 단독 모드는 서버 없이 동작하고, 웹 강아지와 연결하면 돌봄과 성장 정보를 함께 저장해요."],
        ["나의 강아지는 어디에 저장되나요?", "우리 집의 강아지와 돌봄 기록은 서버에 저장돼요. 회원가입하면 지금 키우는 강아지를 계정에 담고, 다른 브라우저에서도 로그인해 이어갈 수 있어요. 가입 전 체험은 이 브라우저에서만 이어지며, 첫 화면 정원은 저장되지 않는 미리보기예요."],
        ["어떤 강아지를 만날 수 있나요?", "정원에서는 시바견, 사모예드, 토이 푸들, 웰시 코기, 말티즈, 비글을 미리 만나요. 실제 우리 집에서는 기존 분양 규칙에 따라 포메라니안, 푸들, 말티즈, 시바, 코기, 비글을 만날 수 있어요. 모든 강아지는 돌봄으로 SSR 등급까지 자랄 수 있어요."],
      ].map(([q, a]) => <details key={q}><summary>{q}<ChevronDown size={17} /></summary><p>{a}</p></details>)}</div></section>
    </main>
    <footer className="site-footer"><div className="site-container"><Link className="footer-brand" href="/">PUPPY<span>RUBY</span><PawPrint size={15} /></Link><p>작은 친구와 함께, 조금 더 다정한 하루.</p><span>© 2026 PuppyRuby</span><a href="#top" aria-label="맨 위로">맨 위로 <ArrowDown size={12} /></a></div></footer>
  </div>;
}
