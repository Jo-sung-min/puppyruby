"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import { ArrowDownToLine, ChevronLeft, ChevronRight, Expand, Images, X } from "lucide-react";
import { dogBreedById } from "@/lib/dog-breeds";
import { assetUrl } from "@/lib/asset-url";
import { pixelArtArchive, pixelArtCandidates, type PixelArtCandidate } from "@/lib/pixel-art-candidates";
import { premiumDogAsset, premiumDogStyles } from "@/lib/premium-dog-styles";
import { originalArtDogAsset } from "@/lib/original-art-dog-styles";

const PAGE_SIZE = 12;
type PreviewSize = 256 | 384 | "original";

function OriginalImage({ png, width, height, name, size }: {
  png: string; width: number; height: number; name: string; size?: PreviewSize;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className="pixel-art-image-error" role="status">이미지를 불러오지 못했어요.</span>;
  return <Image src={assetUrl(png)} alt={name} width={width} height={height} unoptimized draggable={false}
    style={size === undefined ? undefined : { width: size === "original" ? width : size, height: "auto" }}
    loading={size === undefined ? "lazy" : "eager"} onError={() => setFailed(true)} />;
}

function CandidateImage({ candidate, size }: { candidate: PixelArtCandidate; size?: PreviewSize }) {
  return <OriginalImage {...candidate} name={`${dogBreedById(candidate.breed).name} · ${candidate.name}`} size={size} />;
}

export function AdminPixelArtGallery({ onSelect, availableStyleIds, busy = false }: {
  onSelect?: (id: string) => void; availableStyleIds?: readonly string[]; busy?: boolean;
} = {}) {
  const id = useId();
  const [page, setPage] = useState(1);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [previewSize, setPreviewSize] = useState<PreviewSize>(384);
  const [compare, setCompare] = useState(false);
  const [premiumId, setPremiumId] = useState<string>(premiumDogStyles[0]?.id ?? "");
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const total = pixelArtCandidates.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = pixelArtCandidates.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const selected = selectedIndex === null ? undefined : pixelArtCandidates[selectedIndex];
  const open = !!selected;
  const premium = premiumDogStyles.find(style => style.id === premiumId);
  const premiumAsset = premiumDogAsset(premiumId);
  function canSelect(candidate: PixelArtCandidate) {
    return !!originalArtDogAsset(candidate.id) && (!availableStyleIds || availableStyleIds.includes(candidate.id));
  }
  function selectLabel(candidate: PixelArtCandidate) {
    return !originalArtDogAsset(candidate.id) ? "적용 준비 중" : canSelect(candidate) ? "이 스타일 선택" : "삭제된 스타일";
  }
  function choose(candidate: PixelArtCandidate) {
    if (busy || !canSelect(candidate) || !onSelect) return;
    setSelectedIndex(null);
    onSelect(candidate.id);
  }

  useEffect(() => {
    const panel = dialog.current;
    if (!open || !panel) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    if (!panel.open) panel.showModal();
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    return () => {
      if (panel.open) panel.close();
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus({ preventScroll: true });
    };
  }, [open]);

  function changePage(next: number) {
    setPage(Math.max(1, Math.min(next, pageCount)));
    grid.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }

  function movePreview(direction: -1 | 1) {
    setSelectedIndex(current => current === null ? null : Math.max(0, Math.min(current + direction, total - 1)));
  }

  return <section className="account-card admin-pixel-art-gallery" aria-labelledby={`${id}-heading`}>
    <div className="pixel-art-heading">
      <div>
        <span className="account-kicker"><Images size={14} aria-hidden="true" /> PIXEL ART STUDIO</span>
        <h2 id={`${id}-heading`}>이전 픽셀아트 시안{total > 0 && <span>{total}개</span>}</h2>
        <p>이전에 제작한 원화를 다시 보고, 새 고급 도트와 나란히 비교해 보세요.</p>
      </div>
      {total > 0 && <a className="account-button account-button-soft" href={pixelArtArchive} download>
        <ArrowDownToLine size={15} aria-hidden="true" /> 전체 {total}개 ZIP 다운로드
      </a>}
    </div>
    <p className="pixel-art-preview-note">카드를 열면 256px·384px·원본 크기로 볼 수 있어요. 고급 도트와 같은 표시 너비로 비교할 수 있어요.{onSelect && <> ‘이 스타일 선택’ 후 전체·견종·종류에 적용하고 변경사항을 저장해 주세요.</>}</p>

    {total === 0 ? <p className="pixel-art-empty">아직 등록된 시안이 없어요. 완성된 픽셀아트를 등록하면 여기에서 살펴볼 수 있어요.</p>
      : <>
        <div className="pixel-art-grid" ref={grid}>
          {visible.map((candidate, index) => <article className="pixel-art-card" key={candidate.id}>
            <button type="button" className="pixel-art-open" aria-label={`${candidate.name} 크게 보기`}
              aria-haspopup="dialog" onClick={() => setSelectedIndex((currentPage - 1) * PAGE_SIZE + index)}>
              <span className="pixel-art-canvas"><CandidateImage candidate={candidate} /></span>
              <span className="pixel-art-card-number">{candidate.id.replace("art-", "")}</span>
              <span className="pixel-art-expand"><Expand size={14} aria-hidden="true" /><span>크게 보기</span></span>
            </button>
            <div className="pixel-art-card-copy">
              <span>{dogBreedById(candidate.breed).name}</span>
              <h3>{candidate.name}</h3>
              <span className="pixel-art-original-resolution">원본 {candidate.width} × {candidate.height}</span>
              {candidate.direction && <p>{candidate.direction}</p>}
              <a href={assetUrl(candidate.png)} download={`${candidate.id}.png`} aria-label={`${candidate.name} PNG 다운로드`}>
                <ArrowDownToLine size={14} aria-hidden="true" /> PNG 다운로드
              </a>
              {onSelect && <button className="account-button pixel-art-select-style" type="button" disabled={busy || !canSelect(candidate)}
                aria-label={`${candidate.name} ${selectLabel(candidate)}`} onClick={() => choose(candidate)}>{selectLabel(candidate)}</button>}
            </div>
          </article>)}
        </div>
        <nav className="admin-dog-pagination pixel-art-pagination" aria-label="픽셀아트 시안 페이지">
          <button type="button" disabled={currentPage === 1} onClick={() => changePage(currentPage - 1)}>이전</button>
          {Array.from({ length: pageCount }, (_, index) => index + 1).map(number => <button type="button" key={number}
            aria-current={number === currentPage ? "page" : undefined} aria-label={`시안 ${number}페이지`}
            onClick={() => changePage(number)}>{number}</button>)}
          <button type="button" disabled={currentPage === pageCount} onClick={() => changePage(currentPage + 1)}>다음</button>
          <span role="status">{currentPage} / {pageCount} 페이지 · {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, total)} / {total}개 · 한 페이지 12개</span>
        </nav>
      </>}

    <dialog ref={dialog} className={`pixel-art-dialog pixel-art-comparison-dialog${compare ? " is-comparing" : ""}`} aria-labelledby={`${id}-preview-title`} aria-describedby={`${id}-preview-description`}
      onClose={() => setSelectedIndex(null)} onClick={event => { if (event.target === event.currentTarget) setSelectedIndex(null); }}
      onKeyDown={event => {
        if (event.target instanceof HTMLElement && event.target.closest("select, input, textarea, [role='region']")) return;
        if (event.key === "ArrowLeft") { event.preventDefault(); movePreview(-1); }
        if (event.key === "ArrowRight") { event.preventDefault(); movePreview(1); }
      }}>
      {selected && <div className="pixel-art-dialog-inner">
        <header className="pixel-art-dialog-heading">
          <div><span>{dogBreedById(selected.breed).name} · {selectedIndex! + 1} / {total}</span><h2 id={`${id}-preview-title`}>{selected.name}</h2></div>
          <button ref={closeButton} type="button" onClick={() => setSelectedIndex(null)} aria-label="시안 미리보기 닫기"><X size={22} aria-hidden="true" /></button>
        </header>
        <div className="pixel-art-comparison-toolbar">
          <div className="pixel-art-size-controls" role="group" aria-label="이미지 표시 크기">
            {([256, 384, "original"] as const).map(size => <button key={size} type="button"
              aria-pressed={previewSize === size} onClick={() => setPreviewSize(size)}>{size === "original" ? "원본 크기" : `${size}px`}</button>)}
          </div>
          {premiumDogStyles.length > 0 && <button className="pixel-art-compare-toggle" type="button"
            aria-pressed={compare} onClick={() => setCompare(current => !current)}>고급 도트와 나란히 보기</button>}
          {compare && <label className="pixel-art-comparison-select" htmlFor={`${id}-premium`}>
            <span>비교할 고급 도트</span>
            <select id={`${id}-premium`} value={premiumId} onChange={event => setPremiumId(event.target.value)}>
              {premiumDogStyles.map(style => <option key={style.id} value={style.id}>{style.code} · {style.name}</option>)}
            </select>
          </label>}
          <p>{previewSize === "original" ? "원본의 실제 픽셀 크기예요. 각 그림 안에서 가로·세로로 스크롤해 보세요." : `각 그림을 너비 ${previewSize}px로 표시해요. 원본의 가로·세로 비율과 색상은 그대로예요.`}</p>
        </div>
        <div className={`pixel-art-comparison-panes${compare ? " has-two-panes" : ""}`}>
          <figure className="pixel-art-comparison-pane">
            <figcaption><span>이전 시안 {selected.id.replace("art-", "")}</span><strong>{selected.name}</strong><small>원본 {selected.width} × {selected.height}</small></figcaption>
            <div className="pixel-art-comparison-canvas" tabIndex={0} role="region" aria-label="이전 시안 원본 보기">
              <div className="pixel-art-comparison-image"><CandidateImage key={selected.id} candidate={selected} size={previewSize} /></div>
            </div>
          </figure>
          {compare && premium && premiumAsset && <figure className="pixel-art-comparison-pane">
            <figcaption><span>고급 도트 {premium.code}</span><strong>{premium.name}</strong><small>원본 {premiumAsset.width} × {premiumAsset.height}</small></figcaption>
            <div className="pixel-art-comparison-canvas" tabIndex={0} role="region" aria-label="고급 도트 원본 보기">
              <div className="pixel-art-comparison-image"><OriginalImage key={premium.id} {...premiumAsset} name={`${premium.code} · ${premium.name}`} size={previewSize} /></div>
            </div>
          </figure>}
        </div>
        <div className="pixel-art-dialog-copy">
          <p id={`${id}-preview-description`}>{selected.direction || "픽셀아트 원화 시안"}</p>
          <span>{selected.width} × {selected.height} PNG</span>
        </div>
        <footer className="pixel-art-dialog-footer">
          <div className="pixel-art-preview-navigation">
            <button type="button" disabled={selectedIndex === 0} onClick={() => movePreview(-1)}><ChevronLeft size={17} aria-hidden="true" /> 이전 시안</button>
            <button type="button" disabled={selectedIndex === total - 1} onClick={() => movePreview(1)}>다음 시안 <ChevronRight size={17} aria-hidden="true" /></button>
          </div>
          <a className="account-button" href={assetUrl(selected.png)} download={`${selected.id}.png`}><ArrowDownToLine size={15} aria-hidden="true" /> PNG 다운로드</a>
          {onSelect && <button className="account-button" type="button" disabled={busy || !canSelect(selected)} onClick={() => choose(selected)}>{selectLabel(selected)}</button>}
          <small>← → 시안 이동 · Esc 닫기</small>
          {onSelect && <small>스타일을 선택한 뒤 전체·견종·종류에 적용하고 변경사항을 저장해 주세요.</small>}
        </footer>
      </div>}
    </dialog>
  </section>;
}
