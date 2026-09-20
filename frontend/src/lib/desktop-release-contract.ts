import type { DesktopUpdateRelease } from "./desktop-update";

export const desktopReleaseFileNames = ["PuppyRuby.exe", "PuppyRuby-Setup.exe"] as const;
export type DesktopReleaseFileName = (typeof desktopReleaseFileNames)[number];
export type DesktopReleaseFileMetadata = { name: DesktopReleaseFileName; size: number; sha256: string };
export type DesktopReleaseConfig = { enabled: boolean; current: DesktopUpdateRelease | null };
export type DesktopReleaseUpload = {
  name: DesktopReleaseFileName;
  required: boolean;
  uploadUrl?: string;
  method?: "PUT";
  headers?: Record<string, string>;
  expiresAt?: number;
};
export type DesktopReleasePreparation = { release: string; uploads: DesktopReleaseUpload[] };

export const maxDesktopReleaseFileBytes = 200 * 1024 * 1024;
export const maxDesktopReleaseNotesLength = 500;
// Completing a release streams and verifies both Windows binaries from the CDN.
export const desktopReleaseCompleteTimeoutMs = 180_000;
const versionPattern = /^(?:0|[1-9]\d{0,4})(?:\.(?:0|[1-9]\d{0,4})){3}$/;
const checksumPattern = /^[A-Za-z0-9+/]{43}=$/;
const releasePattern = /^[a-f0-9]{16}$/;
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function isDesktopVersion(value: unknown): value is string {
  return typeof value === "string" && versionPattern.test(value)
    && value.split(".").every(part => Number(part) <= 65535);
}

export function isDesktopReleaseNotes(value: unknown): value is string {
  return typeof value === "string" && value.trim() === value && value.length > 0
    && value.length <= maxDesktopReleaseNotesLength && !/[\u0000-\u001f\u007f<>]/.test(value);
}

export function desktopReleaseDraftProblem(version: string, notes: string,
  files: ReadonlyMap<string, Pick<File, "name" | "size">>, confirmed: boolean): string {
  if (!isDesktopVersion(version)) return "버전은 0.10.2.0처럼 숫자 네 묶음으로 입력해 주세요.";
  if (!isDesktopReleaseNotes(notes)) return `릴리스 노트는 1자 이상 ${maxDesktopReleaseNotesLength}자 이하의 일반 문장으로 입력해 주세요.`;
  for (const name of desktopReleaseFileNames) {
    const file = files.get(name);
    if (!file) return `${name} 파일을 함께 선택해 주세요.`;
    if (file.name !== name || !Number.isSafeInteger(file.size) || file.size <= 0 || file.size > maxDesktopReleaseFileBytes)
      return `${name}은 200MB 이하의 올바른 Windows 실행파일이어야 해요.`;
  }
  if (files.size !== desktopReleaseFileNames.length) return "지정된 Windows 실행파일 두 개만 선택해 주세요.";
  if (!confirmed) return "두 파일과 버전을 확인한 뒤 공개 확인에 체크해 주세요.";
  return "";
}

export function isDesktopReleaseMetadata(value: unknown): value is DesktopReleaseFileMetadata {
  return object(value) && desktopReleaseFileNames.includes(value.name as DesktopReleaseFileName)
    && typeof value.size === "number" && Number.isSafeInteger(value.size) && value.size > 0
    && value.size <= maxDesktopReleaseFileBytes && typeof value.sha256 === "string" && checksumPattern.test(value.sha256);
}

export function readDesktopReleaseMetadata(value: unknown): DesktopReleaseFileMetadata[] | null {
  if (!Array.isArray(value) || value.length !== desktopReleaseFileNames.length || !value.every(isDesktopReleaseMetadata)) return null;
  const byName = new Map(value.map(item => [item.name, item]));
  return byName.size === desktopReleaseFileNames.length
    && desktopReleaseFileNames.every(name => byName.has(name))
    ? desktopReleaseFileNames.map(name => ({ ...byName.get(name)! })) : null;
}

export function isDesktopReleaseId(value: unknown): value is string {
  return typeof value === "string" && releasePattern.test(value);
}

const uploadOrigin = "https://fatell-aws-s3.s3.ap-northeast-2.amazonaws.com";
const signedHeaders = "cache-control;content-disposition;content-length;content-type;host;if-none-match;x-amz-checksum-sha256;x-amz-meta-sha256";
const requiredSignatureFields = ["X-Amz-Algorithm", "X-Amz-Credential", "X-Amz-Date", "X-Amz-Expires", "X-Amz-SignedHeaders", "X-Amz-Signature"] as const;

