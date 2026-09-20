import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { createServer, request as httpRequest } from "node:http";
import { createServer as createTcpServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Exercise the real, already-built Next route against a disposable HTTP fake.
// No database, AWS request, real account, or existing application is used.
assert.equal(process.env.PUPPY_TEST_ISOLATED, "1", "Set PUPPY_TEST_ISOLATED=1 to run this isolated test.");
assert.ok(!process.env.PUPPY_TEST_URL || process.env.PUPPY_TEST_URL === "http://127.0.0.1:3101",
  "This test owns only http://127.0.0.1:3101; it cannot target an existing app.");
const origin = "http://127.0.0.1:3101";
const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontend = resolve(project, "frontend");
const serverFile = resolve(frontend, "node_modules/next/dist/bin/next");
await access(serverFile);
const manifest = JSON.parse(await readFile(resolve(frontend, ".next/server/app-paths-manifest.json"), "utf8"));
assert.ok(manifest["/api/media/[[...path]]/route"], "Build the current frontend with /api/media first.");
assert.ok(manifest["/api/admin/seo-media/[[...path]]/route"], "Build the current frontend with the administrator SEO media route first.");
assert.ok(manifest["/api/admin/desktop-release/[[...path]]/route"], "Build the current frontend with the administrator Windows release route first.");

const session = "S".repeat(43);
const forgedSession = "F".repeat(43);
const memberSession = "M".repeat(43);
const player = randomUUID();
const forgedPlayer = randomUUID();
const uploadId = randomUUID();
const checksum = createHash("sha256").update("local media fixture; never uploaded").digest("base64");
const credentialMarker = "FIXTURE-PRIVATE-CREDENTIAL-DO-NOT-ECHO";
const cookie = `puppyruby-session=${session}; puppyruby-player=${player}`;
const forbiddenEchoes = [session, forgedSession, memberSession, player, forgedPlayer, credentialMarker];
const config = { enabled: true, maxBytes: 163840, acceptedTypes: ["image/jpeg", "image/png"] };
// .invalid deliberately cannot represent a real bucket. This URL is never fetched.
const presigned = { uploadId, uploadUrl: "https://fixture-s3.invalid/photo?signature=fixture-only", method: "PUT",
  headers: { "Content-Type": "image/jpeg", "x-amz-checksum-sha256": checksum }, expiresAt: Date.now() + 300000 };
const completed = { photo: `media:${uploadId}`, url: "https://fixture-s3.invalid/photo?view=fixture-only" };
const seoCompleted = { url: "https://fixture-s3.invalid/seo-shares/image.jpg" };
const desktopFiles = [
  { name: "PuppyRuby.exe", size: 1024, sha256: checksum },
  { name: "PuppyRuby-Setup.exe", size: 2048, sha256: checksum },
];
const desktopCurrent = { schemaVersion: 1, version: "0.10.2.0", release: "2222222222222222", publishedAt: "2026-09-21T00:00:00.000Z",
  notes: "현재 Windows 릴리스예요.", installer: { url: "https://cdn.puppyruby.com/site-downloads/2222222222222222/downloads/PuppyRuby-Setup.exe", sha256: "0".repeat(64), size: 2048 } };
const desktopManifest = { ...desktopCurrent, version: "0.10.3.0", release: "3333333333333333", notes: "새 Windows 릴리스예요.",
  installer: { ...desktopCurrent.installer, url: "https://cdn.puppyruby.com/site-downloads/3333333333333333/downloads/PuppyRuby-Setup.exe" } };
const desktopExpiresAt = Date.now() + 300000;
const desktopSignedHeaders = "cache-control;content-disposition;content-length;content-type;host;if-none-match;x-amz-checksum-sha256;x-amz-meta-sha256";
function desktopSignedUrl(name) {
  const date = new Date(desktopExpiresAt - 300000).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const query = new URLSearchParams({ "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `ASIAOFFLINETESTKEY12/${date.slice(0, 8)}/ap-northeast-2/s3/aws4_request`, "X-Amz-Date": date,
    "X-Amz-Expires": "300", "X-Amz-SignedHeaders": desktopSignedHeaders, "X-Amz-Signature": "a".repeat(64) });
  return `https://fatell-aws-s3.s3.ap-northeast-2.amazonaws.com/puppyruby/site-downloads/${desktopManifest.release}/downloads/${name}?${query}`;
}
const desktopHeaders = name => ({ "content-type": "application/vnd.microsoft.portable-executable", "content-disposition": `attachment; filename="${name}"`,
  "cache-control": "public, max-age=31536000, immutable", "if-none-match": "*", "x-amz-checksum-sha256": checksum,
  "x-amz-meta-sha256": createHash("sha256").update("local media fixture; never uploaded").digest("hex") });
const desktopPrepared = { release: desktopManifest.release, uploads: desktopFiles.map(file => ({ name: file.name, required: true,
  uploadUrl: desktopSignedUrl(file.name), method: "PUT", headers: desktopHeaders(file.name), expiresAt: desktopExpiresAt })) };
const upstreamPaths = ["/api/v1/media", "/api/v1/admin/seo-media"].flatMap(base => ["config", "presign", "complete"].map(action => `${base}/${action}`))
  .concat(["/api/v1/admin/desktop-release", "/api/v1/admin/desktop-release/prepare", "/api/v1/admin/desktop-release/complete"]);
const validBody = { contentType: "image/jpeg", size: 1024, sha256: checksum };
let checks = 0;
let requests = [];
let behavior = { type: "normal" };
let fakeError;
let child;
let childExit;
let childError;
let closed = false;
let cleanupPromise;

function check(condition, label) { assert.ok(condition, label); checks++; }
function equal(actual, expected, label) { assert.deepEqual(actual, expected, label); checks++; }
const delay = milliseconds => new Promise(done => setTimeout(done, milliseconds));
async function listen(server, port) {
  await new Promise((done, fail) => { server.once("error", fail); server.listen(port, "127.0.0.1", () => { server.off("error", fail); done(); }); });
}
async function requireFreePort(port) {
  const probe = createTcpServer();
  try { await listen(probe, port); }
  catch { throw new Error(`Port ${port} is occupied; this test never stops an existing server.`); }
  await new Promise(done => probe.close(done));
}

const fake = createServer(async (request, response) => {
  try {
    let bytes = 0;
    const chunks = [];
    for await (const chunk of request) {
      bytes += chunk.length;
      assert.ok(bytes <= 2048, "BFF forwarded an oversized request to the fake backend.");
      chunks.push(chunk);
    }
    const raw = Buffer.concat(chunks).toString("utf8");
    const record = { method: request.method, path: request.url, headers: request.headers, body: raw ? JSON.parse(raw) : null };
    requests.push(record);
    assert.ok(upstreamPaths.includes(request.url),
      "BFF must not follow an upstream redirect or invent an upstream route.");
    if (behavior.type === "disconnect") { request.socket.destroy(); return; }
    if (behavior.type === "redirect") {
      response.writeHead(307, { Location: `http://127.0.0.1:${fake.address().port}/forbidden-redirect` });
      response.end(); return;
    }
    if (behavior.type === "invalid-json") {
      response.writeHead(200, { "Content-Type": "text/html" }); response.end(`<html>${credentialMarker}</html>`); return;
    }
    if (behavior.type === "failure") {
      response.writeHead(behavior.status, { "Content-Type": "application/json", "Set-Cookie": `upstream-secret=${credentialMarker}; Path=/` });
      response.end(JSON.stringify({ message: credentialMarker, token: session, playerId: player, stack: forgedSession })); return;
    }
    const admin = request.url.startsWith("/api/v1/admin/seo-media/") || request.url.startsWith("/api/v1/admin/desktop-release");
    if (admin && request.headers["x-session-token"] === memberSession) {
      response.writeHead(403, { "Content-Type": "application/json" }); response.end(JSON.stringify({ message: credentialMarker })); return;
    }
    if ((request.method === "POST" || admin) && request.headers["x-session-token"] !== session) {
      response.writeHead(401, { "Content-Type": "application/json" }); response.end(JSON.stringify({ message: credentialMarker })); return;
    }
    response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" });
    const value = request.url === "/api/v1/admin/desktop-release" ? { enabled: true, current: desktopCurrent }
      : request.url.endsWith("/desktop-release/prepare") ? desktopPrepared
        : request.url.endsWith("/desktop-release/complete") ? desktopManifest
          : request.url.endsWith("/config") ? config : request.url.endsWith("/presign") ? presigned : admin ? seoCompleted : completed;
    response.end(JSON.stringify(value));
  } catch (error) {
    fakeError = error;
    if (!response.headersSent) response.writeHead(500, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ message: "Fixture validation failed" }));
  }
});

