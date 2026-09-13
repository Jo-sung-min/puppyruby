"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Check, CheckCheck, Expand, Grid2X2, Pause, Play, RefreshCw, RotateCcw, Save, Trash2 } from "lucide-react";
import { AnimatedDog, type AnimatedDogAction } from "../animated-dog";
import { AdminDogVarieties } from "./admin-dog-varieties";
import { cuteDogAssetPaths, cuteDogStyles, isCuteDogStyleId } from "@/lib/cute-dog-styles";
import { isPremiumDogStyleId, premiumDogAsset, premiumDogStyles } from "@/lib/premium-dog-styles";
import { AdminDogStylePreview } from "./admin-dog-style-preview";
import { AdminSoftPixelPreview } from "./admin-soft-pixel-preview";
import { SoftPixelDog } from "../soft-pixel-dog";
import { defaultSoftPixelColor, parseSoftPixelChoice, softPixelCandidates, softPixelChoiceKey, type SoftPixelChoice, type SoftPixelEye, type SoftPixelLook } from "@/lib/soft-pixel-candidates";
import { assetUrl } from "@/lib/asset-url";
import { isOriginalArtDogStyleId, originalArtDogAsset } from "@/lib/original-art-dog-styles";
import { art16SceneStyleId } from "@/lib/art16-scene-styles";
import { isSpSceneStyleId } from "@/lib/sp-scene-styles";
import { isNativeSceneStyle, nativeDogSceneAsset, nativeDogSceneId, nativeDogScenes, type DogSceneId } from "@/lib/native-dog-scenes";
import { publishAppearance } from "@/components/dog-appearance-provider";
import { AccountError, accountErrorMessage, adminFetch, isAccountAccessError } from "@/lib/account";
import { parseAppearance } from "@/lib/dog-appearance";
import {
  defaultAppearance,
  activeDogStyles,
  dogStyles,
  isDogStyleId,
  resolveDogStyle,
  resolveDogVariety,
  styleBreeds,
  type AppearanceConfig,
  type DogStyleId,
} from "@/lib/dog-styles";
import { PixelDog, type PixelBreed, type PixelMood } from "../pixel-dog";
import { AccountFailure, AccountLoading, AccountNotice, SubmitLabel } from "./account-ui";

const previewMoods: { id: PixelMood; name: string }[] = [
  { id: "idle", name: "기본 표정" },
  { id: "love", name: "좋아해요" },
  { id: "play", name: "놀고 있어요" },
  { id: "sleep", name: "잠들었어요" },
];
const animationActions: { id: AnimatedDogAction; name: string }[] = [
  { id: "idle", name: "기본" }, { id: "blink", name: "눈 깜빡" }, { id: "wag", name: "꼬리 흔들기" },
  { id: "walk", name: "걷기" }, { id: "sit", name: "앉기" }, { id: "sleep", name: "잠자기" },
];
const PAGE_SIZE = 12;

function cloneAppearance(config: AppearanceConfig): AppearanceConfig {
  return { ...config, breedStyles: { ...config.breedStyles }, deletedStyles: [...(config.deletedStyles ?? [])],
    varieties: (config.varieties ?? []).map(item => ({ ...item })), breedVarieties: { ...config.breedVarieties } };
}

function styleName(id: DogStyleId): string {
  return dogStyles.find(style => style.id === id)?.name ?? "클래식 도트";
}

function countChanges(saved: AppearanceConfig, draft: AppearanceConfig): number {
  return Number(saved.defaultStyle !== draft.defaultStyle)
    + styleBreeds.filter(breed => saved.breedStyles[breed.id] !== draft.breedStyles[breed.id]).length
    + dogStyles.filter(style => (saved.deletedStyles ?? []).includes(style.id) !== (draft.deletedStyles ?? []).includes(style.id)).length
    + styleBreeds.filter(breed => saved.breedVarieties?.[breed.id] !== draft.breedVarieties?.[breed.id]).length
    + [...new Set([...(saved.varieties ?? []).map(item => item.id), ...(draft.varieties ?? []).map(item => item.id)])]
      .filter(id => JSON.stringify(saved.varieties?.find(item => item.id === id)) !== JSON.stringify(draft.varieties?.find(item => item.id === id))).length;
}

