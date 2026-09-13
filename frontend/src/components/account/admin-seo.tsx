"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Check, ExternalLink, Globe2, ImagePlus, RefreshCw, RotateCcw, Save, Search, Upload, X } from "lucide-react";
import { AccountError, accountErrorMessage, adminFetch, isAccountAccessError } from "@/lib/account";
import { cloneSeoConfig, parseSeoConfig, seoDraftProblem, seoHttpsUrl, seoPages, type SeoConfig, type SeoPageKey } from "@/lib/seo";
import { getSeoImageUploadConfig, uploadSeoImage } from "@/lib/seo-image-upload";
import type { ImageUploadConfig, ImageUploadStage } from "@/lib/image-upload";
import { AccountFailure, AccountLoading, AccountNotice, SubmitLabel } from "./account-ui";

const stageLabels: Record<ImageUploadStage, string> = { prepare: "공유 이미지를 준비하고 있어요.", upload: "공유 이미지를 올리고 있어요.", verify: "올린 이미지를 확인하고 있어요." };
type TextKey = "siteName" | "siteUrl" | "defaultTitle" | "defaultDescription" | "ogImageUrl" | "ogImageAlt" | "googleVerification" | "naverVerification";

function changeCount(saved: SeoConfig, draft: SeoConfig) {
  const fields: (TextKey | "indexingEnabled")[] = ["siteName", "siteUrl", "defaultTitle", "defaultDescription", "ogImageUrl", "ogImageAlt", "googleVerification", "naverVerification", "indexingEnabled"];
  return fields.filter(key => saved[key] !== draft[key]).length + seoPages.reduce((total, page) => total + (["title", "description", "indexable"] as const).filter(key => saved.pages[page.id][key] !== draft.pages[page.id][key]).length, 0);
}