async function cleanup() {
  if (cleanupPromise) return cleanupPromise;
  cleanupPromise = (async () => {
    closed = true;
    if (child && child.exitCode === null && child.signalCode === null) {
      const exit = new Promise(done => child.once("exit", done));
      child.kill();
      await Promise.race([exit, delay(3000)]);
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL"); await Promise.race([exit, delay(3000)]);
      }
    }
    if (fake.listening) { fake.closeAllConnections(); await new Promise(done => fake.close(done)); }
  })();
  return cleanupPromise;
}
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { void cleanup().finally(() => process.exit(130)); });

function privacy(result, label) {
  check(/(?:^|,)\s*private(?:,|$)/i.test(result.headers.get("cache-control") || ""), `${label}: cache is private`);
  check(/(?:^|,)\s*no-store(?:,|$)/i.test(result.headers.get("cache-control") || ""), `${label}: response is not cached`);
  check((result.headers.get("vary") || "").toLowerCase().split(/\s*,\s*/).includes("cookie"), `${label}: varies by cookie`);
  equal(result.headers.get("referrer-policy"), "no-referrer", `${label}: no referrer leakage`);
  const exposed = result.text + [...result.headers.entries()].map(([key, value]) => `${key}:${value}`).join("\n");
  check(forbiddenEchoes.every(value => !exposed.includes(value)), `${label}: credentials and private identities are not echoed`);
}

