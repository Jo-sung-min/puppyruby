import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

// Executes the real Windows client against a disposable frontend, dropping an
// already-committed action response. No real user settings or credentials are read.
assert.ok(process.env.PUPPY_TEST_ISOLATED === "1" || process.argv.includes("--isolated"),
  "Use PUPPY_TEST_ISOLATED=1 or --isolated with a disposable local database.");
assert.equal(process.platform, "win32", "This test runs the actual Windows PuppyRuby.exe.");
const target = new URL(process.env.PUPPY_TEST_URL || "http://127.0.0.1:3101");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(target.hostname)
  && ["http:", "https:"].includes(target.protocol) && !target.username && !target.password
  && target.pathname === "/" && !target.search && !target.hash, "Use a disposable loopback origin.");
assert.notEqual(target.port, "3102", "Port3102 is reserved for the owned fault proxy.");
const origin = target.origin;
const proxyOrigin = "http://127.0.0.1:3102";
const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const executable = resolve(project, "desktop/dist/PuppyRuby.exe");
const buildRoot = resolve(project, "desktop/build");
await access(executable);
await mkdir(buildRoot, { recursive: true });
const outputRoot = await mkdtemp(join(buildRoot, "retry-test-"));
const resolvedOutput = await realpath(outputRoot);
const resolvedBuild = await realpath(buildRoot);
assert.ok(resolvedOutput.startsWith(resolvedBuild + sep), "Test cleanup must stay under desktop/build.");

let checks = 0;
let active = null;
let native = null;
let nativeChecks = 0;
const fixtures = [];
const reports = [];
function check(condition, message) { assert.ok(condition, message); checks++; }
function equal(actual, expected, message) { assert.deepEqual(actual, expected, message); checks++; }
function browser() {
  let cookie = "";
  return {
    get cookie() { return cookie; },
    async call(path, body) {
      const response = await fetch(origin + path, {
        method: body === undefined ? "GET" : "POST", headers: { "Content-Type": "application/json", Cookie: cookie, Origin: origin },
        body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual", signal: AbortSignal.timeout(15000),
      });
      const set = response.headers.get("set-cookie"); if (set) cookie = set.split(";")[0];
      assert.equal(response.status, 200, `Fixture ${path} returned HTTP ${response.status}`);
      return response.json();
    },
  };
}

