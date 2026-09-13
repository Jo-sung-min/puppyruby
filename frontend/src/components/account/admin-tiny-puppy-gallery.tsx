"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import { ArrowDownToLine, Check, ChevronLeft, ChevronRight, Copy, Expand, Heart, Sparkles, X } from "lucide-react";
import { assetUrl } from "@/lib/asset-url";
import { parseTinyPuppyFavorites, tinyPuppyArchive, tinyPuppyCandidates, tinyPuppyFavoriteStorageKey, type TinyPuppyCandidate } from "@/lib/tiny-puppy-candidates";

const PAGE_SIZE = 12;

function PuppyImage({ candidate, eager = false }: { candidate: TinyPuppyCandidate; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className="tiny-puppy-image-error" role="status">이미지를 불러오지 못했어요.</span>;
  return <Image src={assetUrl(candidate.png)} alt={`${candidate.id} ${candidate.name}`} width={candidate.width} height={candidate.height}
    unoptimized draggable={false} loading={eager ? "eager" : "lazy"} onError={() => setFailed(true)} />;
}

function ActualSizePreview({ candidate }: { candidate: TinyPuppyCandidate }) {
  return <div className="tiny-puppy-actual-sizes" aria-label="화면에서 보이는 실제 크기 비교">
    {([48, 64] as const).map(size => <figure key={size}>
      <div className="tiny-puppy-size-stage"><span style={{ width: size, height: size }}><PuppyImage candidate={candidate} /></span></div>
      <figcaption>{size}px</figcaption>
    </figure>)}
  </div>;
}

function Downloads({ candidate }: { candidate: TinyPuppyCandidate }) {
  return <div className="tiny-puppy-downloads">
    <a href={assetUrl(candidate.png)} download={`${candidate.id}.png`} aria-label={`${candidate.id} ${candidate.name} PNG 다운로드`}>
      <ArrowDownToLine size={14} aria-hidden="true" /> PNG
    </a>
    {candidate.aseprite && <a href={candidate.aseprite} download={`${candidate.id}.aseprite`} aria-label={`${candidate.id} ${candidate.name} Aseprite 다운로드`}>
      <ArrowDownToLine size={14} aria-hidden="true" /> Aseprite
    </a>}
  </div>;
}

export function AdminTinyPuppyGallery() {
  const id = useId();
  const [page, setPage] = useState(1);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [favoritesLoaded, setFavoritesLoaded] = useState(false);
  const [notice, setNotice] = useState("");
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const total = tinyPuppyCandidates.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = tinyPuppyCandidates.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const selected = selectedIndex === null ? undefined : tinyPuppyCandidates[selectedIndex];
  const favoriteCandidates = tinyPuppyCandidates.filter(candidate => favorites.includes(candidate.id));
  const open = !!selected;

  useEffect(() => {
    try { setFavorites(parseTinyPuppyFavorites(localStorage.getItem(tinyPuppyFavoriteStorageKey))); }
    catch { setStorageUnavailable(true); }
    setFavoritesLoaded(true);
    function syncFavorites(event: StorageEvent) {
      if (event.key === tinyPuppyFavoriteStorageKey || event.key === null) setFavorites(parseTinyPuppyFavorites(event.newValue));
    }
    window.addEventListener("storage", syncFavorites);
    return () => window.removeEventListener("storage", syncFavorites);
  }, []);

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

  function toggleFavorite(candidate: TinyPuppyCandidate) {
    const removing = favorites.includes(candidate.id);
    const next = removing ? favorites.filter(value => value !== candidate.id) : [...favorites, candidate.id];
    setFavorites(next);
    setNotice(`${candidate.id} ${candidate.name}${removing ? " 찜을 해제했어요." : " 시안을 찜했어요."}`);
    try {
      localStorage.setItem(tinyPuppyFavoriteStorageKey, JSON.stringify(next));
      setStorageUnavailable(false);
    } catch { setStorageUnavailable(true); }
  }

  async function copyFavorites() {
    const text = `마음에 드는 퍼피루비 시안: ${favoriteCandidates.map(candidate => `${candidate.id} ${candidate.name}`).join(", ")}`;
    try {
      await navigator.clipboard.writeText(text);
      setNotice("선택 목록을 복사했어요. 원하는 스타일을 요청할 때 붙여 넣어 주세요.");
    } catch { setNotice("복사를 사용할 수 없어요. 아래에 표시된 시안 번호와 이름을 선택해 복사해 주세요."); }
  }

  function changePage(next: number) {
    setPage(Math.max(1, Math.min(next, pageCount)));
    grid.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }

  function movePreview(direction: -1 | 1) {
    setSelectedIndex(current => current === null ? null : Math.max(0, Math.min(current + direction, total - 1)));
  }

  function favoriteButton(candidate: TinyPuppyCandidate) {
    const favorite = favorites.includes(candidate.id);
    return <button type="button" className="tiny-puppy-favorite" aria-pressed={favorite} disabled={!favoritesLoaded}
      aria-label={`${candidate.id} ${candidate.name} ${favorite ? "찜 해제" : "찜하기"}`} onClick={() => toggleFavorite(candidate)}>
      <Heart size={16} fill={favorite ? "currentColor" : "none"} aria-hidden="true" /> {favorite ? "찜했어요" : "찜하기"}
    </button>;
  }

  return <section className="account-card admin-tiny-puppy-gallery" aria-labelledby={`${id}-heading`}>
    <div className="pixel-art-heading">
      <div>
        <span className="account-kicker"><Sparkles size={14} aria-hidden="true" /> LITTLE IMAGINARY PUPPIES</span>
        <h2 id={`${id}-heading`}>상상 속 꼬마 강아지{total > 0 && <span>{total}개 시안</span>}</h2>
        <p>작은 몸, 동그란 얼굴. 마음에 드는 꼬마 친구를 골라 보세요.</p>
      </div>
      <div className="tiny-puppy-heading-actions">
        <span className="tiny-puppy-new-label">새로운 스타일</span>
        {total > 0 && <a className="account-button account-button-soft" href={tinyPuppyArchive} download>
          <ArrowDownToLine size={15} aria-hidden="true" /> 전체 ZIP 다운로드
        </a>}
      </div>
    </div>
    <p className="pixel-art-preview-note">48px·64px 크기와 확대 모습을 함께 비교하고 찜해 주세요. 찜한 번호로 원하는 스타일을 알려주시면 돼요.</p>

    <div className="tiny-puppy-shortlist">
      <div className="tiny-puppy-shortlist-heading"><strong><Heart size={15} aria-hidden="true" /> 찜한 시안 <span>{favoriteCandidates.length}</span></strong>
        <button type="button" disabled={favoriteCandidates.length === 0} onClick={() => void copyFavorites()}><Copy size={14} aria-hidden="true" /> 선택 목록 복사</button>
      </div>
      {favoriteCandidates.length > 0 ? <p className="tiny-puppy-shortlist-text">{favoriteCandidates.map(candidate => `${candidate.id} ${candidate.name}`).join(" · ")}</p>
        : <p className="tiny-puppy-shortlist-empty">하트를 눌러 마음에 드는 시안을 모아 보세요.</p>}
      <small>{storageUnavailable ? "브라우저 저장을 사용할 수 없어 이번 화면에서만 찜 목록이 유지돼요." : "찜 목록은 이 브라우저에 저장돼요. 게임 적용은 원하는 스타일을 고른 뒤 진행해요."}</small>
      <p className="tiny-puppy-notice" role="status" aria-live="polite">{notice}</p>
    </div>

    {total === 0 ? <p className="pixel-art-empty">꼬마 강아지 시안을 준비하고 있어요. 완성된 시안부터 이곳에 보여드릴게요.</p>
      : <>
        <div className="pixel-art-grid tiny-puppy-grid" ref={grid}>
          {visible.map((candidate, index) => <article className="pixel-art-card tiny-puppy-card" data-favorite={favorites.includes(candidate.id)} key={candidate.id}>
            <button type="button" className="pixel-art-open tiny-puppy-open" aria-label={`${candidate.id} ${candidate.name} 크게 보기`} aria-haspopup="dialog"
              onClick={() => setSelectedIndex((currentPage - 1) * PAGE_SIZE + index)}>
              <span className="tiny-puppy-canvas"><PuppyImage candidate={candidate} /></span>
              <span className="pixel-art-card-number">{candidate.id}</span>
              {favorites.includes(candidate.id) && <span className="tiny-puppy-picked"><Check size={14} aria-hidden="true" /> 찜</span>}
              <span className="pixel-art-expand"><Expand size={14} aria-hidden="true" /><span>크게 보기</span></span>
            </button>
            <div className="pixel-art-card-copy tiny-puppy-card-copy">
              <h3>{candidate.name}</h3>
              {candidate.direction && <p>{candidate.direction}</p>}
              <ActualSizePreview candidate={candidate} />
              <div className="tiny-puppy-card-actions">{favoriteButton(candidate)}<Downloads candidate={candidate} /></div>
            </div>
          </article>)}
        </div>
        <nav className="admin-dog-pagination pixel-art-pagination" aria-label="꼬마 강아지 시안 페이지">
          <button type="button" disabled={currentPage === 1} onClick={() => changePage(currentPage - 1)}>이전</button>
          {Array.from({ length: pageCount }, (_, index) => index + 1).map(number => <button type="button" key={number}
            aria-current={number === currentPage ? "page" : undefined} aria-label={`꼬마 강아지 시안 ${number}페이지`} onClick={() => changePage(number)}>{number}</button>)}
          <button type="button" disabled={currentPage === pageCount} onClick={() => changePage(currentPage + 1)}>다음</button>
          <span role="status">{currentPage} / {pageCount} 페이지 · {total}개 시안 · 한 페이지 12개</span>
        </nav>
      </>}

    <dialog ref={dialog} className="pixel-art-dialog tiny-puppy-dialog" aria-labelledby={`${id}-preview-title`} aria-describedby={`${id}-preview-description`}
      onClose={() => setSelectedIndex(null)} onClick={event => { if (event.target === event.currentTarget) setSelectedIndex(null); }}
      onKeyDown={event => {
        if (event.key === "ArrowLeft") { event.preventDefault(); movePreview(-1); }
        if (event.key === "ArrowRight") { event.preventDefault(); movePreview(1); }
      }}>
      {selected && <div className="pixel-art-dialog-inner">
        <header className="pixel-art-dialog-heading">
          <div><span>{selected.id} · {selectedIndex! + 1} / {total}</span><h2 id={`${id}-preview-title`}>{selected.name}</h2></div>
          <button ref={closeButton} type="button" onClick={() => setSelectedIndex(null)} aria-label="꼬마 강아지 미리보기 닫기"><X size={22} aria-hidden="true" /></button>
        </header>
        <div className="tiny-puppy-preview-layout" key={selected.id}>
          <div className="tiny-puppy-large-canvas"><PuppyImage candidate={selected} eager /><span>확대해서 보기</span></div>
          <div className="tiny-puppy-preview-sizes"><h3>실제 크기로 보기</h3><ActualSizePreview candidate={selected} /><p>48px · 64px</p></div>
        </div>
        <div className="pixel-art-dialog-copy">
          <p id={`${id}-preview-description`}>{selected.direction || "상상 속 꼬마 강아지 픽셀아트 시안"}</p>
          <span>원본 {selected.width} × {selected.height}px</span>
        </div>
        <footer className="pixel-art-dialog-footer tiny-puppy-dialog-footer">
          <div className="pixel-art-preview-navigation">
            <button type="button" disabled={selectedIndex === 0} onClick={() => movePreview(-1)}><ChevronLeft size={17} aria-hidden="true" /> 이전 시안</button>
            <button type="button" disabled={selectedIndex === total - 1} onClick={() => movePreview(1)}>다음 시안 <ChevronRight size={17} aria-hidden="true" /></button>
          </div>
          <div className="tiny-puppy-dialog-actions">{favoriteButton(selected)}<Downloads candidate={selected} /></div>
          <small>← → 시안 이동 · Esc 닫기</small>
          <p className="tiny-puppy-dialog-notice" role="status" aria-live="polite">{notice}</p>
        </footer>
      </div>}
    </dialog>
  </section>;
}