async function call(path, options = {}) {
  assert.ok((path.startsWith("/api/media") || path.startsWith("/api/admin/seo-media") || path.startsWith("/api/admin/desktop-release"))
    && !path.includes("://"), "Only local upload BFF paths may be requested.");
  const method = options.method || "GET";
  const headers = new Headers(options.headers);
  if (options.auth !== false) headers.set("Cookie", options.cookie ?? cookie);
  if (method === "POST") {
    if (!Object.hasOwn(options, "origin")) headers.set("Origin", origin);
    else if (options.origin !== null) headers.set("Origin", options.origin);
    if (!Object.hasOwn(options, "contentType")) headers.set("Content-Type", "application/json");
    else if (options.contentType !== null) headers.set("Content-Type", options.contentType);
  }
  const body = options.raw ?? (options.body === undefined ? undefined : JSON.stringify(options.body));
  let response;
  if (options.chunked) {
    // Use native HTTP so no Content-Length is supplied and UTF-8 bytes span reads.
    response = await new Promise((done, fail) => {
      const request = httpRequest(origin + path, { method, headers: Object.fromEntries(headers), agent: false }, incoming => {
        const chunks = [];
        incoming.on("data", chunk => chunks.push(chunk));
        incoming.on("error", fail);
        incoming.on("end", () => {
          const responseHeaders = new Headers();
          for (const [name, value] of Object.entries(incoming.headers)) {
            for (const item of Array.isArray(value) ? value : [value]) if (item !== undefined) responseHeaders.append(name, item);
          }
          done({ status: incoming.statusCode, headers: responseHeaders, text: Buffer.concat(chunks).toString("utf8") });
        });
      });
      request.on("error", fail);
      request.setTimeout(12000, () => request.destroy(new Error("Local chunked request timed out")));
      const data = Buffer.from(body || "");
      request.write(data.subarray(0, 31));
      setImmediate(() => { request.write(data.subarray(31, 700)); setImmediate(() => request.end(data.subarray(700))); });
    });
  } else {
    const fetched = await fetch(origin + path, { method, headers, body, redirect: "manual", signal: AbortSignal.timeout(12000) });
    response = { status: fetched.status, headers: fetched.headers, text: await fetched.text() };
  }
  try { response.json = JSON.parse(response.text); } catch { response.json = null; }
  return response;
}

async function rejected(label, path, options, expectedStatus) {
  const before = requests.length;
  const result = await call(path, options);
  equal(result.status, expectedStatus, label);
  equal(requests.length, before, `${label}: never reaches backend`);
  equal(Object.keys(result.json || {}), ["message"], `${label}: safe error shape`);
  privacy(result, label);
  return result;
}

