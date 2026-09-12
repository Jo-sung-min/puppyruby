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

const session = "S".repeat(43);
const forgedSession = "F".repeat(43);
const player = randomUUID();
const forgedPlayer = randomUUID();
const uploadId = randomUUID();
const checksum = createHash("sha256").update("local media fixture; never uploaded").digest("base64");
const credentialMarker = "FIXTURE-PRIVATE-CREDENTIAL-DO-NOT-ECHO";
const cookie = `puppyruby-session=${session}; puppyruby-player=${player}`;
const forbiddenEchoes = [session, forgedSession, player, forgedPlayer, credentialMarker];
const config = { enabled: true, maxBytes: 163840, acceptedTypes: ["image/jpeg", "image/png"] };
// .invalid deliberately cannot represent a real bucket. This URL is never fetched.
const presigned = { uploadId, uploadUrl: "https://fixture-s3.invalid/photo?signature=fixture-only", method: "PUT",
  headers: { "Content-Type": "image/jpeg", "x-amz-checksum-sha256": checksum }, expiresAt: Date.now() + 300000 };
const completed = { photo: `media:${uploadId}`, url: "https://fixture-s3.invalid/photo?view=fixture-only" };
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
    assert.ok(["/api/v1/media/config", "/api/v1/media/presign", "/api/v1/media/complete"].includes(request.url),
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
    if (request.method === "POST" && request.headers["x-session-token"] !== session) {
      response.writeHead(401, { "Content-Type": "application/json" }); response.end(JSON.stringify({ message: credentialMarker })); return;
    }
    response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" });
    response.end(JSON.stringify(request.url.endsWith("/config") ? config : request.url.endsWith("/presign") ? presigned : completed));
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
  assert.ok(path.startsWith("/api/media") && !path.includes("://"), "Only local media BFF paths may be requested.");
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
  const childEnv = { ...process.env, API_URL: apiOrigin + "/api/v1", PORT: "3101", HOSTNAME: "127.0.0.1",
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
  check(!fakeError, "Every fake-backend request stayed within the media contract");
  check(requests.every(item => item.path.startsWith("/api/v1/media/")), "All upstream requests stayed local and scoped");
  check(!closed, "Owned test server remained active until checks finished");
} finally {
  await cleanup();
}
await requireFreePort(3101);
check(!fake.listening, "Fake backend was stopped");
check(child?.exitCode !== null || child?.signalCode !== null, "Owned Next server was stopped");
console.log(`PASS media proxy: ${checks} checks; isolated fake backend and Next server cleaned up. No AWS or real application requests.`);
