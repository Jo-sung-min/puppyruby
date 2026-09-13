"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Expand, X } from "lucide-react";
import { assetUrl } from "@/lib/asset-url";
import { premiumDogArchive, premiumDogAsset, premiumDogCatalog, premiumDogStyles, type PremiumDogStyleId } from "@/lib/premium-dog-styles";

export function AdminPremiumDogFeatured({ available, busy, onBrowse }: { available: string[]; busy: boolean; onBrowse: () => void }) {
  const remaining = premiumDogStyles.filter(style => available.includes(style.id));
  if (!remaining.length) return null;
  return <section className="account-card admin-premium-featured" aria-label="고급 도트 스타일">
    <div><span className="admin-dog-eyebrow">NEW · 원본 색상 유지</span><h3>동그랗고 포근한 고급 도트 {remaining.length}종</h3>
      <p>작은 눈망울부터 분홍 볼까지, 원래 그림의 색과 디테일을 그대로 담았어요.<br />크게 펼쳐 보고 마음에 드는 친구를 골라 보세요.</p>
      <div className="admin-premium-featured-actions"><button type="button" className="account-button" disabled={busy} onClick={onBrowse}><Expand size={15} aria-hidden="true" /> 고급 도트 비교하기</button>
        {premiumDogStyles.length === premiumDogCatalog.length && <a className="account-button account-button-soft" href={premiumDogArchive} download>원본 PNG · Aseprite 12종</a>}</div>
    </div>
    <div className="admin-premium-featured-art" aria-hidden="true">{remaining.slice(0, 3).map(style => {
      const asset = premiumDogAsset(style.id)!;
      return <Image key={style.id} src={assetUrl(asset.png)} alt="" width={asset.width} height={asset.height} unoptimized draggable={false} />;
    })}</div>
  </section>;
}

export function AdminPremiumDogPreview({ selected, available, busy, onClose, onSelect }: {
  selected: PremiumDogStyleId | null; available: string[]; busy: boolean; onClose: () => void; onSelect: (id: PremiumDogStyleId) => void;
}) {
  const id = useId(), dialog = useRef<HTMLDialogElement>(null), closeButton = useRef<HTMLButtonElement>(null);
  const [size, setSize] = useState<256 | 384 | "original">(384);
  const choices = premiumDogStyles.filter(style => available.includes(style.id));
  const [previewId, setPreviewId] = useState(selected);
  const asset = premiumDogAsset(previewId), info = premiumDogCatalog.find(style => style.id === previewId);
  const index = choices.findIndex(style => style.id === previewId);
  const open = selected !== null;
  useEffect(() => { setPreviewId(selected); setSize(384); }, [selected]);
  useEffect(() => {
    if (!open || !dialog.current) return;
    const panel = dialog.current, previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    panel.showModal(); document.body.style.overflow = "hidden"; closeButton.current?.focus();
    return () => { if (panel.open) panel.close(); document.body.style.overflow = previousOverflow; previousFocus?.focus({ preventScroll: true }); };
  }, [open]);
  function move(direction: -1 | 1) {
    const next = choices[index + direction];
    if (next) setPreviewId(next.id);
  }
  const displayWidth = asset ? size === "original" ? asset.width : size : 384;
  return <dialog ref={dialog} className="admin-premium-dialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}
    onKeyDown={event => { if (event.key === "ArrowLeft") { event.preventDefault(); move(-1); } if (event.key === "ArrowRight") { event.preventDefault(); move(1); } }}>
    {asset && info && <div className="admin-premium-dialog-inner">
      <header><div><span>{info.code} · 원본 색상 유지</span><h2 id={`${id}-title`}>{info.name}</h2></div><button ref={closeButton} type="button" aria-label="고급 도트 미리보기 닫기" onClick={onClose}><X size={22} /></button></header>
      <div className="admin-premium-size-controls" role="group" aria-label="고급 도트 표시 크기">{([256, 384, "original"] as const).map(value => <button type="button" key={value} aria-pressed={size === value} onClick={() => setSize(value)}>{value === "original" ? "원본 크기" : `${value}px`}</button>)}</div>
      <div className="admin-premium-image-scroll" tabIndex={size === "original" ? 0 : undefined} aria-label="강아지 원본 이미지" data-original-size={size === "original"}>
        <Image className="admin-premium-source-image" src={assetUrl(asset.png)} width={asset.width} height={asset.height} alt={`${info.code} ${info.name}`} unoptimized draggable={false} loading="eager"
          style={{ width: displayWidth, height: displayWidth * asset.height / asset.width }} />
      </div>
      <p id={`${id}-description`}>{info.description}</p><p className="admin-premium-native-size">원본 {asset.width} × {asset.height}px · 원래의 표정과 털색을 유지해요.{size === "original" && " 큰 이미지는 가로·세로로 스크롤할 수 있어요."}</p>
      <footer><div className="admin-premium-preview-navigation"><button type="button" disabled={index <= 0} onClick={() => move(-1)}><ChevronLeft size={16} /> 이전</button><span>{index + 1} / {choices.length}</span><button type="button" disabled={index === choices.length - 1} onClick={() => move(1)}>다음 <ChevronRight size={16} /></button></div>
        <div className="admin-premium-dialog-actions"><a href={assetUrl(asset.png)} download>원본 PNG</a><a href={asset.aseprite} download>Aseprite</a><button type="button" className="account-button" disabled={busy} onClick={() => { onSelect(info.id); onClose(); }}>이 스타일 선택</button></div>
        <small>스타일을 선택한 뒤 전체 또는 견종에 적용하고 저장해 주세요.</small>
      </footer>
    </div>}
  </dialog>;
}