export function AdminSeo({ onAccessError }: { onAccessError: (problem: unknown) => void }) {
  const id = useId();
  const [saved, setSaved] = useState<SeoConfig | null>(null);
  const [draft, setDraft] = useState<SeoConfig | null>(null);
  const [page, setPage] = useState<SeoPageKey>("home");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [conflict, setConflict] = useState(false);
  const [confirmReload, setConfirmReload] = useState(false);
  const [mediaConfig, setMediaConfig] = useState<ImageUploadConfig | null>(null);
  const [mediaError, setMediaError] = useState("");
  const [imageErrorUrl, setImageErrorUrl] = useState("");
  const [uploadStage, setUploadStage] = useState<ImageUploadStage | null>(null);
  const alive = useRef(false), working = useRef(false);
  const uploadController = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const accept = useCallback((config: SeoConfig) => { setSaved(cloneSeoConfig(config)); setDraft(cloneSeoConfig(config)); setConflict(false); setConfirmReload(false); }, []);

  useEffect(() => {
    let disposed = false; const controller = new AbortController(); alive.current = true;
    adminFetch<SeoConfig>("seo", undefined, controller.signal)
      .then(value => { if (!disposed) accept(parseSeoConfig(value)); })
      .catch(problem => { if (!disposed) { if (isAccountAccessError(problem)) onAccessError(problem); else setError(accountErrorMessage(problem)); } })
      .finally(() => { if (!disposed) setLoading(false); });
    getSeoImageUploadConfig(controller.signal).then(value => { if (!disposed) setMediaConfig(value); })
      .catch(() => { if (!disposed) setMediaError("이미지 업로드 연결을 확인하지 못했어요. 공개 이미지 주소로도 등록할 수 있어요."); });
    return () => { disposed = true; alive.current = false; controller.abort(); uploadController.current?.abort(); };
  }, [accept, onAccessError]);
  const busy = loading || saving || uploadStage !== null;
  const changes = saved && draft ? changeCount(saved, draft) : 0;
  const validation = draft ? seoDraftProblem(draft) : "";
  function edit(update: (value: SeoConfig) => SeoConfig) {
    if (busy) return; setDraft(current => current ? update(current) : current); setNotice(""); setConfirmReload(false); if (!conflict) setError("");
  }
  const updateText = (key: TextKey, value: string) => edit(current => ({ ...current, [key]: value }));
  async function reload() {
    if (working.current || uploadController.current) return;
    working.current = true; setLoading(true); setError(""); setNotice("");
    try {
      const signal = AbortSignal.timeout(12000);
      const [seo, media] = await Promise.allSettled([adminFetch<SeoConfig>("seo", undefined, signal), getSeoImageUploadConfig(signal)]);
      if (!alive.current) return;
      if (seo.status === "rejected") throw seo.reason;
      accept(parseSeoConfig(seo.value)); setNotice("최신 검색 노출 설정을 불러왔어요.");
      if (media.status === "fulfilled") { setMediaConfig(media.value); setMediaError(""); }
      else setMediaError("이미지 업로드 연결을 확인하지 못했어요. 공개 이미지 주소로도 등록할 수 있어요.");
    }
    catch (problem) { if (alive.current) { if (isAccountAccessError(problem)) onAccessError(problem); else setError(accountErrorMessage(problem)); } }
    finally { working.current = false; if (alive.current) setLoading(false); }
  }
  async function save() {
    if (!draft || !saved || busy || !changes || validation || conflict || working.current) return;
    working.current = true; setSaving(true); setError(""); setNotice("");
    try {
      const clean = parseSeoConfig(draft);
      const { revision: _revision, updatedAt: _updatedAt, ...values } = clean;
      const result = parseSeoConfig(await adminFetch<SeoConfig>("seo", { ...values, expectedRevision: saved.revision }));
      if (alive.current) { accept(result); setNotice("검색 노출 설정을 저장했어요. 새로 여는 페이지에 반영돼요. 검색 결과와 공유 서비스의 미리보기는 다시 수집된 뒤 바뀔 수 있어요."); }
    } catch (problem) {
      if (!alive.current) return;
      if (isAccountAccessError(problem)) onAccessError(problem);
      else if (problem instanceof AccountError && problem.status === 409) { setConflict(true); setConfirmReload(true); setError("다른 곳에서 설정을 먼저 저장했어요. 작성한 내용은 유지했어요. 최신 설정을 불러온 뒤 다시 수정해 주세요."); }
      else setError(accountErrorMessage(problem));
    } finally { working.current = false; if (alive.current) setSaving(false); }
  }
  function revert() {
    if (!saved || busy) return;
    setDraft(cloneSeoConfig(saved)); setNotice("처음 불러온 설정으로 되돌렸어요."); setConfirmReload(false); if (!conflict) setError("");
  }
  async function selectImage(file: File | undefined) {
    if (!file || !mediaConfig?.enabled || busy || uploadController.current) return;
    const controller = new AbortController(); uploadController.current = controller; setUploadStage("prepare"); setMediaError(""); setNotice("");
    try {
      const result = await uploadSeoImage(file, mediaConfig, controller.signal, setUploadStage);
      if (!alive.current || controller.signal.aborted) return;
      setDraft(current => current ? { ...current, ogImageUrl: result.url } : current); setImageErrorUrl("");
      setNotice("공유 이미지를 올렸어요. 변경사항을 저장하면 공개 공유 이미지로 적용돼요.");
    } catch (problem) { if (alive.current && !controller.signal.aborted) setMediaError(accountErrorMessage(problem)); }
    finally { if (uploadController.current === controller) { uploadController.current = null; if (alive.current) setUploadStage(null); } }
  }

  if (!saved || !draft) return <section className="account-card" aria-label="검색 노출 설정">{loading ? <AccountLoading label="검색 노출 설정을 불러오고 있어요." /> : <AccountFailure message={error || "설정을 불러오지 못했어요."} retry={() => void reload()} />}</section>;
  const selectedPage = seoPages.find(item => item.id === page)!;
  const pageSettings = draft.pages[page];
  const previewTitle = pageSettings.title.trim() || draft.defaultTitle.trim();
  const previewDescription = pageSettings.description.trim() || draft.defaultDescription.trim();
  const previewOrigin = seoHttpsUrl(draft.siteUrl.trim(), true);
  const previewUrl = previewOrigin ? new URL(selectedPage.path, previewOrigin).href : `운영 환경의 사이트 주소${selectedPage.path}`;
  const imageUrl = seoHttpsUrl(draft.ogImageUrl.trim());
  const canIndex = draft.indexingEnabled && pageSettings.indexable;
  const field = (key: TextKey, label: string, maximum: number, help = "", multiline = false, placeholder = "") => <label className="account-field" htmlFor={`${id}-${key}`}>
    <span className="admin-seo-field-label">{label}<small>{[...draft[key]].length}/{maximum}</small></span>
    {multiline ? <textarea id={`${id}-${key}`} value={draft[key]} rows={3} disabled={busy} maxLength={maximum * 2} onChange={event => updateText(key, event.target.value)} placeholder={placeholder} />
      : <input id={`${id}-${key}`} value={draft[key]} disabled={busy} maxLength={maximum * 2} onChange={event => updateText(key, event.target.value)} placeholder={placeholder} spellCheck={!["siteUrl", "ogImageUrl", "googleVerification", "naverVerification"].includes(key)} />}
    {help && <small>{help}</small>}
  </label>;

  return <section className="admin-seo" aria-labelledby={`${id}-heading`} aria-busy={busy}>
    <div className="account-card admin-seo-heading">
      <div><span className="account-kicker"><Search size={14} /> SEARCH & SHARE</span><h2 id={`${id}-heading`}>검색에서 만나는 퍼피루비</h2><p>검색 결과와 링크 공유에 표시할 소개를 직접 관리해요.</p></div>
      <button type="button" className="account-button account-button-soft" disabled={busy} onClick={() => { if (changes || conflict) setConfirmReload(true); else void reload(); }}><RefreshCw size={15} /> 최신 설정 불러오기</button>
    </div>
    <AccountNotice kind="error">{error}</AccountNotice><AccountNotice kind="success">{notice}</AccountNotice>
    {confirmReload && <div className="account-card admin-seo-reload" role="group" aria-label="검색 설정 다시 불러오기 확인"><p>작성 중인 변경을 버리고 서버에 저장된 최신 설정을 불러와요.</p><div><button type="button" className="account-button account-button-soft" disabled={busy} onClick={() => setConfirmReload(false)}>계속 수정하기</button><button type="button" className="account-button" disabled={busy} onClick={() => void reload()}>변경을 버리고 불러오기</button></div></div>}
    <div className="admin-seo-layout">
      <div className="admin-seo-editors">
        <section className="account-card" aria-labelledby={`${id}-basics`}><h3 id={`${id}-basics`}>기본 검색 정보</h3><p className="admin-seo-section-help">페이지별 설정을 비워두면 이 제목과 설명을 사용해요.</p><div className="account-form">
          {field("siteName", "사이트 이름", 60)}
          {field("siteUrl", "대표 사이트 주소", 300, "https://로 시작하는 기본 주소예요. 비워두면 운영 환경에 등록된 사이트 주소를 사용해요.", false, "https://www.puppyruby.com")}
          {field("defaultTitle", "기본 검색 제목", 100)}
          {field("defaultDescription", "기본 검색 설명", 300, "서비스의 특징을 읽기 쉬운 한두 문장으로 소개해 주세요.", true)}
          <label className="admin-seo-toggle"><input type="checkbox" checked={draft.indexingEnabled} disabled={busy} onChange={event => edit(current => ({ ...current, indexingEnabled: event.target.checked }))} /><span><strong>공개 페이지 검색 노출 허용</strong><small>{draft.indexingEnabled ? "페이지마다 검색 노출 여부를 따로 정할 수 있어요." : "모든 공개 페이지에 검색 제외를 요청하고 사이트맵을 비워요."}</small></span></label>
        </div></section>
        <section className="account-card" aria-labelledby={`${id}-pages`}><h3 id={`${id}-pages`}>페이지별 설정</h3><p className="admin-seo-section-help">선택한 페이지의 검색 미리보기도 함께 바뀌어요.</p>
          <div className="admin-seo-page-tabs" role="group" aria-label="검색 설정할 페이지">{seoPages.map(item => <button key={item.id} type="button" aria-pressed={page === item.id} onClick={() => setPage(item.id)}>{item.name}<span>{item.path}</span></button>)}</div>
          <div className="account-form">
            <label className="account-field"><span className="admin-seo-field-label">{selectedPage.name} 제목<small>{[...pageSettings.title].length}/100</small></span><input value={pageSettings.title} maxLength={200} disabled={busy} placeholder={draft.defaultTitle} onChange={event => edit(current => ({ ...current, pages: { ...current.pages, [page]: { ...current.pages[page], title: event.target.value } } }))} /><small>비워두면 기본 검색 제목을 사용해요.</small></label>
            <label className="account-field"><span className="admin-seo-field-label">{selectedPage.name} 설명<small>{[...pageSettings.description].length}/300</small></span><textarea value={pageSettings.description} maxLength={600} rows={3} disabled={busy} placeholder={draft.defaultDescription} onChange={event => edit(current => ({ ...current, pages: { ...current.pages, [page]: { ...current.pages[page], description: event.target.value } } }))} /><small>비워두면 기본 검색 설명을 사용해요.</small></label>
            <label className="admin-seo-toggle"><input type="checkbox" checked={pageSettings.indexable} disabled={busy} onChange={event => edit(current => ({ ...current, pages: { ...current.pages, [page]: { ...current.pages[page], indexable: event.target.checked } } }))} /><span><strong>{selectedPage.name} 검색 노출 허용</strong><small>{!draft.indexingEnabled ? "전체 검색 노출이 꺼져 있어 현재는 검색에서 제외돼요." : "켜진 페이지만 사이트맵에 포함돼요."}</small></span></label>
          </div><p className="admin-seo-private-note">로그인·마이페이지·관리자·결제 페이지는 항상 검색에서 제외해요.</p>
        </section>
        <section className="account-card" aria-labelledby={`${id}-sharing`}><h3 id={`${id}-sharing`}>링크 공유 이미지</h3><p className="admin-seo-section-help">카카오톡 등으로 사이트를 공유할 때 보여 줄 공개 이미지예요.</p><div className="account-form">
          {field("ogImageUrl", "공유 이미지 주소", 2048, "공개된 CDN 이미지 주소를 입력하거나 아래에서 이미지를 올려 주세요.", false, "https://이미지주소/puppyruby.jpg")}
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden aria-label="공유 이미지 파일" onChange={event => { const file = event.target.files?.[0]; event.currentTarget.value = ""; void selectImage(file); }} />
          <div className="admin-seo-upload-actions"><button type="button" className="account-button account-button-soft" disabled={busy || !mediaConfig?.enabled} onClick={() => fileInput.current?.click()}><Upload size={15} /> 공유 이미지 올리기</button>
            <button type="button" className="account-text-button" disabled={busy || !draft.ogImageUrl} onClick={() => updateText("ogImageUrl", "")}><X size={14} /> 이미지 해제</button>
            {uploadStage && <button type="button" className="account-text-button" onClick={() => uploadController.current?.abort()}>업로드 취소</button>}</div>
          {uploadStage && <p role="status" className="admin-seo-section-help">{stageLabels[uploadStage]}</p>}
          {mediaConfig && !mediaConfig.enabled && <p className="admin-seo-section-help">이미지 저장소 연결 후 업로드할 수 있어요. 공개 이미지 주소는 지금도 등록할 수 있어요.</p>}
          {mediaError && <p role="alert" className="admin-seo-error">{mediaError}</p>}
          <small className="admin-seo-section-help">10MB 이하의 이미지를 선택해 주세요. 업로드하면 공유용 1200 × 630 이미지로 준비해요.</small>
          {field("ogImageAlt", "공유 이미지 설명", 160, "이미지 내용을 짧게 설명해 주세요. 비워두면 사이트 이름을 사용해요.")}
        </div></section>
        <section className="account-card" aria-labelledby={`${id}-verification`}><h3 id={`${id}-verification`}>검색 서비스 소유 확인</h3><p className="admin-seo-section-help">각 검색 서비스에서 발급받은 확인 코드를 저장한 뒤, 해당 서비스에서 소유 확인을 마쳐 주세요.</p><div className="account-form">
          {field("googleVerification", "구글 확인 코드", 200, "HTML 태그의 content 안에 있는 코드만 입력해 주세요.")}
          {field("naverVerification", "네이버 확인 코드", 200, "HTML 태그 전체를 붙여넣지 않고 코드만 입력해 주세요.")}
        </div><div className="admin-seo-links"><a href="https://search.google.com/search-console" target="_blank" rel="noopener noreferrer">구글 서치 콘솔 <ExternalLink size={13} /></a><a href="https://searchadvisor.naver.com/" target="_blank" rel="noopener noreferrer">네이버 서치어드바이저 <ExternalLink size={13} /></a></div></section>
      </div>
      <aside className="admin-seo-preview" aria-label="검색 및 공유 미리보기">
        <section className="account-card"><div className="admin-seo-preview-heading"><Search size={16} /><h3>검색 결과 미리보기</h3></div><span className="admin-seo-preview-page">{selectedPage.name} · {canIndex ? "검색 노출 허용" : "검색 제외"}</span><div className="admin-seo-search-card">
          <div className="admin-seo-search-site"><span><Globe2 size={18} /></span><div><strong>{draft.siteName || "사이트 이름"}</strong><small>{previewUrl}</small></div></div>
          <p className="admin-seo-search-title">{previewTitle || "검색 제목"}</p><p className="admin-seo-search-description">{previewDescription || "검색 설명을 입력해 주세요."}</p>
        </div><small className="admin-seo-preview-help">실제 검색 결과의 문구와 표시 길이는 검색 서비스에서 다르게 정할 수 있어요.</small></section>
        <section className="account-card"><div className="admin-seo-preview-heading"><ImagePlus size={16} /><h3>링크 공유 미리보기</h3></div><div className="admin-seo-social-card">
          <div className="admin-seo-social-image">{imageUrl && imageErrorUrl !== imageUrl ? <img src={imageUrl} alt={draft.ogImageAlt || draft.siteName} referrerPolicy="no-referrer" onError={() => setImageErrorUrl(imageUrl)} /> : <div><ImagePlus size={32} /><span>{imageUrl ? "이미지를 불러오지 못했어요" : "공유 이미지를 등록해 주세요"}</span></div>}</div>
          <div className="admin-seo-social-copy"><strong>{previewTitle || "검색 제목"}</strong><p>{previewDescription}</p><small>{previewOrigin ? new URL(previewOrigin).hostname : draft.siteName}</small></div>
        </div></section>
        <section className="account-card admin-seo-crawl-info"><div className="admin-seo-preview-heading"><Check size={16} /><h3>자동으로 반영해요</h3></div><p>대표 페이지 주소, 검색 노출 안내, 공유 정보와 소유 확인 코드를 페이지에 반영해요.</p><div className="admin-seo-links"><a href="/sitemap.xml" target="_blank" rel="noopener noreferrer">사이트맵 보기 <ExternalLink size={13} /></a><a href="/robots.txt" target="_blank" rel="noopener noreferrer">검색 로봇 안내 보기 <ExternalLink size={13} /></a></div><small>사이트맵과 로봇 안내는 저장된 설정을 보여줘요. 운영 사이트 주소가 준비돼야 사이트맵에 페이지 주소가 표시돼요.</small></section>
      </aside>
    </div>
    {validation && <AccountNotice kind="error">{validation}</AccountNotice>}
    <div className="admin-seo-savebar"><div role="status"><strong>{conflict ? "최신 설정을 확인해 주세요" : changes ? `저장하지 않은 변경 ${changes}곳` : "저장된 설정과 같아요"}</strong><small>{saved.updatedAt ? `마지막 저장 · ${new Date(saved.updatedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "short" })}` : "변경사항 저장을 누르면 반영돼요."}</small></div><div className="admin-seo-save-actions"><button type="button" className="account-button account-button-soft" disabled={busy || !changes} onClick={revert}><RotateCcw size={15} /> 변경 되돌리기</button><button type="button" className="account-button" disabled={busy || !changes || !!validation || conflict} onClick={() => void save()}>{!saving && <Save size={15} />}<SubmitLabel busy={saving}>{saving ? "저장 중…" : "SEO 변경사항 저장"}</SubmitLabel></button></div></div>
  </section>;
}
