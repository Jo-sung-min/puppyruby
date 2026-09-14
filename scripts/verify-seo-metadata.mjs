import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, access } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { createServer as tcpServer } from "node:net";
import Module from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Real server-rendered HTML against a disposable backend. No browser, user database or public service is contacted.
assert.equal(process.env.PUPPY_TEST_ISOLATED, "1", "Run with PUPPY_TEST_ISOLATED=1; this script starts its own local test servers.");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontend = resolve(root, "frontend"), origin = "http://127.0.0.1:3121";
const nextBin = resolve(frontend, "node_modules/next/dist/bin/next");
await access(nextBin);
const manifest = JSON.parse(await readFile(resolve(frontend, ".next/server/app-paths-manifest.json"), "utf8"));
assert.ok(manifest["/robots.txt/route"] && manifest["/sitemap.xml/route"], "Build the current SEO frontend first.");
const requireFrontend = Module.createRequire(resolve(frontend, "package.json"));
const swc = requireFrontend("next/dist/build/swc");
function loadSource(relative, overrides = {}) {
  const filename = resolve(frontend, relative);
  const compiled = swc.transformSync(readFileSync(filename, "utf8"), { filename, jsc: { parser: { syntax: "typescript" }, target: "es2022" }, module: { type: "commonjs" } }).code;
  const loaded = new Module(filename); loaded.filename = filename; loaded.paths = Module._nodeModulePaths(dirname(filename));
  const fallback = loaded.require.bind(loaded);
  loaded.require = name => Object.hasOwn(overrides, name) ? overrides[name] : fallback(name);
  loaded._compile(compiled, filename); return loaded.exports;
}
const schema = loadSource("src/lib/seo.ts");
const assetUrls = loadSource("src/lib/asset-url.ts");
const builders = loadSource("src/lib/server-seo.ts", { "server-only": {}, "./seo": schema, "./asset-url": assetUrls, "./server-session": { apiBase: () => "http://127.0.0.1:1/api/v1" } });
let checks = 0;
function check(condition, label) { assert.ok(condition, label); checks++; }
function equal(actual, expected, label) { assert.deepEqual(actual, expected, label); checks++; }
const clone = value => JSON.parse(JSON.stringify(value));
let settings = schema.parseSeoConfig({ ...clone(schema.defaultSeoConfig), siteName: "퍼피루비 & 친구", siteUrl: "https://dogs.example.test",
  defaultTitle: '퍼피루비 <b>친구</b> & "우리"', defaultDescription: '작은 <em>강아지</em>와 "함께" & 산책해요.',
  ogImageUrl: "https://cdn.example.test/dog.png?a=1&b=2", ogImageAlt: '귀여운 "강아지" & 친구', googleVerification: "Google_123-ab", naverVerification: "Naver_789-xy", revision: 7, updatedAt: 1789257600000,
  pages: { home: { title: "", description: "", indexable: true }, play: { title: "우리 집 <script>danger()</script>", description: "키보드와 마우스로 함께 놀아요.", indexable: true }, shop: { title: "강아지 상점 & 꾸미기", description: "새 아우라를 만나 보세요.", indexable: true } },
});
let behavior = "normal", requests = [], fakeFailure, child, childError, childOutput = "", cleanupTask;
const delay = ms => new Promise(done => setTimeout(done, ms));
async function listen(server, port) {
  await new Promise((done, fail) => { server.once("error", fail); server.listen(port, "127.0.0.1", () => { server.off("error", fail); done(); }); });
}
async function freePort() {
  const probe = tcpServer();
  try { await listen(probe, 3121); } catch { throw new Error("Port3121 is occupied; this test never stops an existing application."); }
  await new Promise(done => probe.close(done));
}
const fake = createServer((request, response) => {
  try {
    requests.push({ url: request.url, headers: request.headers });
    assert.equal(request.url, "/api/v1/seo", "SEO must request only its public endpoint.");
    assert.equal(request.method, "GET");
    for (const key of ["cookie", "authorization", "x-session-token", "x-player-id"]) assert.equal(request.headers[key], undefined, `Never forward ${key} to public SEO.`);
    if (behavior === "disconnect") { request.socket.destroy(); return; }
    if (behavior === "redirect") { response.writeHead(307, { Location: "/forbidden-redirect" }); response.end(); return; }
    if (behavior === "invalid") { response.writeHead(200, { "Content-Type": "application/json" }); response.end('{"defaultTitle":"BROKEN-SECRET-MARKER"}'); return; }
    if (behavior === "failure") { response.writeHead(503, { "Content-Type": "application/json" }); response.end('{"message":"BROKEN-SECRET-MARKER"}'); return; }
    response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" }); response.end(JSON.stringify(settings));
  } catch (error) { fakeFailure = error; response.writeHead(500); response.end("Fixture failure"); }
});
async function cleanup() {
  if (cleanupTask) return cleanupTask;
  cleanupTask = (async () => {
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = new Promise(done => child.once("exit", done)); child.kill(); await Promise.race([exited, delay(3000)]);
      if (child.exitCode === null && child.signalCode === null) { child.kill("SIGKILL"); await Promise.race([exited, delay(3000)]); }
    }
    if (fake.listening) { fake.closeAllConnections(); await new Promise(done => fake.close(done)); }
  })(); return cleanupTask;
}
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { void cleanup().finally(() => process.exit(130)); });
const decode = text => text.replaceAll("&quot;", '"').replaceAll("&#x27;", "'").replaceAll("&#39;", "'").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");
function attributes(tag) { return Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map(match => [match[1], decode(match[2])])); }
function metadata(head, name) { return [...head.matchAll(/<meta\b[^>]*>/g)].map(match => attributes(match[0])).filter(attrs => attrs.name === name || attrs.property === name).map(attrs => attrs.content); }
function canonical(head) { return [...head.matchAll(/<link\b[^>]*>/g)].map(match => attributes(match[0])).filter(attrs => attrs.rel === "canonical").map(attrs => new URL(attrs.href).href); }
async function get(path, agent = "Mozilla/5.0 SEO-HTML-test") {
  assert.ok(path.startsWith("/") && !path.includes("://"));
  const response = await fetch(origin + path, { headers: { "User-Agent": agent, Cookie: "puppyruby-session=PRIVATE-TEST-COOKIE" }, redirect: "error", signal: AbortSignal.timeout(15000) });
  const text = await response.text(); equal(response.status, 200, `${path}: successful SSR response`);
  const cacheControl = response.headers.get("cache-control") || "";
  const metadataRoute = path === "/robots.txt" || path === "/sitemap.xml";
  check(/no-store/i.test(cacheControl) || (metadataRoute && /(?:^|,)\s*max-age=0(?:,|$)/i.test(cacheControl) && /must-revalidate/i.test(cacheControl) && !/s-maxage|stale-while-revalidate/i.test(cacheControl)), `${path}: responses require fresh settings rather than stale cache reuse`);
  if (fakeFailure) throw fakeFailure;
  check(!text.includes("BROKEN-SECRET-MARKER"), `${path}: upstream errors never become metadata`);
  return text;
}
async function page(path, agent) {
  const before = requests.length;
  const html = await get(path, agent), match = html.match(/<head(?:\s[^>]*)?>([\s\S]*?)<\/head>/);
  check(!!match, `${path}: has an initial server-rendered head`);
  equal(requests.length - before, 1, `${path}: layout and page share one SEO read per render`);
  return { html, head: match[1] };
}
async function checkPublic(path, key, agent) {
  const { head } = await page(path, agent), config = settings.pages[key], title = config.title || settings.defaultTitle, description = config.description || settings.defaultDescription;
  equal(decode(head.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? ""), title, `${path}: title is in HTML head`);
  equal(metadata(head, "description"), [description], `${path}: description is in HTML head`);
  equal(canonical(head), [`${settings.siteUrl}${path}`], `${path}: trusted canonical in head`);
  equal(metadata(head, "og:title"), [title], `${path}: OG title matches page`);
  equal(metadata(head, "og:description"), [description], `${path}: OG description matches page`);
  equal(metadata(head, "og:url").map(value => new URL(value).href), [`${settings.siteUrl}${path}`], `${path}: OG URL matches canonical`);
  equal(metadata(head, "og:site_name"), [settings.siteName], `${path}: configured OG site name`);
  equal(metadata(head, "og:image"), [settings.ogImageUrl], `${path}: public CDN image`);
  equal(metadata(head, "og:image:alt"), [settings.ogImageAlt], `${path}: image description`);
  equal(metadata(head, "twitter:card"), ["summary_large_image"], `${path}: large share card`);
  equal(metadata(head, "twitter:image"), [settings.ogImageUrl], `${path}: Twitter CDN image`);
  equal(metadata(head, "google-site-verification"), [settings.googleVerification], `${path}: Google verification in head`);
  equal(metadata(head, "naver-site-verification"), [settings.naverVerification], `${path}: Naver verification in head`);
  check(metadata(head, "robots")[0]?.startsWith(settings.indexingEnabled && config.indexable ? "index," : "noindex,"), `${path}: configured index rule`);
  check(!/<b>친구<\/b>|<script>danger\(\)<\/script>|<em>강아지<\/em>/.test(head), `${path}: editable strings are escaped rather than injected HTML`);
}