function safeUploadUrl(value: unknown, release: string, name: DesktopReleaseFileName, expiresAt: number): value is string {
  if (typeof value !== "string" || value.length > 8192) return false;
  try {
    const url = new URL(value);
    if (url.origin !== uploadOrigin || url.username || url.password || url.hash
      || url.pathname !== `/puppyruby/site-downloads/${release}/downloads/${name}`) return false;
    const keys = [...url.searchParams.keys()];
    const allowed = new Set<string>([...requiredSignatureFields, "X-Amz-Security-Token"]);
    if (!keys.length || keys.some(key => !allowed.has(key))
      || requiredSignatureFields.some(key => url.searchParams.getAll(key).length !== 1)
      || url.searchParams.getAll("X-Amz-Security-Token").length > 1) return false;
    const algorithm = url.searchParams.get("X-Amz-Algorithm");
    const credential = url.searchParams.get("X-Amz-Credential") || "";
    const date = url.searchParams.get("X-Amz-Date") || "";
    const duration = url.searchParams.get("X-Amz-Expires") || "";
    const signature = url.searchParams.get("X-Amz-Signature") || "";
    const credentialMatch = /^([A-Z0-9]{16,128})\/(\d{8})\/ap-northeast-2\/s3\/aws4_request$/.exec(credential);
    if (algorithm !== "AWS4-HMAC-SHA256" || !credentialMatch || !/^\d{8}T\d{6}Z$/.test(date)
      || credentialMatch[2] !== date.slice(0, 8) || !/^(?:[1-9]\d{1,2})$/.test(duration)
      || Number(duration) < 60 || Number(duration) > 900
      || url.searchParams.get("X-Amz-SignedHeaders") !== signedHeaders || !/^[a-f0-9]{64}$/.test(signature)) return false;
    const signedAt = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(4, 6)) - 1, Number(date.slice(6, 8)),
      Number(date.slice(9, 11)), Number(date.slice(11, 13)), Number(date.slice(13, 15)));
    const normalizedDate = new Date(signedAt).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    if (!Number.isFinite(signedAt) || normalizedDate !== date
      || Math.abs(signedAt + Number(duration) * 1000 - expiresAt) > 60_000) return false;
    const token = url.searchParams.get("X-Amz-Security-Token");
    return token === null || (token.length > 0 && token.length <= 4096 && !/[\u0000-\u0020\u007f]/.test(token));
  } catch { return false; }
}

function checksumHex(checksum: string) {
  try {
    const binary = atob(checksum);
    return [...binary].map(character => character.charCodeAt(0).toString(16).padStart(2, "0")).join("");
  } catch { return ""; }
}

function readUpload(value: unknown, metadata: DesktopReleaseFileMetadata[], release: string): DesktopReleaseUpload | null {
  if (!object(value) || !desktopReleaseFileNames.includes(value.name as DesktopReleaseFileName) || typeof value.required !== "boolean") return null;
  const name = value.name as DesktopReleaseFileName;
  if (!value.required) return { name, required: false };
  if (value.method !== "PUT" || typeof value.expiresAt !== "number" || !Number.isSafeInteger(value.expiresAt)
    || value.expiresAt <= Date.now() || !safeUploadUrl(value.uploadUrl, release, name, value.expiresAt) || !object(value.headers)) return null;
  const permitted = /^(?:content-type|content-disposition|cache-control|if-none-match|x-amz-checksum-sha256|x-amz-meta-sha256)$/i;
  const entries = Object.entries(value.headers);
  if (!entries.length || !entries.every(([key, item]) => permitted.test(key) && typeof item === "string" && item.length <= 1024)) return null;
  let headers: Headers;
  try { headers = new Headers(entries as [string, string][]); }
  catch { return null; }
  const file = metadata.find(item => item.name === name);
  if (!file || headers.get("x-amz-checksum-sha256") !== file.sha256
    || headers.get("x-amz-meta-sha256") !== checksumHex(file.sha256)
    || headers.get("if-none-match") !== "*" || headers.get("content-type") !== "application/vnd.microsoft.portable-executable"
    || headers.get("content-disposition") !== `attachment; filename="${name}"`
    || headers.get("cache-control") !== "public, max-age=31536000, immutable") return null;
  return { name, required: true, uploadUrl: value.uploadUrl, method: "PUT",
    headers: Object.fromEntries(headers.entries()), expiresAt: value.expiresAt };
}

export function readDesktopReleasePreparation(value: unknown, metadata: DesktopReleaseFileMetadata[]): DesktopReleasePreparation | null {
  if (!object(value) || !isDesktopReleaseId(value.release) || !Array.isArray(value.uploads)
    || value.uploads.length !== desktopReleaseFileNames.length) return null;
  const uploads = value.uploads.map(item => readUpload(item, metadata, value.release as string));
  if (uploads.some(item => !item)) return null;
  const byName = new Map(uploads.map(item => [item!.name, item!]));
  if (byName.size !== desktopReleaseFileNames.length || !desktopReleaseFileNames.every(name => byName.has(name))) return null;
  return { release: value.release, uploads: desktopReleaseFileNames.map(name => byName.get(name)!) };
}

export function nextDesktopVersion(current?: string | null): string {
  if (!isDesktopVersion(current)) return "";
  const parts = current.split(".").map(Number);
  if (parts[2] < 65535) return `${parts[0]}.${parts[1]}.${parts[2] + 1}.0`;
  if (parts[1] < 65535) return `${parts[0]}.${parts[1] + 1}.0.0`;
  return "";
}