async function accepted(label, path, options, expected) {
  const before = requests.length;
  const result = await call(path, options);
  equal(result.status, 200, label);
  equal(requests.length, before + 1, `${label}: exactly one backend request`);
  equal(result.json, expected, `${label}: contract preserved`);
  privacy(result, label);
  check(!result.headers.has("set-cookie"), `${label}: no new credentials issued`);
  return requests.at(-1);
}

try {
  await requireFreePort(3101);
  await listen(fake, 0);
  const apiOrigin = `http://127.0.0.1:${fake.address().port}`;
  const childEnv = { ...process.env, API_URL: apiOrigin, PORT: "3101", HOSTNAME: "127.0.0.1",
    NODE_ENV: "production", PUBLIC_SITE_URL: origin, NEXT_TELEMETRY_DISABLED: "1" };
  for (const key of Object.keys(childEnv)) if (/^(AWS_|TOSS_|MAIL_|KAKAO_)/.test(key)) delete childEnv[key];
  child = spawn(process.execPath, [serverFile, "start", "--port", "3101", "--hostname", "127.0.0.1"],
    { cwd: frontend, env: childEnv, windowsHide: true, stdio: "ignore" });
  child.once("error", error => { childError = error; });
  child.once("exit", code => { childExit = code; });
  const startupDeadline = Date.now() + 30000;
  let ready = false;
  while (!ready && Date.now() < startupDeadline) {
    assert.ok(!childError && childExit === undefined, "Owned Next server could not start; build the frontend and free port3101.");
    try {
      const result = await call("/api/media/config", { auth: false });
      ready = result.status === 200 && result.json?.maxBytes === config.maxBytes && requests.length > 0;
    } catch { /* Wait only for our own server to finish starting. */ }
    if (!ready) await delay(150);
  }
  check(ready, "Built Next media route started against the owned fake backend");
  requests = [];

  const forgedHeaders = { "X-Session-Token": forgedSession, "X-Player-Id": forgedPlayer,
    Authorization: `Bearer ${credentialMarker}`, "X-Amz-Security-Token": credentialMarker, "X-Forwarded-For": "203.0.113.3" };
  const publicCall = await accepted("Public config strips all identity", "/api/media/config", { headers: forgedHeaders }, config);
  for (const key of ["x-session-token", "x-player-id", "cookie", "authorization", "x-amz-security-token", "x-forwarded-for"]) {
    check(!publicCall.headers[key], `Public config excludes ${key}`);
  }
  equal(publicCall.method, "GET", "Config uses upstream GET");
  equal(publicCall.body, null, "Config has no upstream body");
  await accepted("Guest config is public", "/api/media/config", { auth: false }, config);

  for (const path of ["/api/media", "/api/media/presign", "/api/media/complete", "/api/media/unknown", "/api/media/config/extra"]) {
    await rejected(`GET allowlist ${path}`, path, {}, 404);
  }
  for (const path of ["/api/media/config", "/api/media", "/api/media/unknown", "/api/media/presign/extra"]) {
    await rejected(`POST allowlist ${path}`, path, { method: "POST", body: {} }, 404);
  }
  for (const method of ["PUT", "DELETE", "PATCH"]) {
    const before = requests.length;
    equal((await call("/api/media/config", { method })).status, 405, `${method} is unavailable`);
    equal(requests.length, before, `${method} never reaches backend`);
  }
  for (const path of ["/api/media/presign", "/api/media/complete"]) {
    await rejected("Anonymous POST requires cookie session", path, { method: "POST", auth: false, headers: forgedHeaders, body: validBody }, 401);
  }
  await rejected("Session check precedes body parsing", "/api/media/presign", { method: "POST", auth: false, raw: "x".repeat(4096) }, 401);
  await rejected("Empty cookie cannot log in", "/api/media/presign", { method: "POST", cookie: "puppyruby-session=", body: validBody }, 401);
  for (const badOrigin of [null, "null", "https://evil.invalid", "http://localhost:3101", "http://127.0.0.1:3102", origin + "/", origin + "/path"]) {
    await rejected("POST enforces exact browser origin", "/api/media/presign", { method: "POST", origin: badOrigin, body: validBody }, 403);
  }
  await rejected("Cross-site Fetch Metadata is denied", "/api/media/presign", {
    method: "POST", headers: { "Sec-Fetch-Site": "cross-site" }, body: validBody }, 403);
  await rejected("Origin check precedes session check", "/api/media/presign", { method: "POST", auth: false, origin: null, body: validBody }, 403);

  const privateCall = await accepted("Cookie session alone reaches upstream", "/api/media/presign", {
    method: "POST", headers: forgedHeaders, body: validBody }, presigned);
  equal(privateCall.headers["x-session-token"], session, "Session header comes only from cookie");
  equal(privateCall.headers["x-player-id"], player, "Player header comes only from cookie");
  for (const key of ["cookie", "authorization", "x-amz-security-token", "x-forwarded-for", "origin"]) check(!privateCall.headers[key], `Private upstream excludes ${key}`);
  equal(privateCall.headers["content-type"], "application/json", "Upstream uses canonical JSON type");
  equal(privateCall.body, validBody, "Only validated body reaches upstream");
  await accepted("Complete returns opaque media reference", "/api/media/complete", { method: "POST", body: { uploadId } }, completed);
  await accepted("UUID matching is case insensitive", "/api/media/complete", { method: "POST", body: { uploadId: uploadId.toUpperCase() } }, completed);
  for (const body of [{ ...validBody, size: 1 }, { ...validBody, size: 10 * 1024 * 1024 }, { ...validBody, contentType: "image/png" }]) {
    await accepted("Valid image metadata bounds", "/api/media/presign", { method: "POST", body }, presigned);
  }
  for (const contentType of ["application/json; charset=utf-8", "Application/JSON", "application/json ; charset=UTF-8"]) {
    await accepted("Exact JSON media type permits charset", "/api/media/presign", { method: "POST", contentType, body: validBody }, presigned);
  }
  for (const contentType of [null, "text/plain", "image/jpeg", "application/jsonp", "application/json-evil", "application/ld+json"]) {
    await rejected("Non-JSON media type rejected", "/api/media/presign", { method: "POST", contentType, body: validBody }, 400);
  }
  const invalidBodies = [null, [], "text", 1, true, {}, { ...validBody, extra: true }, { size: 1, sha256: checksum },
    { ...validBody, contentType: null }, { ...validBody, contentType: "image/svg+xml" }, { ...validBody, contentType: "image/webp" },
    { ...validBody, contentType: "IMAGE/JPEG" }, { ...validBody, size: 0 }, { ...validBody, size: -1 }, { ...validBody, size: 1.5 },
    { ...validBody, size: "1024" }, { ...validBody, size: true }, { ...validBody, size: 10 * 1024 * 1024 + 1 },
    { ...validBody, size: Number.MAX_SAFE_INTEGER + 1 }, { ...validBody, sha256: null }, { ...validBody, sha256: checksum.slice(1) },
    { ...validBody, sha256: "a".repeat(64) }, { ...validBody, sha256: checksum.replace(/=$/, "?") }];
  for (const body of invalidBodies) await rejected("Malformed presign metadata rejected", "/api/media/presign", { method: "POST", body }, 400);
  for (const raw of ["", "{", "null", "[]", `{"contentType":"image/jpeg","size":1,"sha256":"${checksum}","__proto__":{}}`]) {
    await rejected("Malformed raw JSON rejected", "/api/media/presign", { method: "POST", raw }, 400);
  }
  for (const body of [null, [], {}, { uploadId: null }, { uploadId: 3 }, { uploadId: "not-a-uuid" }, { uploadId, extra: true }]) {
    await rejected("Malformed complete metadata rejected", "/api/media/complete", { method: "POST", body }, 400);
  }
  const padded = JSON.stringify(validBody).padEnd(1024, " ");
  for (const chunked of [false, true]) {
    await accepted("Exactly1024-byte JSON accepted", "/api/media/presign", { method: "POST", raw: padded, chunked }, presigned);
    await rejected("1025-byte JSON rejected", "/api/media/presign", { method: "POST", raw: padded + " ", chunked }, 400);
  }
  await rejected("UTF-8 limit counts bytes", "/api/media/presign", {
    method: "POST", raw: JSON.stringify({ ...validBody, extra: "멍".repeat(350) }), chunked: true }, 400);

  const malformedCookie = await call("/api/media/presign", {
    method: "POST", cookie: `puppyruby-session=malformed; puppyruby-player=${player}`, body: validBody });
  equal(malformedCookie.status, 401, "Malformed session fails upstream authentication");
  equal(requests.at(-1).headers["x-session-token"], "invalid", "Malformed cookie normalized before upstream");
  privacy(malformedCookie, "Malformed session");
  const invalidPlayerCall = await accepted("Invalid guest cookie is replaced for upstream", "/api/media/presign", {
    method: "POST", cookie: `puppyruby-session=${session}; puppyruby-player=bad`, headers: forgedHeaders, body: validBody }, presigned);
  check(/^[0-9a-f-]{36}$/.test(invalidPlayerCall.headers["x-player-id"]), "Invalid guest cookie generates a new UUID");
  check(invalidPlayerCall.headers["x-player-id"] !== forgedPlayer, "Browser player header cannot replace invalid cookie");

  for (const status of [400, 401, 403, 409, 413, 422, 429, 500, 503]) {
    behavior = { type: "failure", status };
    const result = await call("/api/media/presign", { method: "POST", body: validBody });
    equal(result.status, status, "Upstream failure preserves HTTP status");
    equal(Object.keys(result.json || {}), ["message"], "Upstream error body is replaced");
    check(typeof result.json.message === "string" && result.json.message.length > 0, "Upstream failure has a safe display message");
    privacy(result, `Upstream${status}`);
    const setCookie = result.headers.get("set-cookie") || "";
    check(!setCookie.includes("upstream-secret"), "Upstream Set-Cookie is never passed through");
    if (status === 401) {
      check(/puppyruby-session=;[^,]*Max-Age=0/i.test(setCookie), "Unauthorized POST clears session cookie");
      check(/puppyruby-player=[0-9a-f-]{36}/i.test(setCookie), "Unauthorized POST rotates guest identity");
      check(/HttpOnly/i.test(setCookie) && /SameSite=lax/i.test(setCookie), "Cleared and rotated cookies retain security attributes");
    } else check(!setCookie, "Other backend errors leave cookie untouched");
  }
  behavior = { type: "failure", status: 401 };
  const publicFailure = await call("/api/media/config");
  equal(publicFailure.status, 401, "Public backend error is handled");
  privacy(publicFailure, "Public upstream401");
  check(!publicFailure.headers.has("set-cookie"), "Public config cannot clear a logged-in session");
  for (const type of ["invalid-json", "redirect", "disconnect"]) {
    behavior = { type };
    const before = requests.length;
    const result = await call("/api/media/presign", { method: "POST", body: validBody });
    equal(result.status, 503, `${type} becomes safe unavailable error`);
    equal(requests.length, before + 1, `${type} performs no follow-up request`);
    equal(Object.keys(result.json || {}), ["message"], `${type} has safe error shape`);
    privacy(result, type);
  }
  behavior = { type: "normal" };
  await accepted("Route recovers after upstream failures", "/api/media/complete", { method: "POST", body: { uploadId } }, completed);

  const seoBase = "/api/admin/seo-media";
  for (const action of ["config", "presign", "complete"]) {
    const options = action === "config" ? {} : { method: "POST", body: action === "presign" ? validBody : { uploadId } };
    await rejected(`SEO ${action} requires cookie authentication`, `${seoBase}/${action}`, { ...options, auth: false, headers: forgedHeaders }, 401);
    const before = requests.length;
    const denied = await call(`${seoBase}/${action}`, { ...options, cookie: `puppyruby-session=${memberSession}; puppyruby-player=${player}`, headers: { ...forgedHeaders, "X-Role": "ADMIN" } });
    equal(denied.status, 403, `SEO ${action} preserves backend administrator denial`);
    equal(requests.length, before + 1, `SEO ${action} delegates role authorization to backend`);
    equal(requests.at(-1).headers["x-session-token"], memberSession, `SEO ${action} cannot forge administrator token`);
    check(!requests.at(-1).headers["x-role"], `SEO ${action} ignores browser role header`);
    privacy(denied, `SEO ${action} member denial`);
    check(!denied.headers.has("set-cookie"), `SEO ${action} does not log out non-admin member`);
    const allowed = await accepted(`SEO ${action} administrator route`, `${seoBase}/${action}`, { ...options, headers: forgedHeaders },
      action === "config" ? config : action === "presign" ? presigned : seoCompleted);
    equal(allowed.path, `/api/v1/admin/seo-media/${action}`, `SEO ${action} uses purpose-specific upstream`);
    equal(allowed.headers["x-session-token"], session, `SEO ${action} forwards cookie session only`);
    for (const key of ["authorization", "cookie", "x-amz-security-token"]) check(!allowed.headers[key], `SEO ${action} excludes ${key}`);
  }
  for (const [path, method] of [[seoBase, "GET"], [`${seoBase}/presign`, "GET"], [`${seoBase}/config`, "POST"], [`${seoBase}/complete/extra`, "POST"]]) {
    await rejected("SEO route allowlist", path, { method, ...(method === "POST" ? { body: {} } : {}) }, 404);
  }
  for (const action of ["presign", "complete"]) {
    const body = action === "presign" ? validBody : { uploadId };
    for (const invalidOrigin of [null, "https://evil.invalid", "http://localhost:3101"]) {
      await rejected("SEO write enforces exact origin", `${seoBase}/${action}`, { method: "POST", body, origin: invalidOrigin }, 403);
    }
    await rejected("SEO write rejects JSON suffix MIME", `${seoBase}/${action}`, { method: "POST", body, contentType: "application/jsonp" }, 400);
    await rejected("SEO write rejects extra metadata", `${seoBase}/${action}`, { method: "POST", body: { ...body, role: "ADMIN" } }, 400);
  }
  for (const body of [{ ...validBody, size: 5 * 1024 * 1024 + 1 }, { ...validBody, size: "1024" }, { ...validBody, contentType: "image/svg+xml" }, { ...validBody, sha256: "bad" }]) {
    await rejected("SEO presign rejects unsafe metadata", `${seoBase}/presign`, { method: "POST", body }, 400);
  }
  await accepted("SEO accepts bounded chunked JSON", `${seoBase}/presign`, { method: "POST", raw: padded, chunked: true }, presigned);
  await rejected("SEO rejects oversized chunked JSON", `${seoBase}/presign`, { method: "POST", raw: padded + " ", chunked: true }, 400);
  for (const action of ["config", "presign", "complete"]) for (const status of [401, 403, 429, 503]) {
    behavior = { type: "failure", status };
    const result = await call(`${seoBase}/${action}`, action === "config" ? {} : { method: "POST", body: action === "presign" ? validBody : { uploadId } });
    equal(result.status, status, `SEO ${action} preserves HTTP${status}`);
    equal(Object.keys(result.json || {}), ["message"], `SEO ${action} replaces upstream error body`);
    privacy(result, `SEO ${action} HTTP${status}`);
    const setCookie = result.headers.get("set-cookie") || "";
    check(!setCookie.includes("upstream-secret"), "SEO never forwards upstream cookie");
    if (status === 401) {
      check(/puppyruby-session=;[^,]*Max-Age=0/i.test(setCookie), `SEO ${action} clears expired session`);
      check(/puppyruby-player=[0-9a-f-]{36}/i.test(setCookie), `SEO ${action} rotates guest identity`);
    } else check(!setCookie, `SEO ${action} keeps unrelated failures from changing session`);
  }

  behavior = { type: "normal" };
  const desktopBase = "/api/admin/desktop-release";
  const desktopPrepareBody = { version: desktopManifest.version, notes: desktopManifest.notes, files: desktopFiles };
  const desktopCompleteBody = { ...desktopPrepareBody, release: desktopManifest.release };
  await rejected("Desktop release read requires cookie authentication", desktopBase, { auth: false, headers: forgedHeaders }, 401);
  await rejected("Desktop release write requires cookie authentication", `${desktopBase}/prepare`, {
    method: "POST", auth: false, headers: forgedHeaders, body: desktopPrepareBody }, 401);
  const memberBefore = requests.length;
  const memberDenied = await call(desktopBase, { cookie: `puppyruby-session=${memberSession}; puppyruby-player=${player}`,
    headers: { ...forgedHeaders, "X-Role": "ADMIN" } });
  equal(memberDenied.status, 403, "Desktop release preserves backend member denial");
  equal(requests.length, memberBefore + 1, "Desktop release delegates administrator role to backend");
  equal(requests.at(-1).headers["x-session-token"], memberSession, "Desktop release forwards the member cookie session");
  check(!requests.at(-1).headers["x-role"], "Desktop release ignores forged administrator role");
  privacy(memberDenied, "Desktop release member denial");

  const releaseRead = await accepted("Desktop release current manifest", desktopBase, { headers: { ...forgedHeaders, "X-Role": "ADMIN" } },
    { enabled: true, current: desktopCurrent });
  equal(releaseRead.path, "/api/v1/admin/desktop-release", "Desktop release uses its scoped upstream");
  equal(releaseRead.headers["x-session-token"], session, "Desktop release session comes only from cookie");
  for (const key of ["authorization", "cookie", "x-amz-security-token", "x-role", "x-forwarded-for"]) {
    check(!releaseRead.headers[key], `Desktop release excludes forged ${key}`);
  }
  await rejected("Desktop release cross-site read is denied", desktopBase, { headers: { "Sec-Fetch-Site": "cross-site" } }, 403);

  for (const path of [`${desktopBase}/prepare`, `${desktopBase}/complete`, `${desktopBase}/unknown`, `${desktopBase}/prepare/extra`]) {
    await rejected("Desktop release GET allowlist", path, {}, 404);
  }
  for (const path of [desktopBase, `${desktopBase}/unknown`, `${desktopBase}/prepare/extra`]) {
    await rejected("Desktop release POST allowlist", path, { method: "POST", body: desktopPrepareBody }, 404);
  }
  for (const invalidOrigin of [null, "null", "https://evil.invalid", "http://localhost:3101", origin + "/path"]) {
    await rejected("Desktop release write enforces exact origin", `${desktopBase}/prepare`, {
      method: "POST", origin: invalidOrigin, body: desktopPrepareBody }, 403);
  }
  for (const contentType of [null, "text/plain", "application/jsonp", "application/ld+json"]) {
    await rejected("Desktop release accepts JSON only", `${desktopBase}/prepare`, {
      method: "POST", contentType, body: desktopPrepareBody }, 400);
  }
  const preparedCall = await accepted("Desktop release prepare forwards bounded metadata", `${desktopBase}/prepare`, {
    method: "POST", headers: forgedHeaders, body: desktopPrepareBody }, desktopPrepared);
  equal(preparedCall.body, desktopPrepareBody, "Desktop prepare forwards only the validated contract");
  for (const key of ["authorization", "cookie", "x-amz-security-token", "x-role", "x-forwarded-for", "origin"]) {
    check(!preparedCall.headers[key], `Desktop prepare excludes forged ${key}`);
  }
  await accepted("Desktop release complete returns verified manifest", `${desktopBase}/complete`, {
    method: "POST", body: desktopCompleteBody }, desktopManifest);
  for (const body of [{ ...desktopPrepareBody, role: "ADMIN" }, { ...desktopPrepareBody, files: desktopFiles.slice(0, 1) },
    { ...desktopPrepareBody, version: "0.10.3" }, { ...desktopPrepareBody, notes: "<secret>" },
    { ...desktopPrepareBody, files: desktopFiles.map((file, index) => index ? file : { ...file, sha256: "bad" }) }]) {
    await rejected("Desktop release rejects malformed metadata", `${desktopBase}/prepare`, { method: "POST", body }, 400);
  }
  const desktopRaw = JSON.stringify(desktopPrepareBody);
  const desktopPadded = desktopRaw + " ".repeat(4096 - Buffer.byteLength(desktopRaw));
  await accepted("Desktop release accepts exactly 4KB JSON", `${desktopBase}/prepare`, {
    method: "POST", raw: desktopPadded, chunked: true }, desktopPrepared);
  await rejected("Desktop release never proxies oversized JSON", `${desktopBase}/prepare`, {
    method: "POST", raw: desktopPadded + " ", chunked: true }, 400);

  behavior = { type: "redirect" };
  const beforeRedirect = requests.length;
  const seoRedirect = await call(`${seoBase}/complete`, { method: "POST", body: { uploadId } });
  equal(seoRedirect.status, 503, "SEO backend redirects are blocked");
  equal(requests.length, beforeRedirect + 1, "SEO backend redirects are not followed");
  privacy(seoRedirect, "SEO backend redirect");
  check(!fakeError, "Every fake-backend request stayed within the media contract");
  check(requests.every(item => upstreamPaths.includes(item.path)), "All upstream requests stayed local and scoped");
  check(!closed, "Owned test server remained active until checks finished");
} finally {
  await cleanup();
}
await requireFreePort(3101);
check(!fake.listening, "Fake backend was stopped");
check(child?.exitCode !== null || child?.signalCode !== null, "Owned Next server was stopped");
console.log(`PASS media proxy: ${checks} checks; isolated fake backend and Next server cleaned up. No AWS or real application requests.`);
