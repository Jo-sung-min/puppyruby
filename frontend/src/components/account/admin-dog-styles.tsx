"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Check, CheckCheck, Grid2X2, RefreshCw, RotateCcw, Save } from "lucide-react";
import { publishAppearance } from "@/components/dog-appearance-provider";
import { AccountError, accountErrorMessage, adminFetch, isAccountAccessError } from "@/lib/account";
import { parseAppearance } from "@/lib/dog-appearance";
import {
  defaultAppearance,
  dogStyles,
  isDogStyleId,
  resolveDogStyle,
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

function cloneAppearance(config: AppearanceConfig): AppearanceConfig {
  return { ...config, breedStyles: { ...config.breedStyles } };
}

function styleName(id: DogStyleId): string {
  return dogStyles.find(style => style.id === id)?.name ?? "클래식 도트";
}

function countChanges(saved: AppearanceConfig, draft: AppearanceConfig): number {
  return Number(saved.defaultStyle !== draft.defaultStyle)
    + styleBreeds.filter(breed => saved.breedStyles[breed.id] !== draft.breedStyles[breed.id]).length;
}

export function AdminDogStyles({ onAccessError }: { onAccessError: (problem: unknown) => void }) {
  const id = useId();
  const [saved, setSaved] = useState<AppearanceConfig | null>(null);
  const [draft, setDraft] = useState<AppearanceConfig | null>(null);
  const [selectedBreed, setSelectedBreed] = useState<PixelBreed>(styleBreeds[0].id);
  const [selectedStyle, setSelectedStyle] = useState<DogStyleId>(defaultAppearance.defaultStyle);
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

  const acceptConfig = useCallback((config: AppearanceConfig, breed: PixelBreed) => {
    setSaved(cloneAppearance(config));
    setDraft(cloneAppearance(config));
    setSelectedStyle(resolveDogStyle(config, breed));
    setConflict(false);
    setConfirmReload(false);
    setPreviewMessage("");
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
  const chosenStyle = dogStyles.find(style => style.id === selectedStyle) ?? dogStyles[0];
  const chosenBreedName = styleBreeds.find(breed => breed.id === selectedBreed)?.name ?? "포메라니안";

  async function reloadConfig() {
    if (working.current) return;
    working.current = true;
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const config = parseAppearance(await adminFetch<AppearanceConfig>("appearance"));
      if (!alive.current) return;
      acceptConfig(config, selectedBreed);
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
    editDraft(
      current => ({ ...current, defaultStyle: selectedStyle, breedStyles: {} }),
      `모든 견종의 미리보기를 ‘${chosenStyle.name}’로 바꿨어요. 개별 지정은 모두 해제했어요.`,
    );
  }

  function applyBreed() {
    editDraft(
      current => ({ ...current, breedStyles: { ...current.breedStyles, [selectedBreed]: selectedStyle } }),
      `${chosenBreedName}의 미리보기를 ‘${chosenStyle.name}’로 바꿨어요.`,
    );
  }

  function changeBreedStyle(breed: PixelBreed, value: string) {
    if (value !== "inherit" && !isDogStyleId(value)) return;
    editDraft(current => {
      const breedStyles = { ...current.breedStyles };
      if (value === "inherit") delete breedStyles[breed];
      else breedStyles[breed] = value as DogStyleId;
      return { ...current, breedStyles };
    });
  }

  function revertDraft() {
    if (!saved || busy) return;
    setDraft(cloneAppearance(saved));
    setSelectedStyle(resolveDogStyle(saved, selectedBreed));
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
      const config = parseAppearance(await adminFetch<AppearanceConfig>("appearance", {
        defaultStyle: draft.defaultStyle,
        breedStyles: { ...draft.breedStyles },
        expectedRevision: saved.revision,
      }));
      publishAppearance(config);
      if (!alive.current) return;
      acceptConfig(config, selectedBreed);
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
            <p>같은 강아지를 16가지 모습으로 비교해 보세요.</p>
          </div>
          <button type="button" className="account-button account-button-soft" onClick={requestReload} disabled={busy}>
            <RefreshCw size={15} aria-hidden="true" /> 설정 새로 불러오기
          </button>
        </div>
        <div className="admin-dog-preview-note">
          <strong>저장 전에는 미리보기만 바뀌어요.</strong>
          <span>전체 적용·개별 적용 후 ‘변경사항 저장’을 눌러야 사이트에 반영돼요.</span>
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
          <label className="account-field" htmlFor={`${id}-breed`}>
            <span>비교할 견종</span>
            <select id={`${id}-breed`} value={selectedBreed} disabled={busy} onChange={event => {
              const breed = styleBreeds.find(item => item.id === event.target.value);
              if (breed) setSelectedBreed(breed.id);
            }}>
              {styleBreeds.map(breed => <option value={breed.id} key={breed.id}>{breed.name}</option>)}
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

        <div className="admin-dog-comparison-layout">
          <fieldset className="admin-dog-gallery" disabled={busy}>
            <legend>16가지 스타일 비교 <span>· {chosenBreedName}</span></legend>
            <div className="admin-dog-style-grid">
              {dogStyles.map(style => (
                <label className="admin-dog-style-option" key={style.id}>
                  <input
                    className="account-sr-only" type="radio" name={`${id}-style`} value={style.id}
                    checked={selectedStyle === style.id} onChange={() => setSelectedStyle(style.id)}
                  />
                  <span className="admin-dog-style-card">
                    <span className="admin-dog-style-mark" aria-hidden="true">{selectedStyle === style.id && <Check size={13} />}</span>
                    <span className="admin-dog-card-art"><PixelDog breed={selectedBreed} styleId={style.id} mood={mood} decorative /></span>
                    <strong>{style.name}</strong>
                    <span className="admin-dog-style-description">{style.description}</span>
                    {resolveDogStyle(saved, selectedBreed) === style.id && <span className="admin-dog-current-label">현재 적용</span>}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <aside className="admin-dog-selected" aria-labelledby={`${id}-selected-heading`}>
            <span className="admin-dog-eyebrow">선택한 스타일</span>
            <div className="admin-dog-selected-art"><PixelDog breed={selectedBreed} styleId={selectedStyle} mood={mood} decorative /></div>
            <div className="admin-dog-selected-copy">
              <h3 id={`${id}-selected-heading`}>{chosenStyle.name}</h3>
              <p>{chosenStyle.description}</p>
              <span>{chosenBreedName} · {previewMoods.find(item => item.id === mood)?.name}</span>
            </div>
            <div className="admin-dog-apply-actions">
              <button type="button" className="account-button" disabled={busy} onClick={applyAll}>
                <CheckCheck size={16} aria-hidden="true" /> 전체 견종에 적용
              </button>
              <button type="button" className="account-button account-button-soft" disabled={busy} onClick={applyBreed}>
                <Check size={16} aria-hidden="true" /> 이 견종에만 적용
              </button>
              <small>전체 적용은 모든 개별 지정을 해제해요.<br />아직 저장되지는 않아요.</small>
            </div>
          </aside>
        </div>
        <AccountNotice>{previewMessage}</AccountNotice>
      </div>

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
              {dogStyles.map(style => <option value={style.id} key={style.id}>{style.name}</option>)}
            </select>
            <small>‘전체 기본 사용’인 견종만 함께 바뀌어요. 개별 지정한 견종은 그대로예요.</small>
          </label>
        </div>
        <div className="admin-dog-breed-grid">
          {styleBreeds.map(breed => {
            const override = draft.breedStyles[breed.id];
            const effectiveStyle = resolveDogStyle(draft, breed.id);
            const changed = saved.breedStyles[breed.id] !== override
              || resolveDogStyle(saved, breed.id) !== effectiveStyle;
            return (
              <div className="admin-dog-breed-row" key={breed.id}>
                <div className="admin-dog-breed-art"><PixelDog breed={breed.id} styleId={effectiveStyle} mood={mood} decorative /></div>
                <label className="account-field" htmlFor={`${id}-override-${breed.id}`}>
                  <span className="admin-dog-breed-label">
                    <strong>{breed.name}</strong>
                    {changed && <span className="admin-dog-draft-label">변경</span>}
                  </span>
                  <select
                    id={`${id}-override-${breed.id}`} value={override ?? "inherit"} disabled={busy}
                    aria-label={`${breed.name} 스타일`} onChange={event => changeBreedStyle(breed.id, event.target.value)}
                  >
                    <option value="inherit">전체 기본 사용 · {styleName(draft.defaultStyle)}</option>
                    {dogStyles.map(style => <option value={style.id} key={style.id}>{style.name}</option>)}
                  </select>
                  <small>{override ? "개별 지정" : "전체 기본 사용"} · {styleName(effectiveStyle)}</small>
                </label>
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
    </section>
  );
}
