import { AccountError } from "./account";
import { readDesktopUpdateRelease, type DesktopUpdateRelease } from "./desktop-update";
import {
  desktopReleaseFileNames,
  readDesktopReleaseMetadata,
  readDesktopReleasePreparation,
  type DesktopReleaseConfig,
  type DesktopReleaseFileMetadata,
} from "./desktop-release-contract";

export type DesktopReleaseUploadStage = "hash" | "prepare" | "upload" | "complete";

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function failureMessage(status: number) {
  if (status === 401) return "Windows 배포를 관리하려면 다시 로그인해 주세요.";
  if (status === 403) return "이메일 인증을 마친 관리자만 Windows 배포를 공개할 수 있어요.";
  if (status === 409) return "실행파일의 실제 버전, 업로드 상태와 현재 공개 버전을 확인해 주세요.";
  if (status === 413) return "선택한 실행파일의 용량이 너무 커요.";
  if (status === 429) return "배포 요청이 너무 잦아요. 잠시 후 다시 시도해 주세요.";
  if (status === 503) return "Windows 배포 저장소를 준비 중이에요. 서버 설정을 확인해 주세요.";
  if (status === 400 || status === 410 || status === 422) return "버전과 실행파일을 확인한 뒤 다시 시도해 주세요.";
  return "Windows 배포를 처리하지 못했어요. 잠시 후 다시 시도해 주세요.";
}

async function request(action: "" | "prepare" | "complete", signal: AbortSignal, body?: Record<string, unknown>) {
  let response: Response;
  try {
    response = await fetch(`/api/admin/desktop-release${action ? `/${action}` : ""}`, {
      method: body ? "POST" : "GET", credentials: "same-origin", cache: "no-store", redirect: "error",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined, signal,
    });
  } catch (problem) {
    signal.throwIfAborted();
    throw new Error("Windows 배포 서비스에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.");
  }
  signal.throwIfAborted();
  const value: unknown = await response.json().catch(() => null);
  signal.throwIfAborted();
  if (!response.ok) throw new AccountError(object(value) && typeof value.message === "string" ? value.message : failureMessage(response.status), response.status);
  if (!object(value)) throw new Error("Windows 배포 응답을 확인하지 못했어요.");
  return value;
}

export async function getDesktopReleaseConfig(signal: AbortSignal): Promise<DesktopReleaseConfig> {
  const value = await request("", signal);
  if (typeof value.enabled !== "boolean" || !(value.current === null || object(value.current)))
    throw new Error("Windows 배포 설정을 확인하지 못했어요.");
  const current = value.current === null ? null : readDesktopUpdateRelease(value.current);
  if (value.current !== null && !current) throw new Error("현재 Windows 릴리스 정보를 확인하지 못했어요.");
  return { enabled: value.enabled, current };
}

function checksumBase64(buffer: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

async function metadataFor(files: ReadonlyMap<string, File>, signal: AbortSignal,
  onHash: (name: string) => void): Promise<DesktopReleaseFileMetadata[]> {
  if (!globalThis.crypto?.subtle) throw new Error("실행파일 검증에는 HTTPS 보안 연결이 필요해요.");
  const values: DesktopReleaseFileMetadata[] = [];
  for (const name of desktopReleaseFileNames) {
    const file = files.get(name);
    if (!file) throw new Error(`${name} 파일을 선택해 주세요.`);
    signal.throwIfAborted(); onHash(name);
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    signal.throwIfAborted();
    values.push({ name, size: file.size, sha256: checksumBase64(digest) });
  }
  const checked = readDesktopReleaseMetadata(values);
  if (!checked) throw new Error("선택한 실행파일을 검증하지 못했어요.");
  return checked;
}

export async function publishDesktopRelease(files: ReadonlyMap<string, File>, version: string, notes: string,
  signal: AbortSignal, onStage: (stage: DesktopReleaseUploadStage, fileName?: string) => void): Promise<DesktopUpdateRelease> {
  const metadata = await metadataFor(files, signal, name => onStage("hash", name));
  signal.throwIfAborted(); onStage("prepare");
  const preparedValue = await request("prepare", signal, { version, notes, files: metadata });
  const prepared = readDesktopReleasePreparation(preparedValue, metadata);
  if (!prepared) throw new Error("실행파일 업로드 주소를 확인하지 못했어요.");

  for (const upload of prepared.uploads) {
    if (!upload.required) continue;
    const file = files.get(upload.name);
    if (!file || !upload.uploadUrl || upload.method !== "PUT" || !upload.headers) throw new Error("실행파일 업로드 정보를 확인하지 못했어요.");
    signal.throwIfAborted(); onStage("upload", upload.name);
    let response: Response;
    try {
      response = await fetch(upload.uploadUrl, { method: "PUT", headers: upload.headers, body: file,
        credentials: "omit", referrerPolicy: "no-referrer", redirect: "error", signal });
    } catch (problem) {
      signal.throwIfAborted();
      throw new Error(`${upload.name} 전송을 완료하지 못했어요. 연결을 확인하고 다시 시도해 주세요.`);
    }
    if (!response.ok) throw new Error(`${upload.name} 전송을 완료하지 못했어요. 다시 시도해 주세요.`);
  }

  signal.throwIfAborted(); onStage("complete");
  const completed = await request("complete", signal, { version, notes, release: prepared.release, files: metadata });
  const manifest = readDesktopUpdateRelease(completed);
  if (!manifest) throw new Error("공개된 Windows 릴리스를 확인하지 못했어요.");
  return manifest;
}
