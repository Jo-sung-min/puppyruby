"use client";

import { useRef, useState } from "react";
import { ArrowUpRight, BookOpen, Check, ChevronRight, FileText, GraduationCap, Keyboard, LoaderCircle, LockKeyhole, MessageCircle, Send, Sheet, Sparkles } from "lucide-react";
import { commandUnlocked, gradeOrder, type ActionResult, type Grade, type Puppy, type PuppyCommand } from "@/lib/game";
import { PuppySprite } from "./puppy-sprite";

const gradeLessons: Record<Grade, { label: string; note: string }> = {
  N: { label: "첫 명령 배우기", note: "앉아" },
  R: { label: "엑셀 기초 도우미", note: "손 · 복사 · 붙여넣기" },
  SR: { label: "든든한 작업 친구", note: "기다려 · 한글 기초 · 엑셀 작업" },
  SSR: { label: "척척박사 강아지", note: "돌아 · 빵 · 두 앱의 고급 단축키" },
};

export function PuppyCommands({ puppy, commands, busy, promotionXp, onAsk }: {
  puppy: Puppy; commands: PuppyCommand[]; busy: boolean; promotionXp: number;
  onAsk: (value: string) => Promise<ActionResult | undefined>;
}) {
  const [app, setApp] = useState<"excel" | "hwp">("excel");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [asked, setAsked] = useState("");
  const [asking, setAsking] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const inFlight = useRef(false);
  const learned = commands.filter(c => commandUnlocked(puppy.grade, c));
  const catalog = commands.filter(c => c.kind === "shortcut" && c.app === app);
  const available = catalog.filter(c => commandUnlocked(puppy.grade, c));
  const nextGrade = gradeOrder[gradeOrder.indexOf(puppy.grade) + 1];
  const program = app === "excel" ? "엑셀" : "한글";

  async function ask(value = question) {
    if (!value.trim() || busy || inFlight.current) return;
    const prompt = /엑셀|excel|한글|한컴|hwp/i.test(value) ? value.trim() : `${program} ${value.trim()}`;
    inFlight.current = true; setAsking(true); setAsked(prompt); setQuestion(value);
    try {
      const response = await onAsk(prompt);
      if (response) setAnswer(response.message);
    } catch (error) { setAnswer(error instanceof Error ? error.message : "잠깐 연결이 어려워. 다시 물어봐 줘 멍!"); }
    finally { inFlight.current = false; setAsking(false); }
  }

  return <section className="puppy-command-school" aria-labelledby="command-school-title">
    <div className="school-heading"><div><span className="school-eyebrow"><GraduationCap size={15} /> LITTLE PAWS, BIG IDEAS</span><h2 id="command-school-title">자랄수록, 더 똑똑해진다 멍!</h2><p>돌보고 훈련하며 등급을 올리면 새로운 명령과 단축키를 배워요.</p></div><span className="learned-count"><BookOpen size={15} /><b>{learned.length}</b> / {commands.length}개 배웠어요</span></div>
    <ol className="grade-learning-path" aria-label="등급별 배움 단계">{gradeOrder.map(g => {
      const attained = gradeOrder.indexOf(puppy.grade) >= gradeOrder.indexOf(g);
      const count = commands.filter(c => c.requiredGrade === g).length;
      return <li key={g} className={`${attained ? "learned" : "locked"} ${puppy.grade === g ? "current" : ""}`} aria-current={puppy.grade === g ? "step" : undefined}><span className={`grade grade-${g}`}>{g}</span><div><strong>{gradeLessons[g].label}</strong><small>{gradeLessons[g].note}</small></div><span className="grade-command-count">{attained ? <Check size={12} /> : <LockKeyhole size={11} />} +{count}</span></li>;
    })}</ol>

    <div className="command-school-body">
      <div className="puppy-ask-panel"><div className="ask-panel-heading"><MessageCircle size={19} /><h3>{puppy.name}에게 물어봐</h3><span className={`grade grade-${puppy.grade}`}>{puppy.grade}</span></div>
        <div className="program-choices" role="group" aria-label="단축키 프로그램 선택"><button type="button" onClick={() => { setApp("excel"); setShowAll(false); }} aria-pressed={app === "excel"}><Sheet size={15} />엑셀 <small>R부터</small></button><button type="button" onClick={() => { setApp("hwp"); setShowAll(false); }} aria-pressed={app === "hwp"}><FileText size={15} />한글 <small>SR부터</small></button></div>
        <div className="puppy-answer" aria-live="polite" aria-atomic="true"><PuppySprite puppy={puppy} decorative /><div><span>{puppy.name}의 대답</span>{asking ? <p><LoaderCircle size={15} className="spin" />잠깐, 배운 걸 떠올리는 중이야 멍!</p> : <p>{answer || (available.length ? `“${program} 붙여넣기 단축키 알려줘”처럼 물어봐. 내가 알려줄게 멍!` : `${program} 단축키는 ${app === "excel" ? "R" : "SR"} 등급부터 알려줄 수 있어. 조금만 더 함께 배우자 멍!`)}</p>}{asked && !asking && <small>물어본 내용 · {asked}</small>}</div></div>
        <form onSubmit={e => { e.preventDefault(); void ask(); }} className="puppy-question-form"><label className="sr-only" htmlFor="puppy-question">강아지에게 단축키 질문</label><input id="puppy-question" value={question} onChange={e => setQuestion(e.target.value)} maxLength={160} placeholder={`${program} 붙여넣기 단축키 알려줘`} autoComplete="off" /><button type="submit" disabled={busy || asking || !question.trim()} aria-label="강아지에게 질문 보내기"><Send size={17} /></button></form>
        <div className="question-examples"><span>이렇게 물어봐요</span>{["붙여넣기", "복사", "실행 취소"].map(value => <button key={value} disabled={busy || asking} onClick={() => void ask(`${value} 단축키 알려줘`)}>{value} <ChevronRight size={11} /></button>)}</div>
        <p className="question-note"><Keyboard size={12} />Windows 기본 단축키를 안내해요. 질문으로 경험치가 차감되거나 올라가지는 않아요.</p>
      </div>
      <aside className="command-notebook"><div className="notebook-title"><BookOpen size={17} /><h3>{program} 단축키 수첩</h3><span>{available.length}/{catalog.length}</span></div><p>배운 항목을 누르면 바로 대답해요.</p>
        <div className="notebook-commands">{(showAll ? catalog : catalog.slice(0, 6)).map(command => {
          const unlocked = commandUnlocked(puppy.grade, command);
          return <button key={command.id} disabled={!unlocked || busy || asking} className={unlocked ? "unlocked" : "locked"} onClick={() => void ask(`${command.label} 단축키 알려줘`)} title={unlocked ? command.context : `${command.requiredGrade} 등급에서 배워요`}><span>{unlocked ? <Check size={12} /> : <LockKeyhole size={12} />}{command.label}</span><small>{unlocked ? "물어보기" : `${command.requiredGrade}에서 열려요`}</small></button>;
        })}</div>
        {catalog.length > 6 && <button className="notebook-more" onClick={() => setShowAll(v => !v)} aria-expanded={showAll}>{showAll ? "간단히 보기" : "아직 못 배운 명령도 보기"}<ChevronRight size={13} /></button>}
        <div className="next-lesson"><Sparkles size={16} /><p>{nextGrade ? <><b>{nextGrade}이 되면 {commands.filter(c => c.requiredGrade === nextGrade).length}개 더 배워요.</b><span>승급까지 {Math.max(0, promotionXp - puppy.xp)} XP · {gradeLessons[nextGrade].label}</span></> : <><b>모든 명령을 배웠다 멍!</b><span>앞으로도 네 곁에서 도와줄게.</span></>}</p></div>
        <div className="shortcut-sources"><span>공식 도움말 기준</span><a href="https://support.microsoft.com/en-us/accessibility/excel/keyboard-shortcuts-in-excel" target="_blank" rel="noreferrer">Microsoft <ArrowUpRight size={10} /></a><a href="https://help.hancom.com/hoffice120/ko-KR/Hwp/view/toolbar/shortcut%28table%29.htm" target="_blank" rel="noreferrer">한컴 <ArrowUpRight size={10} /></a></div>
      </aside>
    </div>
  </section>;
}
