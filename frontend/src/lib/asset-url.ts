import publicMediaRelease from "./generated/public-media-release.json";

/** Public, build-time configuration only. Never put credentials or signed URLs here. */
export function publicAssetBaseUrl(value = process.env.NEXT_PUBLIC_ASSET_BASE_URL): string {
  return validatedBase(value?.trim() || publicMediaRelease.images.baseUrl, "NEXT_PUBLIC_ASSET_BASE_URL");
}

/** Downloads retain their public /downloads URLs and redirect directly to CDN. */
export function publicDownloadBaseUrl(value = process.env.NEXT_PUBLIC_DOWNLOAD_BASE_URL): string {
  return validatedBase(value?.trim() || publicMediaRelease.downloads.baseUrl, "NEXT_PUBLIC_DOWNLOAD_BASE_URL");
}

function validatedBase(value: string, variable: string): string {
  const clean = value.trim();
  if (!clean) return "";
  try {
    if (/[\s\\"'<>`]/u.test(clean) || /\/(?:\.|%2e){1,2}(?:\/|$)/i.test(clean)) throw new Error();
    const url = new URL(clean);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if ((url.protocol !== "https:" && !(url.protocol === "http:" && loopback))
      || url.username || url.password || url.search || url.hash || !url.hostname) throw new Error();
    const path = decodeURIComponent(url.pathname);
    if (/[\s\\"'<>`?#]/u.test(path) || path.split("/").some(part => part === "." || part === "..")) throw new Error();
    return url.origin + url.pathname.replace(/\/+$/, "");
  } catch {
    // Do not echo a malformed value: it may accidentally contain a credential.
    throw new Error(`${variable}에는 쿼리·인증정보 없는 HTTPS CDN 기본 주소를 입력해 주세요. 로컬 테스트만 HTTP localhost를 사용할 수 있어요.`);
  }
}

/** Map our public images only; user photos, API URLs and binary downloads remain untouched. */
export function assetUrl(path: string): string {
  if (!(path.startsWith("/images/") || path === "/favicon.svg")) return path;
  try {
    const decoded = decodeURIComponent(path);
    if (/[\s\\"'<>`?#]/u.test(decoded) || decoded.split("/").some(part => part === "." || part === "..")) return path;
  } catch { return path; }
  const base = publicAssetBaseUrl();
  return base ? `${base}${path}` : path;
}
