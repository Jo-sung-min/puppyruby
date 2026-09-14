import publicMediaRelease from "./generated/public-media-release.json";
import rubyRoundMediaRelease from "./generated/ruby-round-media-release.json";

/** Public, build-time configuration only. Never put credentials or signed URLs here. */
export function publicAssetBaseUrl(value = process.env.NEXT_PUBLIC_ASSET_BASE_URL): string {
  return validatedBase(value?.trim() || publicMediaRelease.images.baseUrl, "NEXT_PUBLIC_ASSET_BASE_URL");
}

/** Downloads retain their public /downloads URLs and redirect directly to CDN. */
export function publicDownloadBaseUrl(value = process.env.NEXT_PUBLIC_DOWNLOAD_BASE_URL): string {
  return validatedBase(value?.trim() || publicMediaRelease.downloads.baseUrl, "NEXT_PUBLIC_DOWNLOAD_BASE_URL");
}

/** The independently published pack includes both PNGs and editable Aseprite masters. */
export function publicRubyRoundBaseUrl(value = process.env.NEXT_PUBLIC_RUBY_ROUND_BASE_URL): string {
  return validatedBase(value?.trim() || rubyRoundMediaRelease.baseUrl, "NEXT_PUBLIC_RUBY_ROUND_BASE_URL");
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

/** Map project media only; photos, APIs and unrelated downloads retain their URLs. */
export function assetUrl(path: string): string {
  const rubyRound = path.startsWith("/images/ruby-round-v1/") || path.startsWith("/downloads/ruby-round-v1/");
  if (!(path.startsWith("/images/") || path === "/favicon.svg" || rubyRound)) return path;
  try {
    const decoded = decodeURIComponent(path);
    if (/[\s\\"'<>`?#]/u.test(decoded) || decoded.split("/").some(part => part === "." || part === "..")) return path;
  } catch { return path; }
  const base = rubyRound ? publicRubyRoundBaseUrl() : publicAssetBaseUrl();
  return base ? `${base}${path}` : path;
}
