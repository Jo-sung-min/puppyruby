"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, X } from "lucide-react";
import { assetUrl } from "@/lib/asset-url";
import { isNativeSceneStyle, nativeDogSceneAsset, nativeDogSceneId, nativeDogScenes, type DogSceneId } from "@/lib/native-dog-scenes";
import { dogStyles, styleBreeds, type DogStyleId, type DogVariantLook } from "@/lib/dog-styles";
import { originalArtDogAsset } from "@/lib/original-art-dog-styles";
import { premiumDogAsset } from "@/lib/premium-dog-styles";
import { PixelDog, type PixelBreed, type PixelMood } from "../pixel-dog";
import { rubyRoundStyleId } from "@/lib/ruby-round-scene-styles";
import { RubyEyePicker } from "../ruby-eye-picker";

export function AdminDogStylePreview({ selected, available, breed, variant, mood, eyeStyle = "ruby-eye-01", busy, onClose, onSelect }: {
  selected: DogStyleId | null;
  available: DogStyleId[];
  breed: PixelBreed;
  variant?: DogVariantLook;
  mood: PixelMood;
  eyeStyle?: string;
  busy: boolean;
  onClose: () => void;
  onSelect: (id: DogStyleId) => void;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [previewId, setPreviewId] = useState(selected);
  const [size, setSize] = useState<256 | 384 | "original">(384);
  const [scene, setScene] = useState<DogSceneId>("idle");
  const [paused, setPaused] = useState(false);
  const [roundEye, setRoundEye] = useState(eyeStyle);
  const choices = dogStyles.filter(style => available.includes(style.id)).sort((first, second) => available.indexOf(first.id) - available.indexOf(second.id));
  const style = choices.find(item => item.id === previewId);
  const asset = premiumDogAsset(previewId) ?? originalArtDogAsset(previewId);
  const sceneAsset = nativeDogSceneAsset(previewId, breed);
  const sceneOptions = nativeDogScenes(previewId);
  const activeScene = nativeDogSceneId(previewId, scene);
  const selectedSheet = sceneAsset?.scenes[activeScene];
  const nativeAsset = asset ?? sceneAsset;
  const index = choices.findIndex(item => item.id === previewId);
  const breedName = styleBreeds.find(item => item.id === breed)?.name;
  const open = selected !== null;
  const originalSize = size === "original" && !!nativeAsset;
  const displayWidth = originalSize ? nativeAsset.width : size === "original" ? 384 : size;

  useEffect(() => {
    if (!open || !dialog.current) return;
    const panel = dialog.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    panel.showModal();
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    return () => {
      if (panel.open) panel.close();
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus({ preventScroll: true });
    };
  }, [open]);

  function move(direction: -1 | 1) {
    const next = choices[index + direction];
    if (!next) return;
    setPreviewId(next.id);
    setSize(384);
    setScene("idle");
    setPaused(false);
  }

  return <dialog ref={dialog} className="admin-premium-dialog admin-style-preview-dialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}
    onKeyDown={event => {
      if (event.key === "ArrowLeft") { event.preventDefault(); move(-1); }
      if (event.key === "ArrowRight") { event.preventDefault(); move(1); }
    }}>
    {style && <div className="admin-premium-dialog-inner">
      <header>
        <div><span>{breedName} · 도트 스타일</span><h2 id={`${id}-title`}>{style.name}</h2></div>
        <button ref={closeButton} type="button" aria-label="도트 스타일 미리보기 닫기" onClick={onClose}><X size={22} aria-hidden="true" /></button>
      </header>
      <div className="admin-premium-size-controls" role="group" aria-label="도트 표시 크기">
        {([256, 384] as const).map(value => <button type="button" key={value} aria-pressed={size === value} onClick={() => setSize(value)}>{value}px</button>)}
        {nativeAsset && <button type="button" aria-pressed={size === "original"} onClick={() => setSize("original")}>원본 크기</button>}
      </div>
      {isNativeSceneStyle(style.id) && <div className="admin-dog-scene-controls admin-style-preview-scenes">
        <div role="group" aria-label="확대 미리보기 장면">{sceneOptions.map(item => <button type="button" key={item.id} aria-pressed={activeScene === item.id} onClick={() => setScene(item.id)}>{item.name}</button>)}</div>
        {(selectedSheet?.frames ?? 1) > 1 && <button type="button" aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}{paused ? "동작 재생" : "동작 정지"}</button>}
      </div>}
      <div className="admin-premium-image-scroll" tabIndex={originalSize ? 0 : undefined} aria-label="강아지 확대 이미지" data-original-size={originalSize}>
        {asset ? <Image className="admin-premium-source-image" src={assetUrl(asset.png)} width={asset.width} height={asset.height} alt={style.name} unoptimized draggable={false} loading="eager"
          style={{ width: displayWidth, height: displayWidth * asset.height / asset.width }} />
          : <div className="admin-style-preview-art" style={{ width: displayWidth, aspectRatio: sceneAsset ? `${sceneAsset.width} / ${sceneAsset.height}` : undefined }}><PixelDog breed={breed} styleId={style.id} variant={variant} mood={mood} eyeStyle={roundEye} scene={isNativeSceneStyle(style.id) ? activeScene : undefined} paused={paused} /></div>}
      </div>
      {style.id === rubyRoundStyleId && <RubyEyePicker value={roundEye} onChange={setRoundEye} disabled={busy} />}
      <p id={`${id}-description`}>{isNativeSceneStyle(style.id) ? sceneOptions.find(item => item.id === activeScene)?.description : style.description}</p>
      {nativeAsset && <p className="admin-premium-native-size">{sceneAsset ? "한 장면 원본" : "원본"} {nativeAsset.width} × {nativeAsset.height}px · 원래의 털색과 표정을 유지해요.{originalSize && " 큰 이미지는 가로·세로로 스크롤할 수 있어요."}</p>}
      <footer>
        <div className="admin-premium-preview-navigation">
          <button type="button" disabled={index <= 0} onClick={() => move(-1)}><ChevronLeft size={16} aria-hidden="true" /> 이전</button>
          <span>{index + 1} / {choices.length}</span>
          <button type="button" disabled={index === choices.length - 1} onClick={() => move(1)}>다음 <ChevronRight size={16} aria-hidden="true" /></button>
        </div>
        <div className="admin-premium-dialog-actions">
          {asset && <><a href={assetUrl(asset.png)} download>원본 PNG</a><a href={asset.aseprite} download>Aseprite</a></>}
          {sceneAsset && selectedSheet && <><a href={assetUrl(selectedSheet.png)} download>{style.id === rubyRoundStyleId ? "몸통 프레임 PNG" : selectedSheet.frames > 1 ? "동작 프레임 PNG" : "장면 PNG"}</a><a href={assetUrl(sceneAsset.aseprite)} download>Aseprite</a></>}
          {style.id === rubyRoundStyleId && <a href={assetUrl("/downloads/ruby-round-v1/ruby-round-eyes.aseprite")} download>공통 눈 Aseprite</a>}
          <button type="button" className="account-button" disabled={busy} onClick={() => { onSelect(style.id); onClose(); }}>이 스타일 선택</button>
        </div>
        <small>전체 또는 견종에 적용하고 변경사항을 저장하면 사이트에 반영돼요.</small>
      </footer>
    </div>}
  </dialog>;
}