try {
  for (const invalid of ["", "http://example.test", "https://localhost", "https://127.0.0.1", "https://10.0.0.1", "https://192.168.1.4", "https://[::1]", "https://name:pass@example.test", "https://example.test/path", "https://example.test?x=1", "javascript:alert(1)"]) equal(builders.publicSeoOrigin({ siteUrl: invalid }, ""), undefined, `reject unsuitable public origin ${invalid}`);
  equal(builders.publicSeoOrigin({ siteUrl: "" }, "https://deployment.example.test/"), "https://deployment.example.test", "blank site URL inherits deployment setting");
  equal(builders.publicSeoOrigin(settings, "https://deployment.example.test"), settings.siteUrl, "saved site URL overrides deployment setting");
  equal(builders.seoSitemap({ ...settings, siteUrl: "" }, ""), [], "missing public origin omits sitemap entries");
  equal(builders.publicPageSeoMetadata({ ...settings, siteUrl: "" }, "home", "").alternates, undefined, "missing public origin omits canonical");
  await freePort(); await listen(fake, 0);
  child = spawn(process.execPath, [nextBin, "start", "--hostname", "127.0.0.1", "--port", "3121"], { cwd: frontend, windowsHide: true,
    env: { ...process.env, API_URL: `http://127.0.0.1:${fake.address().port}`, PUBLIC_SITE_URL: "https://deployment.example.test", NEXT_TELEMETRY_DISABLED: "1" }, stdio: ["ignore", "pipe", "pipe"] });
  child.on("error", error => { childError = error; });
  for (const stream of [child.stdout, child.stderr]) stream.on("data", data => { childOutput = (childOutput + data.toString()).slice(-8000); });
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (childError) throw childError;
    if (child.exitCode !== null) throw new Error(`Isolated Next stopped: ${childOutput}`);
    try { const response = await fetch(`${origin}/robots.txt`, { signal: AbortSignal.timeout(1000) }); if (response.ok) { ready = true; break; } } catch { /* The child is still starting. */ }
    await delay(250);
  }
  check(ready, "isolated Next server became ready");
  await checkPublic("/", "home"); await checkPublic("/play", "play", "Mozilla/5.0 (compatible; Yeti/1.1; +http://naver.me/spd)"); await checkPublic("/shop", "shop", "facebookexternalhit/1.1");
  for (const route of ["/account", "/account/me", "/account/reset", "/account/verify", "/admin", "/checkout", "/checkout/success", "/checkout/fail"]) {
    const { head } = await page(route);
    check(metadata(head, "robots")[0]?.includes("noindex"), `${route}: private page remains noindex`);
    equal(canonical(head), [], `${route}: does not inherit home canonical`);
    equal(metadata(head, "og:url"), [], `${route}: does not inherit public page URL`);
  }
  let sitemap = await get("/sitemap.xml"), robots = await get("/robots.txt");
  equal([...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => decode(match[1])), [settings.siteUrl + "/", settings.siteUrl + "/play", settings.siteUrl + "/shop"], "sitemap has exactly the three public pages");
  check(!/account|admin|checkout|downloads|api\//.test(sitemap), "sitemap excludes all private and non-page paths");
  check(robots.includes("Allow: /") && !robots.includes("Disallow: /\n"), "robots allows crawlers to read noindex HTML");
  check(robots.includes("Disallow: /api/") && robots.includes("Disallow: /downloads/"), "robots excludes APIs and downloads");
  settings.pages.play.indexable = false; settings.revision++;
  await checkPublic("/play", "play"); sitemap = await get("/sitemap.xml");
  check(!sitemap.includes("/play</loc>"), "per-page noindex immediately removes sitemap entry");
  settings.indexingEnabled = false; settings.revision++;
  await checkPublic("/", "home"); equal((await get("/sitemap.xml")).match(/<loc>/g), null, "global noindex empties sitemap");
  robots = await get("/robots.txt"); check(!robots.includes("Disallow: /\n") && !robots.includes("Sitemap:"), "global noindex still permits HTML crawling");
  settings.indexingEnabled = true; settings.defaultTitle = "새 제목 · 저장 즉시 반영"; settings.googleVerification = "Changed_google"; settings.naverVerification = "Changed_naver"; settings.revision++;
  await checkPublic("/", "home");
  const configuredOrigin = settings.siteUrl; settings.siteUrl = "";
  equal(canonical((await page("/")).head), ["https://deployment.example.test/"], "runtime blank site URL uses deployment origin");
  settings.siteUrl = "https://127.0.0.1";
  equal(canonical((await page("/")).head), ["https://deployment.example.test/"], "invalid loopback configuration falls back to trusted deployment origin"); check(!(await get("/sitemap.xml")).includes("127.0.0.1"), "loopback never appears in sitemap");
  settings.siteUrl = configuredOrigin;
  for (behavior of ["failure", "invalid", "disconnect", "redirect"]) {
    const { head } = await page("/"); equal(decode(head.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? ""), schema.defaultSeoConfig.defaultTitle, `${behavior}: backend outage falls back safely`);
  }
  if (fakeFailure) throw fakeFailure;
  console.log(`SEO metadata: ${checks} checks passed against real initial HTML, robots and sitemap. No user data or external services used.`);
} finally { await cleanup(); }
