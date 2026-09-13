import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

assert.equal(process.env.PUPPY_TEST_ISOLATED, "1", "Only disposable test data may be used.");
const base = process.env.PUPPY_TEST_URL || "http://localhost:3101";
assert.equal(base, "http://localhost:3101", "Do not share the real application's 127.0.0.1 cookies or data.");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = JSON.parse(await readFile(path.join(root, "backend/build/account-fixture.json"), "utf8"));
const mailbox = new URL(fixture.httpUrl);
assert.equal(mailbox.protocol, "http:"); assert.equal(mailbox.hostname, "127.0.0.1");
assert.match(fixture.readToken, /^[A-Za-z0-9_-]{43}$/);
const adminEmail = "admin@puppyruby.test", password = "Puppy-SEO-Test-2026!";
let checks = 0;
function check(value, label) { assert.ok(value, label); checks++; }
function equal(actual, expected, label) { assert.deepEqual(actual, expected, label); checks++; }
function person() {
  const jar = new Map();
  return { async call(route, body, expected = 200, extra = {}) {
    const response = await fetch(`${base}${route}`, { method: body === undefined ? "GET" : "POST", redirect: "manual", signal: AbortSignal.timeout(20_000),
      headers: { "Content-Type": "application/json", Origin: base, Cookie: [...jar].map(([key, value]) => `${key}=${value}`).join("; "), ...extra },
      body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json(); equal(response.status, expected, `${route}: ${JSON.stringify(data)}`);
    check(response.headers.get("cache-control")?.includes("no-store"), "Public and private configuration responses are not cached");
    for (const cookie of response.headers.getSetCookie()) { const pair = cookie.split(";")[0], separator = pair.indexOf("="); const key = pair.slice(0, separator), value = pair.slice(separator + 1); if (value) jar.set(key, value); else jar.delete(key); }
    return data;
  } };
}
const admin = person(), member = person(), guest = person();
const initial = await guest.call("/api/seo");
equal(Object.keys(initial).sort(), ["siteName", "siteUrl", "defaultTitle", "defaultDescription", "ogImageUrl", "ogImageAlt", "googleVerification", "naverVerification", "indexingEnabled", "pages", "revision", "updatedAt"].sort(), "Only public configuration is returned");
equal(initial.revision, 0, "Fresh test server starts with unmodified defaults");
equal(Object.keys(initial.pages).sort(), ["home", "play", "shop"], "Only supported public pages can be configured");
const payload = config => { const { revision, updatedAt, ...values } = structuredClone(config); return { ...values, expectedRevision: revision }; };
await guest.call("/api/admin/seo", undefined, 401);
await guest.call("/api/admin/seo", payload(initial), 401, { "X-Session-Token": "x".repeat(43), "X-Player-Id": randomUUID() });
equal((await fetch(`${base}/api/seo`, { method: "POST", signal: AbortSignal.timeout(5000) })).status, 405, "Public settings are read only");
await member.call("/api/auth/register", { email: `seo-${randomUUID().slice(0, 8)}@puppyruby.test`, password, displayName: "검색 검증 회원" });
await member.call("/api/admin/seo", undefined, 403); await member.call("/api/admin/seo", payload(initial), 403);
await admin.call("/api/auth/register", { email: adminEmail, password, displayName: "검색 검증 관리자" });
await admin.call("/api/admin/seo", undefined, 403);
await admin.call("/api/auth/verify-email/request", {});
const inbox = await fetch(`${mailbox.origin}/messages?to=${encodeURIComponent(adminEmail)}`, { headers: { Authorization: `Bearer ${fixture.readToken}` }, signal: AbortSignal.timeout(5000) }).then(response => response.json());
const message = [...inbox.messages].reverse().find(item => item.text.includes("/account/verify?token="));
check(message, "Only the local mailbox receives the synthetic verification");
const link = message.text.match(/https?:\/\/[^\s<>"']+/g)?.map(value => new URL(value)).find(value => value.pathname === "/account/verify");
equal(link?.origin, base, "Verification link uses the isolated frontend");
await guest.call("/api/auth/verify-email/confirm", { token: link.searchParams.get("token") });
equal((await admin.call("/api/auth/me")).user.role, "ADMIN", "Verified configured administrator is authorized");
const gameBefore = await admin.call("/api/game"), appearanceBefore = await guest.call("/api/appearance");
let current = await admin.call("/api/admin/seo"); equal(current, initial, "Rejected attempts preserved the initial settings");
try {
  const draft = { ...payload(current), siteName: "검색 테스트", siteUrl: "https://seo.example.test/", defaultTitle: "퍼피루비 & 친구들 <테스트>",
    defaultDescription: "도트 강아지와 함께하는 테스트 설명.", ogImageUrl: "https://cdn.example.test/seo-share.jpg", ogImageAlt: "귀여운 강아지",
    googleVerification: "google_SEO-test-123", naverVerification: "naver_SEO-test-456" };
  draft.pages.play = { title: "우리 강아지", description: "페이지별 소개", indexable: false };
  current = await admin.call("/api/admin/seo", draft);
  equal(current.revision, 1, "Save advances revision once"); equal(current.siteUrl, "https://seo.example.test", "Origin is normalized");
  equal(current.pages.play.indexable, false, "Page indexing selection persists");
  equal(current.defaultTitle, draft.defaultTitle, "Title is persisted as text, not interpreted as HTML");
  equal(await guest.call("/api/seo"), current, "Anonymous readers receive the saved settings");
  equal(await member.call("/api/seo"), current, "Settings apply across accounts");
  const html = await fetch(`${base}/`, { headers: { "User-Agent": "Yeti/1.1" }, signal: AbortSignal.timeout(10000) }).then(response => response.text());
  const head = html.split("</head>")[0]; check(head.includes("google-site-verification") && head.includes("google_SEO-test-123"), "Google verification is in initial HTML head");
  check(head.includes("naver-site-verification") && head.includes("naver_SEO-test-456"), "Naver verification is in initial HTML head");
  check(head.includes("&lt;테스트&gt;") && !head.includes("<테스트>"), "Rendered title is escaped");
  const sitemap = await fetch(`${base}/sitemap.xml`).then(response => response.text());
  check(sitemap.includes("https://seo.example.test/"), "Saved origin is used by sitemap without rebuild");
  check(!sitemap.includes("/play</loc>") && !sitemap.includes("/admin") && !sitemap.includes("/account"), "Private and disabled pages are excluded");
  for (const patch of [
    { siteName: "" }, { defaultTitle: "" }, { defaultDescription: "" }, { defaultTitle: "가".repeat(101) },
    { googleVerification: '<meta name="google-site-verification" content="test">' }, { naverVerification: "bad code" },
    { siteUrl: "http://seo.example.test" }, { siteUrl: "https://localhost" }, { siteUrl: "https://127.0.0.1" },
    { siteUrl: "https://seo.example.test/path" }, { siteUrl: "https://user:password@seo.example.test" },
    { ogImageUrl: "javascript:alert(1)" }, { ogImageUrl: "data:image/png;base64,AAAA" },
    { indexingEnabled: "false" }, { pages: { ...current.pages, admin: { title: "bad", description: "", indexable: true } } },
    { pages: { ...current.pages, home: { title: "", description: "", indexable: "true" } } },
    { expectedRevision: String(current.revision) }, { extra: "not supported" },
  ]) await admin.call("/api/admin/seo", { ...payload(current), ...patch }, 400);
  await admin.call("/api/admin/seo", { ...payload(current), expectedRevision: 0 }, 409);
  await admin.call("/api/admin/seo", payload(current), 403, { Origin: "https://attacker.example" });
  await admin.call("/api/admin/seo", { ...payload(current), defaultDescription: "a".repeat(17 * 1024) }, 400);
  equal(await guest.call("/api/seo"), current, "Invalid, stale, cross-origin and oversized writes preserve configuration");
  current = await admin.call("/api/admin/seo", { ...payload(current), indexingEnabled: false });
  const disabledSitemap = await fetch(`${base}/sitemap.xml`).then(response => response.text());
  check(!disabledSitemap.includes("<url>"), "Global search exclusion empties sitemap immediately");
  const disabledHtml = await fetch(`${base}/shop`, { headers: { "User-Agent": "Yeti/1.1" } }).then(response => response.text());
  check(/<meta name="robots" content="[^"]*noindex/.test(disabledHtml.split("</head>")[0]), "Global exclusion reaches page robots tag");
  equal(await admin.call("/api/game"), gameBefore, "SEO updates do not mutate game progress");
  equal(await guest.call("/api/appearance"), appearanceBefore, "SEO updates preserve appearance configuration");
} finally {
  current = await admin.call("/api/admin/seo");
  current = await admin.call("/api/admin/seo", { ...payload(initial), expectedRevision: current.revision });
}
await writeFile(path.join(root, "backend/build/seo-ui-fixture.json"), JSON.stringify({ base, adminEmail, password, checks, revision: current.revision }, null, 2));
console.log(`PASS ${checks} SEO API and persistence checks. Disposable administrator ready.`);
