"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowDownToLine, Check, ChevronRight, Copy, Link2, LoaderCircle, Monitor, RefreshCw, Unplug, X } from "lucide-react";
import type { Puppy } from "@/lib/game";
import { requestDesktop, type DesktopDevice, type DesktopLinks, type DesktopPairingCode } from "@/lib/desktop";
import { PuppySprite } from "./puppy-sprite";

export function DesktopLink({ puppy }: { puppy: Puppy }) {
  const [open, setOpen] = useState(false);
  const [devices, setDevices] = useState<DesktopDevice[]>([]);
  const [pairing, setPairing] = useState<DesktopPairingCode | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [origin, setOrigin] = useState("");
  const [now, setNow] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const working = useRef(false);
  const version = useRef(0);
  const alive = useRef(true);
  const heading = useId();

  useEffect(() => {
    alive.current = true; setOrigin(window.location.origin); setNow(Date.now());
    return () => { alive.current = false; };
  }, []);
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      if (disposed) return;
      const revision = version.current;
      try {
        if (!document.hidden && !working.current) {
          const result = await requestDesktop<DesktopLinks>("links");
          if (!disposed && revision === version.current) setDevices(result.devices);
        }
      } catch { /* Keep background failures separate from caring for the puppy. */ }
      finally { if (!disposed) timer = setTimeout(() => void refresh(), open ? 4000 : 10000); }
    }
    void refresh();
    return () => { disposed = true; clearTimeout(timer); };
  }, [open]);
  useEffect(() => {
    const panel = dialog.current;
    if (open && panel && !panel.open) panel.showModal();
    if (!open && panel?.open) panel.close();
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(timer); panel?.close(); document.body.style.overflow = previousOverflow; };
  }, [open]);
  useEffect(() => { if (!copied) return; const timer = setTimeout(() => setCopied(""), 2000); return () => clearTimeout(timer); }, [copied]);

  function close() { if (working.current) return; setOpen(false); setPairing(null); setError(""); trigger.current?.focus(); }
  async function issueCode() {
    if (working.current) return;
    working.current = true; version.current++; setBusy("code"); setError("");
    try {
      const code = await requestDesktop<DesktopPairingCode>("pair-code");
      if (alive.current) { setPairing(code); setNow(Date.now()); }
    } catch (problem) { if (alive.current) setError(problem instanceof Error ? problem.message : "연결 코드를 만들지 못했어요."); }
    finally { working.current = false; if (alive.current) setBusy(""); }
  }
  async function revoke(id: string) {
    if (working.current) return;
    working.current = true; version.current++; setBusy(id); setError("");
    try {
      const result = await requestDesktop<DesktopLinks>("revoke", { deviceId: id });
      if (alive.current) setDevices(result.devices);
    } catch (problem) { if (alive.current) setError(problem instanceof Error ? problem.message : "연결을 해제하지 못했어요."); }
    finally { working.current = false; if (alive.current) setBusy(""); }
  }
  async function copy(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); setCopied(label); }
    catch { setError("자동 복사가 어려워요. 표시된 내용을 직접 선택해서 복사해 주세요."); }
  }
  const seconds = pairing ? Math.max(0, Math.ceil((pairing.expiresAt - now) / 1000)) : 0;
  const activeDevices = devices.filter(device => now - device.lastSeen < 20000).length;

  return <>
    <section className="desktop-link-card" aria-label="바탕화면 강아지 연결">
      <span className="desktop-link-icon"><Monitor size={24} /></span><div><span className="desktop-link-eyebrow">ALWAYS BY YOUR SIDE</span><h2>웹에서 키운 {puppy.name}, 바탕화면에서도.</h2><p>이름·꾸미기·등급을 그대로, 돌봄과 성장도 함께 이어가요.</p></div>
      <button ref={trigger} onClick={() => { setError(""); setOpen(true); }}><Link2 size={15} />{devices.length ? `연결된 PC ${devices.length}대` : "실행파일과 연결"}<ChevronRight size={15} /></button>
    </section>
    <dialog className="desktop-link-dialog" ref={dialog} aria-labelledby={heading} onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === event.currentTarget) close(); }}>
      <div className="desktop-link-dialog-inner"><button className="desktop-link-close" onClick={close} disabled={!!busy} aria-label="강아지 연결 창 닫기"><X size={19} /></button>
        <span className="desktop-link-eyebrow"><Link2 size={12} /> ONE PUPPY, EVERYWHERE</span><h2 id={heading}>내 강아지, 이제 바탕화면으로</h2><p className="desktop-link-lead">웹에서 선택한 강아지가 실행파일에도 나타나요.</p>
        <div className="desktop-link-dog"><PuppySprite puppy={puppy} decorative /><div><strong>{puppy.name} <span>{puppy.grade}</span></strong><p>선택한 픽셀아트 · 이름 · 견종 · 등급</p><small>PC 앱 0.9는 빠르게 다섯 번 클릭하면 발라당! 마우스 시선과 키보드 반응도 함께해요. 아래 최신 설치파일로 업데이트해 주세요.</small></div><Monitor size={30} /></div>
        <ol className="desktop-link-steps">
          <li><b>1</b><div><h3>Windows용 강아지 설치·업데이트</h3><p>PC 강아지를 종료한 뒤 받은 설치파일을 열어 주세요. 바탕화면과 시작 메뉴에 바로가기가 생기고 기존 기록과 연결 정보는 유지돼요.</p><a href="/downloads/PuppyRuby-Setup.exe" download><ArrowDownToLine size={14} /> 최신 Windows 설치파일 받기</a></div></li>
          <li><b>2</b><div><h3>내 강아지 연결 코드 만들기</h3><p>PC 앱에 입력할 사이트 주소예요. 이미 연결된 PC는 업데이트 후 다시 연결할 필요가 없어요.</p><div className="desktop-site-address"><span>{origin}</span><button aria-label="사이트 주소 복사" onClick={() => void copy(origin, "site")}>{copied === "site" ? <Check size={14} /> : <Copy size={14} />}</button></div><p>새 PC에서는 아래 코드를 입력하세요. 한 번만 사용할 수 있고 5분 동안 유효해요.</p>{pairing && seconds > 0 && <div className="desktop-pair-code"><div><output aria-label="실행파일 연결 코드">{pairing.code}</output><button aria-label="연결 코드 복사" onClick={() => void copy(pairing.code, "code")}>{copied === "code" ? <Check size={16} /> : <Copy size={16} />}</button></div><small>남은 시간 {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")} · 사용한 코드는 다시 쓸 수 없어요</small></div>}<button className="desktop-code-button" onClick={() => void issueCode()} disabled={!!busy || devices.length >= 5}>{busy === "code" ? <LoaderCircle size={15} className="spin" /> : pairing ? <RefreshCw size={15} /> : <Link2 size={15} />}{pairing ? "새 연결 코드 만들기" : "연결 코드 만들기"}</button>{pairing && <p>새 코드를 만들면 이전 코드는 사용할 수 없어요.</p>}{devices.length >= 5 && <p>최대 5대까지 연결해요. 아래에서 사용하지 않는 연결을 해제해 주세요.</p>}</div></li>
          <li><b>3</b><div><h3>실행파일에서 코드 입력하기</h3><p>강아지 우클릭 → <strong>웹 강아지와 연결</strong>에서 위 사이트 주소와 코드를 입력하세요. 연결 후에는 웹에서 바꾼 강아지와 지원되는 도트 스타일을 자동으로 불러와요.</p></div></li>
        </ol>
        <div className="desktop-linked-devices"><div><h3>연결된 PC <span>{devices.length}</span></h3>{activeDevices > 0 && <small><i /> 함께 있는 PC {activeDevices}대</small>}</div>{devices.length ? <ul>{devices.map(device => <li key={device.id}><Monitor size={18} /><div><strong>{device.label}</strong><small>마지막 연결 {new Date(device.lastSeen || device.createdAt).toLocaleString("ko-KR")}</small></div><button onClick={() => void revoke(device.id)} disabled={!!busy}>{busy === device.id ? <LoaderCircle size={13} className="spin" /> : <Unplug size={13} />} 연결 해제</button></li>)}</ul> : <p>코드를 입력한 PC가 여기에 표시돼요.</p>}</div>
        <p className="desktop-link-note">연결 중에는 웹 강아지의 성장 규칙을 사용해요. 기존 PC 강아지는 연결을 해제하면 다시 만날 수 있어요. 연결이 끊긴 동안에는 마지막 강아지를 보여 주고, 돌봄은 연결이 돌아오면 이어가요.</p>
        {error && <p className="desktop-link-error" role="alert">{error}</p>}
      </div>
    </dialog>
  </>;
}
