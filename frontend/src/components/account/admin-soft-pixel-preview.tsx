"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, MousePointer2, X } from "lucide-react";
import { assetUrl } from "@/lib/asset-url";
import { softPixelEyes, type SoftPixelCandidate, type SoftPixelChoice, type SoftPixelEye, type SoftPixelLook } from "@/lib/soft-pixel-candidates";
import { SoftPixelDog } from "../soft-pixel-dog";

const looks = [
  { name: "왼쪽", x: -1, y: 0 }, { name: "정면", x: 0, y: 0 }, { name: "오른쪽", x: 1, y: 0 },
  { name: "위", x: 0, y: -1 }, { name: "아래", x: 0, y: 1 },
];

export function AdminSoftPixelPreview({ candidate, eye, color, look, choice, busy, notice, onEye, onColor, onLook, onChoose }: {
  candidate: SoftPixelCandidate;
  eye: SoftPixelEye;
  color: string;
  look: SoftPixelLook;
  choice: SoftPixelChoice | null;
  busy: boolean;
  notice: string;
  onEye: (eye: SoftPixelEye) => void;
  onColor: (color: string) => void;
  onLook: (look: SoftPixelLook) => void;
  onChoose: () => void;
}) {
  const id = useId();
  const [follow, setFollow] = useState(false);
  const [large, setLarge] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!large || !dialog.current) return;
    const panel = dialog.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    panel.showModal();
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    return () => {
      if (panel.open) panel.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [large]);
  const chosen = choice?.id === candidate.id && choice.eye === eye && choice.color.toLowerCase() === color.toLowerCase();
  return <aside className="admin-dog-selected admin-soft-pixel-selected" aria-labelledby={`${id}-heading`}>
    <span className="admin-dog-eyebrow">새 시안 · {candidate.code}</span>
    <div className="admin-dog-selected-art admin-soft-pixel-stage" onPointerMove={event => {
      if (!follow) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      onLook({ x: (event.clientX - bounds.left) / bounds.width * 2 - 1, y: (event.clientY - bounds.top) / bounds.height * 2 - 1 });
    }} onPointerLeave={() => { if (follow) onLook({ x: 0, y: 0 }); }}>
      <SoftPixelDog candidate={candidate} eye={eye} color={color} look={look} />
    </div>
    <div className="admin-dog-selected-copy">
      <h3 id={`${id}-heading`}>{candidate.name}</h3>
      <p>{candidate.description}</p>
      <span>강아지 스타일 시안 · {candidate.width} × {candidate.height}px</span>
    </div>
    <button className="admin-premium-expand" type="button" aria-haspopup="dialog" aria-expanded={large} onClick={() => setLarge(true)}>더 크게 보기</button>
    <fieldset className="admin-soft-pixel-controls" disabled={busy}>
      <legend>눈동자 바꿔 보기</legend>
      <div className="admin-soft-pixel-eye-options" role="group" aria-label="눈동자 모양">
        {softPixelEyes.map(item => <button key={item.id} type="button" aria-pressed={eye === item.id} onClick={() => onEye(item.id)}>{item.name}</button>)}
      </div>
      <label className="admin-soft-pixel-color" htmlFor={`${id}-color`}><span>눈동자 색</span><input id={`${id}-color`} type="color" value={color} onChange={event => onColor(event.target.value)} /></label>
      <div className="admin-soft-pixel-eye-options" role="group" aria-label="바라보는 방향">
        {looks.map(item => <button key={item.name} type="button" aria-pressed={!follow && look.x === item.x && look.y === item.y} onClick={() => { setFollow(false); onLook({ x: item.x, y: item.y }); }}>{item.name}</button>)}
      </div>
      <button type="button" className="admin-soft-pixel-follow" aria-pressed={follow} onClick={() => { setFollow(value => !value); onLook({ x: 0, y: 0 }); }}><MousePointer2 size={14} aria-hidden="true" /> 마우스 바라보기</button>
      <small>{follow ? "강아지 그림 위에서 마우스를 움직여 보세요." : "눈 설정은 목록의 새 시안에도 함께 보여요."}</small>
    </fieldset>
    <div className="admin-cute-downloads"><a href={assetUrl(candidate.png)} download>PNG 받기</a><a href={candidate.aseprite} download>Aseprite</a><a href="/downloads/puppyruby-soft-pixel-candidates.zip" download>시안 15개 전체 받기</a></div>
    <div className="admin-dog-apply-actions">
      <button type="button" className="account-button" disabled={busy} onClick={onChoose} aria-pressed={chosen}><Check size={16} aria-hidden="true" />{chosen ? "선택한 시안이에요" : "이 시안 선택"}</button>
      <small>마음에 드는 시안 하나를 골라 주세요.<br />선택한 스타일로 30견종 제작을 이어갈 수 있어요.<br />이 브라우저에 선택을 기억해요.</small>
    </div>
    <p className="admin-soft-pixel-notice" role="status">{notice}</p>
    <dialog ref={dialog} className="admin-soft-pixel-dialog" aria-labelledby={`${id}-large-title`} aria-describedby={`${id}-large-description`}
      onCancel={event => { event.preventDefault(); setLarge(false); }}
      onClick={event => { if (event.target === event.currentTarget) setLarge(false); }}>
      <div className="admin-soft-pixel-dialog-inner">
        <header>
          <div><span>새 시안 · {candidate.code}</span><h2 id={`${id}-large-title`}>{candidate.name}</h2></div>
          <button ref={closeButton} type="button" aria-label="강아지 시안 크게 보기 닫기" onClick={() => setLarge(false)}><X size={21} aria-hidden="true" /></button>
        </header>
        <div className="admin-soft-pixel-large-art"><SoftPixelDog candidate={candidate} eye={eye} color={color} look={look} /></div>
        <p id={`${id}-large-description`}>{softPixelEyes.find(item => item.id === eye)?.name} · 선택한 눈동자 색<br />384px로 크게 보여요. 작은 화면에서는 화면 너비에 맞춰요.</p>
      </div>
    </dialog>
  </aside>;
}
