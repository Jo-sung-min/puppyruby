"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ArrowDownToLine, Check, FileCheck2, LoaderCircle, RefreshCw, Upload, X } from "lucide-react";
import { accountErrorMessage, isAccountAccessError } from "@/lib/account";
import {
  desktopReleaseDraftProblem,
  desktopReleaseFileNames,
  nextDesktopVersion,
  type DesktopReleaseConfig,
} from "@/lib/desktop-release-contract";
import {
  getDesktopReleaseConfig,
  publishDesktopRelease,
  type DesktopReleaseUploadStage,
} from "@/lib/desktop-release-upload";
import { AccountFailure, AccountLoading, AccountNotice } from "./account-ui";

const stageLabel: Record<DesktopReleaseUploadStage, string> = {
  hash: "실행파일의 SHA-256을 계산하고 있어요.",
  prepare: "안전한 S3 업로드 주소를 준비하고 있어요.",
  upload: "실행파일을 S3에 올리고 있어요.",
  complete: "CDN 파일을 검증하고 새 버전을 공개하고 있어요.",
};

function bytes(value: number) {
  const megabytes = value / (1024 * 1024);
  return `${megabytes >= 10 ? megabytes.toFixed(1) : megabytes.toFixed(2)} MB`;
}

export function AdminDesktopRelease({ onAccessError }: { onAccessError: (problem: unknown) => void }) {
  const id = useId();
  const [config, setConfig] = useState<DesktopReleaseConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [files, setFiles] = useState<Map<string, File>>(() => new Map());
  const [version, setVersion] = useState("");
  const [notes, setNotes] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [stage, setStage] = useState<DesktopReleaseUploadStage | null>(null);
  const [stageFile, setStageFile] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const alive = useRef(false);
  const working = useRef(false);
  const uploadController = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const accept = useCallback((next: DesktopReleaseConfig, resetVersion: boolean) => {
    setConfig(next);
    if (resetVersion) setVersion(value => value || nextDesktopVersion(next.current?.version));
  }, []);

  const reload = useCallback(async () => {
    if (working.current) return;
    const controller = new AbortController();
    working.current = true; setLoading(true); setError(""); setNotice("");
    try {
      const next = await getDesktopReleaseConfig(controller.signal);
      if (alive.current) accept(next, true);
    } catch (problem) {
      if (!alive.current || controller.signal.aborted) return;
      if (isAccountAccessError(problem)) onAccessError(problem);
      else setError(accountErrorMessage(problem));
    } finally {
      working.current = false;
      if (alive.current) setLoading(false);
    }
  }, [accept, onAccessError]);

  useEffect(() => {
    alive.current = true;
    void reload();
    return () => { alive.current = false; uploadController.current?.abort(); };
  }, [reload]);

  function selectFiles(selection: FileList | null) {
    if (!selection || stage) return;
    setError(""); setNotice(""); setConfirmed(false);
    const chosen = [...selection];
    const expected = new Set<string>(desktopReleaseFileNames);
    if (chosen.length !== desktopReleaseFileNames.length || chosen.some(file => !expected.has(file.name))) {
      setFiles(new Map());
      setError("PuppyRuby.exe와 PuppyRuby-Setup.exe 두 파일을 한 번에 선택해 주세요.");
      return;
    }
    const next = new Map(chosen.map(file => [file.name, file]));
    const fileProblem = desktopReleaseDraftProblem("0.0.0.0", "선택 확인", next, true);
    if (fileProblem) { setFiles(new Map()); setError(fileProblem); return; }
    setFiles(next);
  }

  async function publish() {
    if (working.current || stage || !config?.enabled) return;
    const cleanVersion = version.trim(), cleanNotes = notes.trim();
    const problem = desktopReleaseDraftProblem(cleanVersion, cleanNotes, files, confirmed);
    if (problem) { setError(problem); return; }
    const controller = new AbortController();
    uploadController.current = controller; working.current = true; setError(""); setNotice("");
    try {
      const release = await publishDesktopRelease(files, cleanVersion, cleanNotes, controller.signal, (next, name) => {
        if (alive.current) { setStage(next); setStageFile(name || ""); }
      });
      if (!alive.current || controller.signal.aborted) return;
      accept({ enabled: true, current: release }, false);
      setVersion(nextDesktopVersion(release.version)); setNotes(""); setFiles(new Map()); setConfirmed(false);
      if (input.current) input.current.value = "";
      setNotice(`${release.version} Windows 릴리스를 공개했어요. 다운로드와 PC 업데이트 확인에 바로 반영돼요.`);
    } catch (problem) {
      if (!alive.current || controller.signal.aborted) return;
      if (isAccountAccessError(problem)) onAccessError(problem);
      else setError(accountErrorMessage(problem));
    } finally {
      if (uploadController.current === controller) uploadController.current = null;
      working.current = false;
      if (alive.current) { setStage(null); setStageFile(""); }
    }
  }

  if (!config) return <section className="account-card" aria-label="Windows 배포">
    {loading ? <AccountLoading label="현재 Windows 릴리스를 확인하고 있어요." />
      : <AccountFailure message={error || "Windows 배포 설정을 불러오지 못했어요."} retry={() => void reload()} />}
  </section>;

  const current = config.current;
  const validation = desktopReleaseDraftProblem(version.trim(), notes.trim(), files, true);
  const busy = stage !== null;

  return <section className="admin-desktop-release" aria-labelledby={`${id}-heading`} aria-busy={busy}>
    <div className="account-card admin-desktop-release-heading">
      <div><span className="account-kicker"><Upload size={14} /> WINDOWS RELEASE</span><h2 id={`${id}-heading`}>Windows 설치파일 배포</h2><p>휴대용 실행파일과 설치파일을 함께 검증해 S3와 CDN에 안전하게 공개해요.</p></div>
      <button type="button" className="account-button account-button-soft" disabled={busy || loading} onClick={() => void reload()}><RefreshCw size={15} /> 현재 릴리스 확인</button>
    </div>
    <AccountNotice kind="error">{error}</AccountNotice><AccountNotice kind="success">{notice}</AccountNotice>

    <div className="admin-desktop-release-layout">
      <section className="account-card admin-desktop-release-current" aria-labelledby={`${id}-current`}>
        <div className="account-section-heading"><div><h3 id={`${id}-current`}>현재 공개 버전</h3><p>웹 다운로드와 실행파일 업데이트가 이 릴리스를 사용해요.</p></div>{config.enabled
          ? <span className="account-badge account-badge-green">배포 가능</span>
          : <span className="account-badge account-badge-red">저장소 설정 필요</span>}</div>
        {current ? <div className="admin-desktop-release-summary">
          <div><span>버전</span><strong>{current.version}</strong></div>
          <div><span>공개 시각</span><strong>{new Date(current.publishedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" })}</strong></div>
          <div><span>설치파일</span><strong>{bytes(current.installer.size)}</strong></div>
          <p>{current.notes}</p>
          <a className="account-button account-button-soft" href="/api/desktop/download"><ArrowDownToLine size={15} /> 현재 설치파일 받기</a>
        </div> : <p className="account-empty">아직 공개된 Windows 릴리스가 없어요.</p>}
      </section>

      <section className="account-card admin-desktop-release-form" aria-labelledby={`${id}-new`}>
        <div className="account-section-heading"><div><h3 id={`${id}-new`}>새 버전 공개</h3><p>두 파일을 모두 올린 뒤 검증이 끝나야 최신 버전이 바뀌어요.</p></div></div>
        <div className="account-form">
          <label className="account-field" htmlFor={`${id}-version`}><span>버전</span><input id={`${id}-version`} value={version} maxLength={23} disabled={busy || !config.enabled} inputMode="numeric" placeholder="0.10.3.0" onChange={event => { setVersion(event.target.value); setConfirmed(false); setError(""); setNotice(""); }} /><small>숫자 네 묶음으로 입력해요. 현재 공개 버전보다 높은 버전이어야 해요.</small></label>
          <label className="account-field" htmlFor={`${id}-notes`}><span>릴리스 노트 <small>{notes.length}/500</small></span><textarea id={`${id}-notes`} rows={4} value={notes} maxLength={500} disabled={busy || !config.enabled} placeholder="사용자가 업데이트 내용을 알 수 있도록 바뀐 점을 적어 주세요." onChange={event => { setNotes(event.target.value); setConfirmed(false); setError(""); setNotice(""); }} /></label>
          <input ref={input} id={`${id}-files`} type="file" hidden multiple accept=".exe" disabled={busy || !config.enabled} onChange={event => { selectFiles(event.target.files); event.currentTarget.value = ""; }} />
          <div className="admin-desktop-release-files">
            {desktopReleaseFileNames.map(name => { const file = files.get(name); return <article key={name} data-selected={!!file}>
              <FileCheck2 size={19} /><div><strong>{name}</strong><span>{file ? `${bytes(file.size)} · 선택됨` : "선택되지 않음"}</span></div>{file && <Check size={17} />}
            </article>; })}
          </div>
          <div className="admin-desktop-release-file-actions"><button type="button" className="account-button account-button-soft" disabled={busy || !config.enabled} onClick={() => input.current?.click()}><Upload size={15} /> 두 실행파일 선택</button>{files.size > 0 && <button type="button" className="account-text-button" disabled={busy} onClick={() => { setFiles(new Map()); setConfirmed(false); setError(""); }}><X size={14} /> 선택 해제</button>}</div>
          <label className="admin-desktop-release-confirm"><input type="checkbox" checked={confirmed} disabled={busy || !config.enabled || !!validation} onChange={event => setConfirmed(event.target.checked)} /><span><strong>이 버전을 공개하는 것을 확인했습니다.</strong><small>공개가 끝나면 웹의 Windows 다운로드와 PC 강아지의 업데이트 확인이 즉시 이 버전을 가리켜요.</small></span></label>
          {validation && (version || notes || files.size > 0) && <p className="admin-desktop-release-help">{validation}</p>}
          {!config.enabled && <p className="admin-desktop-release-error">백엔드의 S3 배포 설정을 완료하면 여기서 설치파일을 올릴 수 있어요.</p>}
          {stage && <div className="admin-desktop-release-progress" role="status"><LoaderCircle className="spin" size={18} /><div><strong>{stageLabel[stage]}</strong>{stageFile && <span>{stageFile}</span>}</div><button type="button" className="account-text-button" onClick={() => uploadController.current?.abort()}>업로드 취소</button></div>}
          <button type="button" className="account-button account-button-full" disabled={busy || !config.enabled || !!validation || !confirmed} onClick={() => void publish()}>{busy ? <LoaderCircle className="spin" size={16} /> : <Upload size={16} />}{busy ? "배포 진행 중…" : `${version || "새 버전"} 공개하기`}</button>
        </div>
      </section>
    </div>
  </section>;
}