export function AdminDogStyles({ onAccessError }: { onAccessError: (problem: unknown) => void }) {
  const id = useId();
  const [saved, setSaved] = useState<AppearanceConfig | null>(null);
  const [draft, setDraft] = useState<AppearanceConfig | null>(null);
  const [selectedBreed, setSelectedBreed] = useState<PixelBreed>(styleBreeds[0].id);
  const [breedSearch, setBreedSearch] = useState("");
  const [selectedVarietyId, setSelectedVarietyId] = useState("");
  const [page, setPage] = useState(1);
  const [expandedStyle, setExpandedStyle] = useState<DogStyleId | null>(null);
  const [action, setAction] = useState<AnimatedDogAction>("idle");
  const [scene, setScene] = useState<DogSceneId>("idle");
  const [paused, setPaused] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState<DogStyleId>(defaultAppearance.defaultStyle);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [candidateChoice, setCandidateChoice] = useState<SoftPixelChoice | null>(null);
  const [candidateEye, setCandidateEye] = useState<SoftPixelEye>("bean");
  const [candidateColor, setCandidateColor] = useState(defaultSoftPixelColor);
  const [candidateLook, setCandidateLook] = useState<SoftPixelLook>({ x: 0, y: 0 });
  const [candidateNotice, setCandidateNotice] = useState("");
  const [mood, setMood] = useState<PixelMood>("idle");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [previewMessage, setPreviewMessage] = useState("");
  const [conflict, setConflict] = useState(false);
  const [confirmReload, setConfirmReload] = useState(false);
  const alive = useRef(false);
  const working = useRef(false);

  const acceptConfig = useCallback((config: AppearanceConfig, breed: PixelBreed, targetId?: string) => {
    setSaved(cloneAppearance(config));
    setDraft(cloneAppearance(config));
    const variety = targetId === undefined ? resolveDogVariety(config, breed) : config.varieties?.find(item => item.id === targetId && item.breed === breed);
    setSelectedStyle(variety?.style ?? config.breedStyles[breed] ?? config.defaultStyle);
    setSelectedCandidateId(null);
    setSelectedVarietyId(variety?.id ?? "");
    setPage(1);
    setConflict(false);
    setConfirmReload(false);
    setPreviewMessage("");
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(softPixelChoiceKey);
      const choice = raw ? parseSoftPixelChoice(JSON.parse(raw)) : null;
      if (choice) {
        setCandidateChoice(choice);
        setCandidateEye(choice.eye);
        setCandidateColor(choice.color);
      }
    } catch { /* Browsers with storage disabled still allow comparison. */ }
  }, []);

  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    alive.current = true;
    setLoading(true);
    adminFetch<AppearanceConfig>("appearance", undefined, controller.signal)
      .then(config => {
        if (!disposed) acceptConfig(parseAppearance(config), styleBreeds[0].id);
      })
      .catch(problem => {
        if (disposed) return;
        if (isAccountAccessError(problem)) onAccessError(problem);
        else setError(accountErrorMessage(problem));
      })
      .finally(() => { if (!disposed) setLoading(false); });
    return () => {
      disposed = true;
      alive.current = false;
      controller.abort();
    };
  }, [acceptConfig, onAccessError]);

  const changes = saved && draft ? countChanges(saved, draft) : 0;
  const busy = loading || saving;
  const availableStyles = [...activeDogStyles(draft)].sort((first, second) => Number(isNativeSceneStyle(second.id)) - Number(isNativeSceneStyle(first.id)));
  const deletedStyles = dogStyles.filter(style => (draft?.deletedStyles ?? []).includes(style.id));
  const chosenStyle = dogStyles.find(style => style.id === selectedStyle) ?? dogStyles[0];
  const chosenBreedName = styleBreeds.find(breed => breed.id === selectedBreed)?.name ?? "포메라니안";
  const selectedVariety = draft?.varieties?.find(item => item.id === selectedVarietyId && item.breed === selectedBreed);
  const pixelStyles = availableStyles.filter(style => style.kind === "pixel");
  const galleryEntries = [
    ...availableStyles.filter(style => isSpSceneStyleId(style.id)).map(style => ({ kind: "style" as const, style })),
    ...softPixelCandidates.map(candidate => ({ kind: "candidate" as const, candidate })),
    ...availableStyles.filter(style => !isSpSceneStyleId(style.id)).map(style => ({ kind: "style" as const, style })),
  ];
  const selectedCandidate = softPixelCandidates.find(candidate => candidate.id === selectedCandidateId);
  const pageCount = Math.max(1, Math.ceil(galleryEntries.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visibleEntries = galleryEntries.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const selectedCute = cuteDogStyles.find(style => style.id === selectedStyle);
  const selectedCuteAssets = isCuteDogStyleId(selectedStyle) ? cuteDogAssetPaths(selectedStyle) : null;
  const selectedPremium = premiumDogAsset(selectedStyle);
  const selectedOriginalArt = originalArtDogAsset(selectedStyle);
  const selectedScenes = nativeDogSceneAsset(selectedStyle, selectedBreed);
  const sceneOptions = nativeDogScenes(selectedStyle);
  const activeScene = nativeDogSceneId(selectedStyle, scene);
  const selectedSheet = selectedScenes?.scenes[activeScene];
  const breedQuery = breedSearch.trim().replace(/\s+/gu, "").toLocaleLowerCase();
  const matchingBreeds = styleBreeds.filter(breed => `${breed.name}${breed.id}`.replace(/\s+/gu, "").toLocaleLowerCase().includes(breedQuery));
  const coatPreviewStyle = pixelStyles.find(style => style.id === selectedStyle)?.id ?? pixelStyles[0]?.id ?? "classic";

  function selectTarget(breed: PixelBreed, varietyId: string) {
    const variety = draft?.varieties?.find(item => item.id === varietyId && item.breed === breed);
    setSelectedBreed(breed); setSelectedVarietyId(variety?.id ?? ""); setPage(1);
    setSelectedStyle(variety?.style ?? draft?.breedStyles[breed] ?? draft?.defaultStyle ?? "classic");
    setSelectedCandidateId(null);
  }

  function selectCandidate(candidateId: string) {
    setSelectedCandidateId(candidateId);
    setCandidateNotice("");
  }

  function chooseCandidate() {
    if (!selectedCandidate || busy) return;
    const choice = { id: selectedCandidate.id, eye: candidateEye, color: candidateColor };
    setCandidateChoice(choice);
    try {
      localStorage.setItem(softPixelChoiceKey, JSON.stringify(choice));
      setCandidateNotice(`${selectedCandidate.code} · ${selectedCandidate.name} 시안을 선택했어요. 눈 설정도 함께 기억해요.`);
    } catch {
      setCandidateNotice(`${selectedCandidate.code} 시안을 선택했어요. 브라우저 저장이 꺼져 있어 새로고침하면 선택이 사라질 수 있어요.`);
    }
  }

  async function reloadConfig() {
    if (working.current) return;
    working.current = true;
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const config = parseAppearance(await adminFetch<AppearanceConfig>("appearance"));
      if (!alive.current) return;
      acceptConfig(config, selectedBreed, selectedVarietyId);
      setSuccess("최신 스타일 설정을 불러왔어요.");
    } catch (problem) {
      if (!alive.current) return;
      if (isAccountAccessError(problem)) onAccessError(problem);
      else setError(accountErrorMessage(problem));
    } finally {
      working.current = false;
      if (alive.current) setLoading(false);
    }
  }

  function requestReload() {
    if (busy) return;
    if (changes || conflict) setConfirmReload(true);
    else void reloadConfig();
  }

  function editDraft(update: (current: AppearanceConfig) => AppearanceConfig, message = "") {
    if (busy) return;
    setDraft(current => current ? update(current) : current);
    setSuccess("");
    if (!conflict) setError("");
    setPreviewMessage(message);
    setConfirmReload(false);
  }

  function applyAll() {
    if (selectedCandidate) return;
    editDraft(
      current => ({ ...current, defaultStyle: selectedStyle, breedStyles: {}, breedVarieties: {},
        varieties: (current.varieties ?? []).map(item => ({ ...item, style: null })) }),
      `모든 견종의 미리보기를 ‘${chosenStyle.name}’로 바꿨어요. 개별 지정은 모두 해제했어요.`,
    );
  }

  function applyBreed() {
    if (selectedCandidate) return;
    editDraft(
      current => {
        const breedVarieties = { ...current.breedVarieties };
        if (selectedVariety) {
          breedVarieties[selectedBreed] = selectedVariety.id;
          const inheritedStyle = current.breedStyles[selectedBreed] ?? current.defaultStyle;
          const style = selectedVariety.style === null && selectedStyle === inheritedStyle ? null : selectedStyle;
          return { ...current, breedVarieties, varieties: (current.varieties ?? []).map(item => item.id === selectedVariety.id ? { ...item, style } : item) };
        }
        delete breedVarieties[selectedBreed];
        return { ...current, breedVarieties, breedStyles: { ...current.breedStyles, [selectedBreed]: selectedStyle } };
      },
      `${chosenBreedName}${selectedVariety ? ` > ${selectedVariety.name}` : ""}에 ‘${chosenStyle.name}’를 지정했어요. 저장하면 사이트의 ${chosenBreedName}에 적용돼요.`,
    );
  }

  function changeBreedStyle(breed: PixelBreed, value: string) {
    if (value !== "inherit" && !availableStyles.some(style => style.id === value)) return;
    editDraft(current => {
      const breedStyles = { ...current.breedStyles };
      if (value === "inherit") delete breedStyles[breed];
      else breedStyles[breed] = value as DogStyleId;
      return { ...current, breedStyles };
    });
  }

  function deleteStyle(styleId: DogStyleId) {
    if (!draft || busy || availableStyles.length <= 1) return;
    const remaining = availableStyles.filter(style => style.id !== styleId);
    if (!remaining.length) return;
    const nextDefault = draft.defaultStyle === styleId ? remaining[0].id : draft.defaultStyle;
    const breedStyles = { ...draft.breedStyles };
    const inUse = draft.defaultStyle === styleId || Object.values(breedStyles).includes(styleId) || draft.varieties?.some(item => item.style === styleId);
    for (const breed of styleBreeds) if (breedStyles[breed.id] === styleId) delete breedStyles[breed.id];
    editDraft(current => ({
      ...current, defaultStyle: nextDefault, breedStyles,
      varieties: (current.varieties ?? []).map(item => item.style === styleId ? { ...item, style: null } : item),
      deletedStyles: dogStyles.filter(style => style.id === styleId || (current.deletedStyles ?? []).includes(style.id)).map(style => style.id),
    }), `‘${styleName(styleId)}’를 삭제 목록으로 옮겼어요.${inUse ? " 적용 중인 강아지는 남아 있는 견종 또는 전체 기본 스타일을 이어받아요." : ""} 변경사항을 저장하면 반영돼요.`);
    if (selectedStyle === styleId) setSelectedStyle(nextDefault);
  }

  function restoreStyle(styleId: DogStyleId) {
    editDraft(current => ({ ...current, deletedStyles: (current.deletedStyles ?? []).filter(style => style !== styleId) }),
      `‘${styleName(styleId)}’를 다시 선택할 수 있어요. 변경사항을 저장해 주세요.`);
  }

  function revertDraft() {
    if (!saved || busy) return;
    setDraft(cloneAppearance(saved));
    setSelectedStyle(resolveDogStyle(saved, selectedBreed));
    setSelectedCandidateId(null);
    setSelectedVarietyId(resolveDogVariety(saved, selectedBreed)?.id ?? "");
    setPage(1);
    setSuccess("");
    if (!conflict) setError("");
    setConfirmReload(false);
    setPreviewMessage("처음 불러온 설정으로 되돌렸어요.");
  }

  async function saveConfig() {
    if (!saved || !draft || !changes || conflict || busy || working.current) return;
    working.current = true;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      parseAppearance(draft);
      const config = parseAppearance(await adminFetch<AppearanceConfig>("appearance", {
        defaultStyle: draft.defaultStyle,
        breedStyles: { ...draft.breedStyles },
        deletedStyles: [...(draft.deletedStyles ?? [])],
        varieties: (draft.varieties ?? []).map(item => ({ ...item })),
        breedVarieties: { ...draft.breedVarieties },
        expectedRevision: saved.revision,
      }));
      publishAppearance(config);
      if (!alive.current) return;
      acceptConfig(config, selectedBreed, selectedVarietyId);
      setSuccess("스타일 설정을 저장했어요. 사이트의 강아지에 적용됐어요.");
    } catch (problem) {
      if (!alive.current) return;
      if (isAccountAccessError(problem)) onAccessError(problem);
      else if (problem instanceof AccountError && problem.status === 409) {
        setConflict(true);
        setConfirmReload(true);
        setError("다른 곳에서 스타일 설정을 먼저 저장했어요. 작성 중인 미리보기는 유지했어요. 최신 설정을 불러온 뒤 다시 선택해 주세요.");
      } else setError(accountErrorMessage(problem));
    } finally {
      working.current = false;
      if (alive.current) setSaving(false);
    }
  }

  if (!saved || !draft) {
    return (
      <section className="account-card" aria-label="도트 스타일 설정">
        {loading ? <AccountLoading label="스타일 설정을 불러오고 있어요." />
          : <AccountFailure message={error || "스타일 설정을 불러오지 못했어요."} retry={() => void reloadConfig()} />}
      </section>
    );
  }

  return (
    <section className="admin-dog-styles" aria-labelledby={`${id}-heading`} aria-busy={busy}>
      <div className="account-card admin-dog-intro">
        <div className="admin-dog-heading">
          <div>
            <span className="account-kicker"><Grid2X2 size={14} aria-hidden="true" /> LITTLE PIXEL FRIENDS</span>
            <h2 id={`${id}-heading`}>강아지 도트 스타일</h2>
            <p>{styleBreeds.length}가지 견종의 모든 스타일을 한곳에서 비교하고, 마음에 드는 모습으로 적용하세요.</p>
          </div>
          <button type="button" className="account-button account-button-soft" onClick={requestReload} disabled={busy}>
            <RefreshCw size={15} aria-hidden="true" /> 설정 새로 불러오기
          </button>
        </div>
        <div className="admin-dog-preview-note">
          <strong>저장 전에는 미리보기만 바뀌어요.</strong>
          <span>스타일 적용과 삭제는 ‘변경사항 저장’을 눌러야 사이트에 반영돼요. 삭제한 스타일은 다시 복원할 수 있어요.</span>
        </div>
      </div>

      <AccountNotice kind="error">{error}</AccountNotice>
      <AccountNotice kind="success">{success}</AccountNotice>
      {confirmReload && (
        <div className="admin-dog-reload-confirm" role="group" aria-label="최신 설정 불러오기 확인">
          <p>현재 작성 중인 변경을 버리고 서버에 저장된 최신 설정을 불러와요.</p>
          <div>
            <button type="button" className="account-button account-button-soft" disabled={busy} onClick={() => setConfirmReload(false)}>계속 살펴보기</button>
            <button type="button" className="account-button" disabled={busy} onClick={() => void reloadConfig()}>
              <SubmitLabel busy={loading}>변경을 버리고 최신 설정 불러오기</SubmitLabel>
            </button>
          </div>
        </div>
      )}

      <div className="account-card admin-dog-comparison">
        <div className="admin-dog-controls">
          <div className="admin-dog-breed-picker">
            <label className="account-field" htmlFor={`${id}-breed-search`}><span>견종 찾기 · {styleBreeds.length}종</span><input id={`${id}-breed-search`} type="search" placeholder="예: 시바, 아키타, 비글" value={breedSearch} disabled={busy} onChange={event => setBreedSearch(event.target.value)} /></label>
            <label className="account-field" htmlFor={`${id}-breed`}>
              <span>비교할 견종</span>
              <select id={`${id}-breed`} value={selectedBreed} disabled={busy} onChange={event => {
                const breed = styleBreeds.find(item => item.id === event.target.value);
                if (breed) { selectTarget(breed.id, draft.breedVarieties?.[breed.id] ?? ""); setBreedSearch(""); }
              }}>
                {!matchingBreeds.some(breed => breed.id === selectedBreed) && <option value={selectedBreed}>{chosenBreedName} · 현재 선택</option>}
                {matchingBreeds.map(breed => <option value={breed.id} key={breed.id}>{breed.name}</option>)}
              </select>
            </label>
            {breedQuery && <p className="admin-dog-breed-search-result" role="status">{matchingBreeds.length ? `검색한 견종 ${matchingBreeds.length}종 · 목록에서 선택해 주세요.` : "검색 결과가 없어요. 다른 이름으로 찾아 주세요."}</p>}
            <button type="button" className="admin-dog-shiba-shortcut" disabled={busy} onClick={() => { setBreedSearch(""); selectTarget("shiba", draft.breedVarieties?.shiba ?? ""); }}>시바 색상 10종 바로 보기</button>
          </div>
          <label className="account-field" htmlFor={`${id}-variety`}>
            <span>비교할 종류</span>
            <select id={`${id}-variety`} value={selectedVariety?.id ?? ""} disabled={busy} onChange={event => selectTarget(selectedBreed, event.target.value)}>
              <option value="">기본형</option>
              {(draft.varieties ?? []).filter(item => item.breed === selectedBreed).map(item => <option key={item.id} value={item.id}>{item.name || "이름을 입력해 주세요"}</option>)}
            </select>
          </label>
          <label className="account-field" htmlFor={`${id}-mood`}>
            <span>미리보기 표정</span>
            <select id={`${id}-mood`} value={mood} disabled={busy} onChange={event => {
              const next = previewMoods.find(item => item.id === event.target.value);
              if (next) setMood(next.id);
            }}>
              {previewMoods.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}
            </select>
          </label>
        </div>
        <AdminDogVarieties key={selectedBreed} config={draft} breed={selectedBreed} selected={selectedVariety} busy={busy} previewStyle={coatPreviewStyle} edit={editDraft}
          select={varietyId => { setSelectedCandidateId(null); setSelectedVarietyId(varietyId); setPage(1); setSelectedStyle(draft.varieties?.find(variety => variety.id === varietyId && variety.breed === selectedBreed)?.style ?? draft.breedStyles[selectedBreed] ?? draft.defaultStyle); }}
          inherit={() => { setSelectedCandidateId(null); setSelectedStyle(draft.breedStyles[selectedBreed] ?? draft.defaultStyle); }} />

        <div id={`${id}-style-choices`} className="admin-dog-comparison-layout">
          <fieldset className="admin-dog-gallery" disabled={busy}>
            <legend>도트 스타일 <span>· {chosenBreedName}{selectedVariety ? ` > ${selectedVariety.name}` : ""} · 한 페이지 12개</span></legend>
            <div className="admin-dog-all-styles" role="group" aria-label="도트 스타일 모음">
              <button type="button" aria-pressed="true" disabled={busy} onClick={() => setPage(1)}>전체 {galleryEntries.length}개</button>
            </div>
            {softPixelCandidates.length > 0 && <p className="admin-soft-pixel-gallery-note">새 강아지 스타일 시안 {softPixelCandidates.length}개를 비교해요. 눈동자를 바꿔 보고, 30견종 제작에 사용할 시안 하나를 골라 주세요.</p>}
            <div className="admin-dog-style-grid">
              {visibleEntries.map(entry => {
                if (entry.kind === "candidate") {
                  const candidate = entry.candidate;
                  return <div className="admin-dog-style-tile" key={candidate.id} data-premium="true" data-candidate={candidate.id}>
                    <label className="admin-dog-style-option">
                      <input className="account-sr-only" type="radio" name={`${id}-style`} value={candidate.id} checked={selectedCandidateId === candidate.id} onChange={() => selectCandidate(candidate.id)} />
                      <span className="admin-dog-style-card">
                        <span className="admin-dog-style-mark" aria-hidden="true">{selectedCandidateId === candidate.id && <Check size={13} />}</span>
                        <span className="admin-cute-source">새 시안 · {candidate.code}</span>
                        <span className="admin-dog-card-art"><SoftPixelDog candidate={candidate} eye={candidateEye} color={candidateColor} look={candidateLook} decorative /></span>
                        <strong>{candidate.name}</strong>
                        <span className="admin-dog-style-description">{candidate.description}</span>
                        {candidateChoice?.id === candidate.id && <span className="admin-dog-current-label">선택한 시안</span>}
                      </span>
                    </label>
                    <div className="admin-dog-tile-actions"><button type="button" className="admin-premium-expand" disabled={busy} onClick={() => selectCandidate(candidate.id)} aria-label={`${candidate.code} 눈동자 바꿔 보기`}>눈동자 바꿔 보기</button></div>
                  </div>;
                }
                const style = entry.style;
                return (
                <div className="admin-dog-style-tile" key={style.id} data-premium={isPremiumDogStyleId(style.id) || isOriginalArtDogStyleId(style.id) || isNativeSceneStyle(style.id)}>
                <label className="admin-dog-style-option">
                  <input
                    className="account-sr-only" type="radio" name={`${id}-style`} value={style.id}
                    checked={!selectedCandidate && selectedStyle === style.id} onChange={() => { setSelectedCandidateId(null); setSelectedStyle(style.id); }}
                  />
                  <span className="admin-dog-style-card">
                    <span className="admin-dog-style-mark" aria-hidden="true">{!selectedCandidate && selectedStyle === style.id && <Check size={13} />}</span>
                    {isCuteDogStyleId(style.id) && <span className="admin-cute-source">{cuteDogStyles.find(item => item.id === style.id)?.source}에서 이어진 강아지</span>}
                    {isPremiumDogStyleId(style.id) && <span className="admin-cute-source">{premiumDogStyles.find(item => item.id === style.id)?.code} · 원본 색상 유지</span>}
                    {isOriginalArtDogStyleId(style.id) && <span className="admin-cute-source">시안 {style.id.replace("art-", "")} · 원본 색상 유지</span>}
                    {style.id === art16SceneStyleId && <span className="admin-cute-source">16번 스타일 · {styleBreeds.length}견종 · 5장면</span>}
                    {isSpSceneStyleId(style.id) && <span className="admin-cute-source">{style.id.slice(0, 4).toUpperCase()} · {styleBreeds.length}견종 · 6장면</span>}
                    {style.id === "animated-2d" && <span className="admin-cute-source">움직이는 2D</span>}
                    <span className="admin-dog-card-art"><PixelDog breed={selectedBreed} styleId={style.id} mood={mood} variant={selectedVariety} decorative /></span>
                    <strong>{style.name}</strong>
                    <span className="admin-dog-style-description">{style.description}</span>
                    {resolveDogStyle(saved, selectedBreed) === style.id && <span className="admin-dog-current-label">현재 적용</span>}
                  </span>
                </label>
                <div className="admin-dog-tile-actions"><button type="button" className="admin-premium-expand" disabled={busy} aria-haspopup="dialog" aria-label={`${style.name} 크게 보기`} onClick={() => setExpandedStyle(style.id)}><Expand size={14} aria-hidden="true" /> 크게 보기</button>
                  <button type="button" className="admin-dog-delete" aria-label={`${style.name} 삭제`} disabled={busy || availableStyles.length <= 1} onClick={() => deleteStyle(style.id)} title={availableStyles.length <= 1 ? "스타일은 최소 1개 남겨야 해요." : `${style.name} 삭제`}><Trash2 size={13} aria-hidden="true" /> 삭제</button></div>
                </div>
              ); })}
            </div>
            {galleryEntries.length === 0 && <p className="admin-dog-delete-note">선택할 스타일이 없어요. 삭제한 스타일을 복원해 보세요.</p>}
            <nav className="admin-dog-pagination" aria-label="도트 스타일 페이지">
              <button type="button" disabled={busy || currentPage === 1} onClick={() => setPage(currentPage - 1)}>이전</button>
              {Array.from({ length: pageCount }, (_, index) => index + 1).map(number => <button key={number} type="button" disabled={busy} aria-current={number === currentPage ? "page" : undefined} aria-label={`${number}페이지`} onClick={() => setPage(number)}>{number}</button>)}
              <button type="button" disabled={busy || currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>다음</button>
              <span role="status">{currentPage} / {pageCount} 페이지 · {galleryEntries.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0}–{Math.min(currentPage * PAGE_SIZE, galleryEntries.length)} / {galleryEntries.length}개</span>
            </nav>
            {availableStyles.length === 1 && <p className="admin-dog-delete-note">강아지를 표시하려면 스타일을 최소 1개 남겨야 해요.</p>}
          </fieldset>

          {selectedCandidate ? <AdminSoftPixelPreview key={selectedCandidate.id} candidate={selectedCandidate} eye={candidateEye} color={candidateColor} look={candidateLook}
            choice={candidateChoice} busy={busy} notice={candidateNotice} onEye={setCandidateEye} onColor={setCandidateColor} onLook={setCandidateLook} onChoose={chooseCandidate} />
            : <aside className="admin-dog-selected" data-premium={!!selectedPremium || !!selectedOriginalArt || isNativeSceneStyle(selectedStyle)} aria-labelledby={`${id}-selected-heading`}>
            <span className="admin-dog-eyebrow">선택한 스타일</span>
            <div className="admin-dog-selected-art">{selectedStyle === "animated-2d"
              ? <AnimatedDog breed={selectedBreed} variant={selectedVariety} action={action} paused={paused} decorative />
              : <PixelDog breed={selectedBreed} styleId={selectedStyle} mood={mood} scene={isNativeSceneStyle(selectedStyle) ? activeScene : undefined} paused={paused} variant={selectedVariety} decorative />}</div>
            <div className="admin-dog-selected-copy">
              <h3 id={`${id}-selected-heading`}>{chosenStyle.name}</h3>
              <p>{chosenStyle.description}</p>
              <span>{chosenBreedName}{selectedVariety ? ` > ${selectedVariety.name}` : ""} · {isNativeSceneStyle(selectedStyle) ? sceneOptions.find(item => item.id === activeScene)?.name : selectedStyle === "animated-2d" ? animationActions.find(item => item.id === action)?.name : previewMoods.find(item => item.id === mood)?.name}</span>
              {selectedCute && <span>{selectedCute.source} 기반 · {selectedCute.familyName}</span>}
              {selectedPremium && <span>원본 색상 유지 · {selectedPremium.width} × {selectedPremium.height}px<br />견종별 색·무늬 변경은 적용하지 않아요.</span>}
              {selectedOriginalArt && <span>시안 {selectedOriginalArt.id.replace("art-", "")} · {selectedOriginalArt.width} × {selectedOriginalArt.height}px<br />원래의 털색과 표정을 유지해요.</span>}
            </div>
            {isNativeSceneStyle(selectedStyle) && <div className="admin-dog-scene-controls">
              <div role="group" aria-label="강아지 장면">{sceneOptions.map(item => <button type="button" key={item.id} aria-pressed={activeScene === item.id} disabled={busy} onClick={() => setScene(item.id)}>{item.name}</button>)}</div>
              <p>{sceneOptions.find(item => item.id === activeScene)?.description}</p>
              {(activeScene === "walk" || activeScene === "wag") && <button type="button" disabled={busy} aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? <Play size={14} /> : <Pause size={14} />}{paused ? "동작 재생" : "동작 정지"}</button>}
            </div>}
            {selectedStyle === "animated-2d" && <div className="admin-dog-scene-controls">
              <div role="group" aria-label="2D 강아지 동작">{animationActions.map(item => <button type="button" key={item.id} aria-pressed={action === item.id} disabled={busy} onClick={() => setAction(item.id)}>{item.name}</button>)}</div>
              <button type="button" disabled={busy} aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? <Play size={14} /> : <Pause size={14} />}{paused ? "동작 재생" : "동작 정지"}</button>
            </div>}
            <button type="button" className="admin-premium-expand" aria-haspopup="dialog" disabled={busy} onClick={() => setExpandedStyle(selectedStyle)}><Expand size={14} aria-hidden="true" /> 크게 보기</button>
            {selectedCuteAssets && <div className="admin-cute-downloads"><a href={assetUrl(selectedCuteAssets.png)} download>원본 PNG</a><a href={selectedCuteAssets.aseprite} download>Aseprite</a></div>}
            {selectedPremium && <div className="admin-cute-downloads"><a href={assetUrl(selectedPremium.png)} download>원본 PNG</a><a href={selectedPremium.aseprite} download>Aseprite</a></div>}
            {selectedOriginalArt && <div className="admin-cute-downloads"><a href={assetUrl(selectedOriginalArt.png)} download>강아지 PNG</a><a href={selectedOriginalArt.aseprite} download>Aseprite</a></div>}
            {selectedScenes && selectedSheet && <div className="admin-cute-downloads"><a href={assetUrl(selectedSheet.png)} download>{selectedSheet.frames > 1 ? "동작 프레임 PNG" : "장면 PNG"}</a><a href={selectedScenes.aseprite} download>Aseprite</a></div>}
            <div className="admin-dog-apply-actions">
              <button type="button" className="account-button" disabled={busy} onClick={applyAll}>
                <CheckCheck size={16} aria-hidden="true" /> 전체 견종에 적용
              </button>
              <button type="button" className="account-button account-button-soft" disabled={busy} onClick={applyBreed}>
                <Check size={16} aria-hidden="true" /> {selectedVariety ? "이 종류를 견종에 적용" : "이 견종에만 적용"}
              </button>
              <small>전체 적용은 모든 개별 지정을 해제해요.<br />아직 저장되지는 않아요.</small>
            </div>
          </aside>}
        </div>
        <AccountNotice>{previewMessage}</AccountNotice>
      </div>

      {deletedStyles.length > 0 && <details className="account-card admin-dog-deleted">
        <summary>삭제한 스타일 <span>{deletedStyles.length}개</span></summary>
        <p>복원하면 스타일 목록에 다시 나타나요. 복원한 뒤 변경사항을 저장해 주세요.</p>
        <div className="admin-dog-deleted-grid">{deletedStyles.map(style => <div key={style.id} className="admin-dog-deleted-item">
          <span className="admin-dog-deleted-art"><PixelDog breed={selectedBreed} styleId={style.id} mood={mood} variant={selectedVariety} decorative /></span>
          <strong>{style.name}</strong><button type="button" className="account-button account-button-soft" disabled={busy} onClick={() => restoreStyle(style.id)} aria-label={`${style.name} 복원`}><RotateCcw size={13} aria-hidden="true" /> 복원</button>
        </div>)}</div>
      </details>}

      <section className="account-card admin-dog-assignments" aria-labelledby={`${id}-assignments-heading`}>
        <div className="account-section-heading">
          <div>
            <h2 id={`${id}-assignments-heading`}>저장할 모습 미리보기</h2>
            <p>전체 기본 스타일을 정하거나 견종마다 다른 모습을 골라요.</p>
          </div>
        </div>
        <div className="admin-dog-default-row">
          <div className="admin-dog-default-art"><PixelDog breed={selectedBreed} styleId={draft.defaultStyle} mood={mood} decorative /></div>
          <label className="account-field" htmlFor={`${id}-default`}>
            <span>전체 기본 스타일</span>
            <select id={`${id}-default`} value={draft.defaultStyle} disabled={busy} onChange={event => {
              const value = event.target.value;
              if (isDogStyleId(value)) editDraft(current => ({ ...current, defaultStyle: value }));
            }}>
              {availableStyles.map(style => <option value={style.id} key={style.id}>{style.name}</option>)}
            </select>
            <small>‘전체 기본 사용’인 견종만 함께 바뀌어요. 개별 지정한 견종은 그대로예요.</small>
          </label>
        </div>
        <div className="admin-dog-breed-grid">
          {styleBreeds.map(breed => {
            const override = draft.breedStyles[breed.id];
            const variety = resolveDogVariety(draft, breed.id);
            const effectiveStyle = resolveDogStyle(draft, breed.id);
            const changed = saved.breedStyles[breed.id] !== override
              || resolveDogStyle(saved, breed.id) !== effectiveStyle
              || JSON.stringify(resolveDogVariety(saved, breed.id)) !== JSON.stringify(variety);
            return (
              <div className="admin-dog-breed-row" key={breed.id}>
                <div className="admin-dog-breed-art"><PixelDog breed={breed.id} styleId={effectiveStyle} mood={mood} variant={variety} decorative /></div>
                <div className="account-field">
                  <span className="admin-dog-breed-label">
                    <strong>{breed.name}</strong>
                    {changed && <span className="admin-dog-draft-label">변경</span>}
                  </span>
                  <label className="account-sr-only" htmlFor={`${id}-active-variety-${breed.id}`}>{breed.name} 적용 종류</label>
                  <select id={`${id}-active-variety-${breed.id}`} value={variety?.id ?? ""} disabled={busy} onChange={event => {
                    const value = event.target.value;
                    editDraft(current => { const breedVarieties = { ...current.breedVarieties };
                      if (!value) delete breedVarieties[breed.id];
                      else if (current.varieties?.some(item => item.id === value && item.breed === breed.id)) breedVarieties[breed.id] = value;
                      return { ...current, breedVarieties }; });
                  }}><option value="">기본형</option>{(draft.varieties ?? []).filter(item => item.breed === breed.id).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
                  <label className="account-sr-only" htmlFor={`${id}-override-${breed.id}`}>{breed.name} 기본 스타일</label>
                  <select
                    id={`${id}-override-${breed.id}`} value={override ?? "inherit"} disabled={busy}
                    aria-label={`${breed.name} 스타일`} onChange={event => changeBreedStyle(breed.id, event.target.value)}
                  >
                    <option value="inherit">전체 기본 사용 · {styleName(draft.defaultStyle)}</option>
                    {availableStyles.map(style => <option value={style.id} key={style.id}>{style.name}</option>)}
                  </select>
                  <small>{variety ? `${variety.name}${variety.style ? " 개별 스타일" : " · 견종 스타일 상속"}` : override ? "개별 지정" : "전체 기본 사용"} · {styleName(effectiveStyle)}</small>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="admin-dog-savebar">
        <div className="admin-dog-save-status" role="status" aria-live="polite">
          <strong>{conflict ? "최신 설정 확인이 필요해요" : changes ? `저장하지 않은 변경 ${changes}곳` : "저장된 설정과 같아요"}</strong>
          <span>{conflict ? "미리보기는 보존되어 있어요." : changes ? "변경사항 저장을 눌러 반영해 주세요." : saved.updatedAt
            ? `마지막 저장 · ${new Date(saved.updatedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "short" })}`
            : "아직 전체 스타일을 변경하지 않았어요."}</span>
        </div>
        <div className="admin-dog-save-actions">
          <button type="button" className="account-button account-button-soft" disabled={busy || !changes} onClick={revertDraft}>
            <RotateCcw size={15} aria-hidden="true" /> 변경 되돌리기
          </button>
          <button type="button" className="account-button" disabled={busy || !changes || conflict} onClick={() => void saveConfig()}>
            {!saving && <Save size={15} aria-hidden="true" />}<SubmitLabel busy={saving}>{saving ? "저장 중…" : "변경사항 저장"}</SubmitLabel>
          </button>
        </div>
      </div>
      <AdminDogStylePreview key={expandedStyle ?? "closed"} selected={expandedStyle} available={availableStyles.map(style => style.id)} breed={selectedBreed} variant={selectedVariety} mood={mood} busy={busy} onClose={() => setExpandedStyle(null)} onSelect={style => {
        setSelectedCandidateId(null);
        setSelectedStyle(style);
        setPage(Math.floor((softPixelCandidates.length + availableStyles.findIndex(item => item.id === style)) / PAGE_SIZE) + 1);
        setPreviewMessage("스타일을 선택했어요. 전체 또는 견종에 적용한 뒤 저장해 주세요.");
      }} />
    </section>
  );
}

