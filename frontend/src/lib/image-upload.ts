export type ImageUploadConfig = { enabled: boolean; maxBytes: number; acceptedTypes: string[] };
export type UploadedPhoto = { photo: string; url: string };
export type ImageUploadStage = "prepare" | "upload" | "verify";

const mediaId = /^media:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uploadId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Only use this for photo values returned by the authorized profile API. */
export function safeProfilePhoto(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^data:image\/(jpeg|png|webp);base64,/.test(value)) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? value : null;
  } catch { return null; }
}

function failureMessage(status: number) {
  if (status === 401) return "사진을 등록하려면 다시 로그인해 주세요.";
  if (status === 403) return "사진을 등록할 수 없어요. 계정 상태를 확인해 주세요.";
  if (status === 413) return "사진 용량이 너무 커요. 다른 사진을 골라 주세요.";
  if (status === 429) return "사진을 너무 자주 등록했어요. 잠시 후 다시 시도해 주세요.";
  if (status === 503) return "사진 등록을 준비 중이에요. 잠시 후 다시 시도해 주세요.";
  if (status === 400 || status === 409 || status === 410 || status === 422) return "사진을 확인하지 못했어요. 다시 선택해 주세요.";
  return "사진을 등록하지 못했어요. 잠시 후 다시 시도해 주세요.";
}

async function mediaRequest(action: "config" | "presign" | "complete", signal: AbortSignal, body?: Record<string, unknown>): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(`/api/media/${action}`, {
      method: body ? "POST" : "GET", credentials: "same-origin", cache: "no-store",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined, signal,
    });
  } catch (problem) {
    if (signal.aborted) throw problem;
    throw new Error("사진 등록에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.");
  }
  if (!response.ok) throw new Error(failureMessage(response.status));
  const data: unknown = await response.json().catch(() => null);
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("사진 등록 응답을 확인하지 못했어요.");
  return data as Record<string, unknown>;
}

export async function getImageUploadConfig(signal: AbortSignal): Promise<ImageUploadConfig> {
  const data = await mediaRequest("config", signal);
  if (typeof data.enabled !== "boolean" || typeof data.maxBytes !== "number" || !Number.isSafeInteger(data.maxBytes) || data.maxBytes <= 0
    || !Array.isArray(data.acceptedTypes) || !data.acceptedTypes.every(type => typeof type === "string")) throw new Error("사진 등록 설정을 확인하지 못했어요.");
  return { enabled: data.enabled, maxBytes: data.maxBytes, acceptedTypes: data.acceptedTypes as string[] };
}

async function preparePhoto(file: File, signal: AbortSignal): Promise<Blob> {
  if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) throw new Error("JPG, PNG, WebP, GIF 사진을 선택해 주세요.");
  if (file.size === 0 || file.size > 10 * 1024 * 1024) throw new Error("10MB 이하의 사진을 선택해 주세요.");
  signal.throwIfAborted();
  const source = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = source;
    try { await image.decode(); }
    catch { throw new Error("사진을 읽지 못했어요. 다른 사진으로 시도해 주세요."); }
    signal.throwIfAborted();
    if (!image.width || !image.height) throw new Error("사진을 읽지 못했어요. 다른 사진으로 시도해 주세요.");
    const canvas = document.createElement("canvas"); canvas.width = 256; canvas.height = 256;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("이 브라우저에서 사진을 준비하지 못했어요.");
    context.fillStyle = "#ffffff"; context.fillRect(0, 0, 256, 256);
    const ratio = Math.min(256 / image.width, 256 / image.height);
    const width = image.width * ratio, height = image.height * ratio;
    context.drawImage(image, (256 - width) / 2, (256 - height) / 2, width, height);
    const result = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("사진을 준비하지 못했어요.")), "image/jpeg", .85));
    signal.throwIfAborted();
    if (result.size > 160 * 1024) throw new Error("사진 용량을 줄이지 못했어요. 다른 사진을 골라 주세요.");
    return result;
  } finally { URL.revokeObjectURL(source); }
}

export async function uploadProfilePhoto(file: File, config: ImageUploadConfig, signal: AbortSignal, onStage: (stage: ImageUploadStage) => void): Promise<UploadedPhoto> {
  if (!config.enabled) throw new Error("사진 등록을 준비 중이에요. 프로필은 사진 없이도 저장할 수 있어요.");
  onStage("prepare");
  const blob = await preparePhoto(file, signal);
  if (blob.size > config.maxBytes || !config.acceptedTypes.includes(blob.type)) throw new Error("등록할 수 없는 사진이에요. 다른 사진을 선택해 주세요.");
  if (!globalThis.crypto?.subtle) throw new Error("사진 등록에는 보안 연결이 필요해요. 사이트 주소를 확인해 주세요.");
  const checksum = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()))));
  signal.throwIfAborted();
  const signed = await mediaRequest("presign", signal, { contentType: blob.type, size: blob.size, sha256: checksum });
  if (signed.method !== "PUT" || typeof signed.uploadId !== "string" || !uploadId.test(signed.uploadId)
    || typeof signed.uploadUrl !== "string" || !safeProfilePhoto(signed.uploadUrl)?.startsWith("https:")
    || typeof signed.expiresAt !== "number" || signed.expiresAt <= Date.now()
    || !signed.headers || typeof signed.headers !== "object" || Array.isArray(signed.headers)) throw new Error("사진 등록 주소를 확인하지 못했어요.");
  const entries = Object.entries(signed.headers);
  if (!entries.every(([key, value]) => /^(content-type|x-amz-[a-z0-9-]+)$/i.test(key) && typeof value === "string")) throw new Error("사진 등록 정보를 확인하지 못했어요.");
  const headers = new Headers(entries as [string, string][]);
  if (headers.get("content-type") !== blob.type || headers.get("x-amz-checksum-sha256") !== checksum) throw new Error("사진 등록 정보를 확인하지 못했어요.");
  signal.throwIfAborted();
  onStage("upload");
  // The signed URL authorizes this one upload; never send application cookies or a referrer to storage.
  let uploaded: Response;
  try {
    uploaded = await fetch(signed.uploadUrl, { method: "PUT", headers, body: blob, credentials: "omit", referrerPolicy: "no-referrer", redirect: "error", signal });
  } catch (problem) {
    if (signal.aborted) throw problem;
    throw new Error("사진 전송이 완료되지 않았어요. 연결을 확인하고 다시 선택해 주세요.");
  }
  if (!uploaded.ok) throw new Error("사진 전송이 완료되지 않았어요. 다시 선택해 주세요.");
  signal.throwIfAborted();
  onStage("verify");
  const completed = await mediaRequest("complete", signal, { uploadId: signed.uploadId });
  if (typeof completed.photo !== "string" || !mediaId.test(completed.photo) || typeof completed.url !== "string"
    || !safeProfilePhoto(completed.url)?.startsWith("https:")) throw new Error("등록한 사진을 확인하지 못했어요.");
  signal.throwIfAborted();
  return { photo: completed.photo, url: completed.url };
}
