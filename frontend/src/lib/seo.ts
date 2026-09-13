export const seoPages = [
  { id: "home", path: "/", name: "소개 페이지" },
  { id: "play", path: "/play", name: "강아지 우리 집" },
  { id: "shop", path: "/shop", name: "뽑기 상점" },
] as const;
export type SeoPageKey = (typeof seoPages)[number]["id"];
export type SeoPageSettings = { title: string; description: string; indexable: boolean };
export type SeoConfig = {
  siteName: string; siteUrl: string; defaultTitle: string; defaultDescription: string;
  ogImageUrl: string; ogImageAlt: string; googleVerification: string; naverVerification: string;
  indexingEnabled: boolean; pages: Record<SeoPageKey, SeoPageSettings>; revision: number; updatedAt: number | null;
};
export const defaultSeoConfig: SeoConfig = {
  siteName: "PuppyRuby", siteUrl: "", defaultTitle: "PuppyRuby · 너의 하루에 작은 멍! 하나",
  defaultDescription: "평범한 화면 속, 특별한 내 강아지. 시바견부터 사모예드까지, 픽셀 강아지를 만나고 쓰다듬고 함께 놀아요. 설치 없이 시작하는 작은 행복.",
  ogImageUrl: "", ogImageAlt: "", googleVerification: "", naverVerification: "", indexingEnabled: true,
  pages: {
    home: { title: "", description: "", indexable: true },
    play: { title: "우리 집 · PuppyRuby", description: "", indexable: true },
    shop: { title: "상점 · PuppyRuby", description: "강아지 친구와 아우라, 치장품을 만나고 보관함에서 꾸며요.", indexable: true },
  }, revision: 0, updatedAt: null,
};
export function cloneSeoConfig(config: SeoConfig): SeoConfig {
  return { ...config, pages: { home: { ...config.pages.home }, play: { ...config.pages.play }, shop: { ...config.pages.shop } } };
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} 설정을 확인해 주세요.`);
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string, max: number, required = false): string {
  if (typeof value !== "string") throw new Error(`${label}을 확인해 주세요.`);
  const clean = value.trim();
  if ((required && !clean) || [...clean].length > max || /[\p{Cc}\p{Cf}]/u.test(clean)) throw new Error(`${label}은 ${required ? "1~" : ""}${max}자 이내로 입력해 주세요.`);
  return clean;
}
export function seoHttpsUrl(value: string, originOnly = false): string | null {
  if (!value || /[\s\\<>"]/u.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || !url.hostname
      || (originOnly && (url.pathname !== "/" || url.search || url.hash))) return null;
    if (originOnly) {
      const host = url.hostname.toLowerCase().replace(/\.$/, "");
      if (!host.includes(".") || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.startsWith("[")) return null;
      if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
        const [a, b] = host.split(".").map(Number);
        if (a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224) return null;
      }
    }
    return originOnly ? url.origin : url.href;
  } catch { return null; }
}
export function parseSeoConfig(value: unknown): SeoConfig {
  const data = record(value, "검색 노출");
  const siteName = text(data.siteName, "사이트 이름", 60, true);
  const defaultTitle = text(data.defaultTitle, "기본 제목", 100, true);
  const defaultDescription = text(data.defaultDescription, "기본 설명", 300, true);
  const siteUrl = text(data.siteUrl, "사이트 주소", 300);
  const ogImageUrl = text(data.ogImageUrl, "공유 이미지 주소", 2048);
  if (siteUrl && !seoHttpsUrl(siteUrl, true)) throw new Error("사이트 주소는 https://로 시작하는 공개 사이트의 기본 주소만 입력해 주세요.");
  if (ogImageUrl && !seoHttpsUrl(ogImageUrl)) throw new Error("공유 이미지 주소는 https://로 시작하는 공개 이미지 주소를 입력해 주세요.");
  const ogImageAlt = text(data.ogImageAlt, "공유 이미지 설명", 160);
  const googleVerification = text(data.googleVerification, "구글 확인 코드", 200);
  const naverVerification = text(data.naverVerification, "네이버 확인 코드", 200);
  if ([googleVerification, naverVerification].some(token => token && !/^[A-Za-z0-9_-]+$/.test(token))) throw new Error("소유 확인에는 HTML 태그 대신 content 안의 확인 코드만 입력해 주세요.");
  if (typeof data.indexingEnabled !== "boolean") throw new Error("검색 노출 허용 설정을 확인해 주세요.");
  if (!Number.isSafeInteger(data.revision) || (data.revision as number) < 0
    || !(data.updatedAt === null || (Number.isSafeInteger(data.updatedAt) && (data.updatedAt as number) >= 0))) throw new Error("설정 버전을 확인하지 못했어요. 최신 설정을 다시 불러와 주세요.");
  const rawPages = record(data.pages, "페이지별 검색");
  if (Object.keys(rawPages).length !== seoPages.length || seoPages.some(page => !Object.hasOwn(rawPages, page.id))) throw new Error("검색 노출을 설정할 페이지를 확인해 주세요.");
  const pages = Object.fromEntries(seoPages.map(page => {
    const item = record(rawPages[page.id], page.name);
    if (Object.keys(item).length !== 3 || typeof item.indexable !== "boolean") throw new Error(`${page.name}의 설정을 확인해 주세요.`);
    return [page.id, { title: text(item.title, `${page.name} 제목`, 100), description: text(item.description, `${page.name} 설명`, 300), indexable: item.indexable }];
  })) as SeoConfig["pages"];
  return { siteName, siteUrl: siteUrl ? seoHttpsUrl(siteUrl, true)! : "", defaultTitle, defaultDescription,
    ogImageUrl: ogImageUrl ? seoHttpsUrl(ogImageUrl)! : "", ogImageAlt, googleVerification, naverVerification,
    indexingEnabled: data.indexingEnabled, pages, revision: data.revision as number, updatedAt: data.updatedAt as number | null };
}
export function seoDraftProblem(value: SeoConfig): string {
  try { parseSeoConfig(value); return ""; } catch (error) { return error instanceof Error ? error.message : "입력한 설정을 확인해 주세요."; }
}