const allowed = new Set(["/api/desktop/pair", "/api/desktop/state", "/api/desktop/action", "/api/game/select"]);
const proxy = createServer(async (request, response) => {
  try {
    assert.ok(active && allowed.has(request.url), "Unexpected native fault-proxy request.");
    const chunks = []; let length = 0;
    for await (const chunk of request) {
      length += chunk.length; assert.ok(length <= 8192, "Oversized native test request."); chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);
    const headers = { "Content-Type": "application/json" };
    if (request.headers.authorization) headers.Authorization = request.headers.authorization;
    if (request.headers.cookie) headers.Cookie = request.headers.cookie;
    const upstream = await fetch(origin + request.url, {
      method: request.method, headers, body: body.length ? body : undefined,
      redirect: "manual", signal: AbortSignal.timeout(15000),
    });
    const bytes = Buffer.from(await upstream.arrayBuffer());
    let clientStatus = upstream.status;
    if (request.url === "/api/desktop/action") {
      const action = JSON.parse(body.toString("utf8"));
      const record = { action, upstreamStatus: upstream.status, clientStatus: upstream.status };
      active.actions.push(record);
      if (!active.injected) {
        assert.equal(action.action, "feed", "Only the first intended care action loses its reply.");
        assert.equal(upstream.status, 200, "The first action must commit before the injected failure.");
        const committed = JSON.parse(bytes.toString("utf8"));
        equal(committed.state.puppy.xp, 10, "Upstream committed exactly one feed reward before the lost response");
        active.injected = true; record.clientStatus = 503;
        response.writeHead(503, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        response.end(JSON.stringify({ message: "검증용: 저장은 완료했지만 응답을 전달하지 못했어요." }));
        return;
      }
    }
    response.writeHead(clientStatus, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    response.end(bytes);
  } catch (error) {
    if (active) active.proxyError = error;
    if (!response.headersSent) response.writeHead(502, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    response.end(JSON.stringify({ message: "검증용 프록시 요청을 처리하지 못했어요." }));
  }
});

async function runNative(configuration, reportPath) {
  const exitCode = await new Promise((resolveExit, reject) => {
    native = spawn(executable, ["--sync-test", configuration], { cwd: project, windowsHide: true, stdio: "ignore" });
    const timeout = setTimeout(() => { native?.kill(); reject(new Error("Native retry scenario exceeded45seconds.")); }, 45000);
    native.once("error", error => { clearTimeout(timeout); native = null; reject(error); });
    native.once("exit", code => { clearTimeout(timeout); native = null; resolveExit(code); });
  });
  const report = await readFile(reportPath, "utf8");
  assert.equal(exitCode, 0, `Native scenario failed:\n${report}`);
  check(!report.includes("FAIL "), "Native scenario completed without failures");
  nativeChecks += report.split(/\r?\n/).filter(line => line.startsWith("PASS ")).length;
  reports.push(report);
}

async function scenario(selectionChanges) {
  const web = browser(); fixtures.push(web);
  const initial = await web.call("/api/game");
  const first = initial.puppies.find(puppy => puppy.id === initial.selectedId);
  equal(first.xp, 0, "Fresh disposable puppy starts with no experience");
  let second;
  if (selectionChanges) {
    const adoption = await web.call("/api/game/adopt", {});
    second = adoption.state.puppies.find(puppy => puppy.id === adoption.newPuppyId);
    await web.call("/api/game/rename", { puppyId: second.id, value: "변경된친구" });
    await web.call("/api/game/select", { puppyId: first.id });
  }
  const pairing = await web.call("/api/desktop/pair-code", {});
  const label = selectionChanges ? "selection-change" : "same-puppy";
  const directory = join(outputRoot, label); await mkdir(directory);
  const output = join(directory, "native-report.txt");
  const steps = [
    { op: "action-error", action: "feed", expectedStatus: 503, expectedLinked: true, expectedOnline: false, expectedPending: true, expectedXp: 0 },
    { op: "restart", expectedLinked: true, expectedOnline: false, expectedPending: true, expectedXp: 0 },
    { op: "poll", expectedOnline: true, expectedPending: true, expectedXp: 10 },
    { op: "action-error", action: "play", expectedPending: true, expectedXp: 10 },
  ];
  if (selectionChanges) {
    steps.push(
      { op: "browser", path: "/api/game/select", body: { puppyId: second.id } },
      { op: "action-error", action: "feed", expectedStatus: 409, expectedOnline: true, expectedPending: false, expectedName: "변경된친구", expectedXp: 0 },
      { op: "action", action: "rest", xpDelta: 5, expectedPending: false },
      { op: "restart", expectedOnline: false, expectedPending: false, expectedName: "변경된친구", expectedXp: 5 },
      { op: "poll", expectedOnline: true, expectedPending: false, expectedXp: 5 },
    );
  } else {
    steps.push(
      { op: "retry", expectedOnline: true, expectedPending: false, expectedXp: 10, xpDelta: 0 },
      { op: "restart", expectedOnline: false, expectedPending: false, expectedXp: 10 },
      { op: "poll", expectedOnline: true, expectedPending: false, expectedXp: 10 },
    );
  }
  const configuration = join(directory, "scenario.json");
  await writeFile(configuration, JSON.stringify({ origin: proxyOrigin, code: pairing.code, browserCookie: web.cookie, output, steps }));
  active = { injected: false, actions: [], proxyError: null };
  await runNative(configuration, output);
  if (active.proxyError) throw active.proxyError;
  check(active.injected, "Fault proxy returned503 only after the server committed care");
  const actions = active.actions;
  equal(actions.length, selectionChanges ? 3 : 2, "Unresolved pending request blocks a different local action without sending it");
  equal(actions[0].action, actions[1].action, "Retry preserves the entire original request and UUID across native restart");
  check(/^[0-9a-f-]{36}$/i.test(actions[0].action.requestId), "Original request uses a UUID");
  equal(actions[0].clientStatus, 503, "First native response was deliberately lost");
  equal(actions[1].upstreamStatus, selectionChanges ? 409 : 200, "Server handles retry with correct selection semantics");
  const final = await web.call("/api/game");
  equal(final.puppies.find(puppy => puppy.id === first.id).xp, 10, "First puppy receives exactly one feed reward");
  equal(final.careCount, selectionChanges ? 2 : 1, "Retries and rejected pending actions never duplicate care rewards");
  if (selectionChanges) {
    equal(actions[2].action.puppyId, second.id, "Only a new explicit action applies to the newly selected puppy");
    check(actions[2].action.requestId !== actions[0].action.requestId, "New intent receives a fresh request UUID");
    equal(final.puppies.find(puppy => puppy.id === second.id).xp, 5, "New puppy receives only its explicit rest reward");
  }
  console.log(`PASS actual native ${label}: committed response loss, persisted pending UUID, safe retry and authoritative rewards.`);
  active = null;
}

let failure;
try {
  await new Promise((ready, reject) => { proxy.once("error", reject); proxy.listen(3102, "127.0.0.1", ready); });
  await scenario(false);
  await scenario(true);
  await writeFile(join(buildRoot, "native-retry-test.txt"), reports.join("\n") + `\nPASS ${checks} proxy/server checks and ${nativeChecks} native assertions.\n`);
} catch (error) { failure = error; }
finally {
  native?.kill();
  for (const web of fixtures) {
    try {
      const links = await web.call("/api/desktop/links");
      for (const device of links.devices) await web.call("/api/desktop/revoke", { deviceId: device.id });
    } catch (error) { failure ||= error; }
  }
  proxy.closeAllConnections();
  await new Promise(done => proxy.close(done));
  const cleanupTarget = await realpath(outputRoot);
  assert.equal(cleanupTarget, resolvedOutput, "Temporary cleanup target must remain the owned test directory.");
  assert.ok(cleanupTarget.startsWith(resolvedBuild + sep), "Temporary cleanup stays inside desktop/build.");
  await rm(cleanupTarget, { recursive: true, force: true });
}
if (failure) throw failure;
console.log(`PASS ${checks} retry proxy/server checks and ${nativeChecks} actual native assertions; temporary credentials/cache removed and test devices revoked.`);
