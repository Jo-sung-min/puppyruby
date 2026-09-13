import type { ImageUploadConfig, ImageUploadStage } from "./image-upload";

export type SeoImageUploadConfig = ImageUploadConfig;
export type SeoImageUploadStage = ImageUploadStage;
export type UploadedSeoImage = { url: string };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function httpsImage(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password && !url.hash; }
  catch { return false; }
}
function failure(status: number) {
  if (status === 401) return "공유 이미지를 올리려면 다시 로그인해 주세요.";
  if (status === 403) return "이메일 인증을 마친 관리자만 공유 이미지를 올릴 수 있어요.";
  if (status === 429) return "이미지를 너무 자주 올렸어요. 잠시 후 다시 시도해 주세요.";
  if (status === 503) return "이미지 업로드를 준비 중이에요. 공유 이미지 주소를 직접 입력할 수 있어요.";
  return "공유 이미지를 확인하지 못했어요. 다른 이미지로 다시 시도해 주세요.";
}

async function request(action: "config" | "presign" | "complete", signal: AbortSignal, body?: Record<string, unknown>) {
  let response: Response;
  try {
    response = await fetch(`/api/admin/seo-media/${action}`, {
      method: body ? "POST" : "GET", credentials: "same-origin", cache: "no-store", redirect: "error",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined, signal,
    });
  } catch (problem) {
    signal.throwIfAborted();
    throw new Error("이미지 업로드에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.");
  }
  signal.throwIfAborted();
  if (!response.ok) throw new Error(failure(response.status));
  const data: unknown = await response.json().catch(() => null);
  signal.throwIfAborted();
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("이미지 업로드 응답을 확인하지 못했어요.");
  return data as Record<string, unknown>;
}

export async function getSeoImageUploadConfig(signal: AbortSignal): Promise<SeoImageUploadConfig> {
  const data = await request("config", signal);
  if (typeof data.enabled !== "boolean" || typeof data.maxBytes !== "number" || !Number.isSafeInteger(data.maxBytes)
    || data.maxBytes <= 0 || data.maxBytes > 5 * 1024 * 1024 || !Array.isArray(data.acceptedTypes)
    || !data.acceptedTypes.every(type => type === "image/jpeg" || type === "image/png")) throw new Error("이미지 업로드 설정을 확인하지 못했어요.");
  return { enabled: data.enabled, maxBytes: data.maxBytes, acceptedTypes: [...data.acceptedTypes] as string[] };
}

async function prepare(file: File, maxBytes: number, signal: AbortSignal): Promise<Blob> {
  if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) throw new Error("JPG, PNG, WebP, GIF 이미지를 선택해 주세요.");
  if (file.size <= 0 || file.size > 10 * 1024 * 1024) throw new Error("10MB 이하의 이미지를 선택해 주세요.");
  signal.throwIfAborted();
  const source = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = source;
    try { await image.decode(); }
    catch { signal.throwIfAborted(); throw new Error("이미지를 읽지 못했어요. 다른 이미지를 골라 주세요."); }
    signal.throwIfAborted();
    if (!Number.isFinite(image.width) || !Number.isFinite(image.height) || image.width <= 0 || image.height <= 0)
      throw new Error("이미지 크기를 확인하지 못했어요.");
    const canvas = document.createElement("canvas"); canvas.width = 1200; canvas.height = 630;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("이 브라우저에서 이미지를 준비하지 못했어요.");
    context.fillStyle = "#ffffff"; context.fillRect(0, 0, 1200, 630);
    const ratio = Math.min(1200 / image.width, 630 / image.height);
    const width = image.width * ratio, height = image.height * ratio;
    context.drawImage(image, (1200 - width) / 2, (630 - height) / 2, width, height);
    // Keep the shared1200×630 frame and reduce JPEG quality only when necessary.
    for (const quality of [.9, .82, .7, .55, .4, .25]) {
      signal.throwIfAborted();
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value)
        : reject(new Error("이미지를 준비하지 못했어요.")), "image/jpeg", quality));
      signal.throwIfAborted();
      if (blob.type === "image/jpeg" && blob.size > 0 && blob.size <= maxBytes) return blob;
    }
    throw new Error("이미지 용량을 충분히 줄이지 못했어요. 더 단순하거나 작은 이미지를 골라 주세요.");
  } finally { URL.revokeObjectURL(source); }
}

export async function uploadSeoImage(file: File, config: SeoImageUploadConfig, signal: AbortSignal,
  onStage: (stage: SeoImageUploadStage) => void): Promise<UploadedSeoImage> {
  if (!config.enabled) throw new Error(failure(503));
  if (!config.acceptedTypes.includes("image/jpeg") || !Number.isSafeInteger(config.maxBytes) || config.maxBytes <= 0)
    throw new Error("이미지 업로드 설정을 확인하지 못했어요.");
  signal.throwIfAborted(); onStage("prepare");
  const blob = await prepare(file, config.maxBytes, signal);
  if (!globalThis.crypto?.subtle) throw new Error("이미지 업로드에는 HTTPS 보안 연결이 필요해요.");
  const checksum = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()))));
  signal.throwIfAborted();
  const signed = await request("presign", signal, { contentType: blob.type, size: blob.size, sha256: checksum });
  if (signed.method !== "PUT" || typeof signed.uploadId !== "string" || !uuid.test(signed.uploadId) || !httpsImage(signed.uploadUrl)
    || typeof signed.expiresAt !== "number" || !Number.isSafeInteger(signed.expiresAt) || signed.expiresAt <= Date.now()
    || !signed.headers || typeof signed.headers !== "object" || Array.isArray(signed.headers)) throw new Error("이미지 업로드 주소를 확인하지 못했어요.");
  const entries = Object.entries(signed.headers);
  if (!entries.every(([name, value]) => /^(content-type|x-amz-[a-z0-9-]+)$/i.test(name) && typeof value === "string"))
    throw new Error("이미지 업로드 정보를 확인하지 못했어요.");
  let headers: Headers;
  try { headers = new Headers(entries as [string, string][]); }
  catch { throw new Error("이미지 업로드 정보를 확인하지 못했어요."); }
  if (headers.get("content-type") !== blob.type || headers.get("x-amz-checksum-sha256") !== checksum)
    throw new Error("이미지 업로드 정보를 확인하지 못했어요.");
  signal.throwIfAborted(); onStage("upload"); signal.throwIfAborted();
  let uploaded: Response;
  try {
    uploaded = await fetch(signed.uploadUrl, { method: "PUT", headers, body: blob, credentials: "omit",
      referrerPolicy: "no-referrer", redirect: "error", signal });
  } catch {
    signal.throwIfAborted(); throw new Error("이미지 전송을 완료하지 못했어요. 다시 선택해 주세요.");
  }
  if (!uploaded.ok) throw new Error("이미지 전송을 완료하지 못했어요. 다시 선택해 주세요.");
  signal.throwIfAborted(); onStage("verify"); signal.throwIfAborted();
  const completed = await request("complete", signal, { uploadId: signed.uploadId });
  if (!httpsImage(completed.url)) throw new Error("등록한 공유 이미지를 확인하지 못했어요.");
  return { url: completed.url };
}
