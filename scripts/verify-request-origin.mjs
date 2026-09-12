import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Node 24+: node scripts/verify-request-origin.mjs
// Uses the actual installed NextRequest and the actual TypeScript helper.
// All requests remain in memory. No network, accounts, or server state.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const requireFrontend = createRequire(join(root, "frontend", "package.json"));
const { NextRequest } = requireFrontend("next/server");
const { requestOrigin, isSameOrigin } = await import(pathToFileURL(join(root, "frontend", "src", "lib", "request-origin.ts")).href);
let checks = 0;

function equal(actual, expected, label) {
  assert.strictEqual(actual, expected, label);
  checks++;
}

function check(condition, label) {
  assert.ok(condition, label);
  checks++;
}

function request(destination, origin = destination, extraHeaders = {}) {
  const headers = new Headers({ host: new URL(destination).host, ...extraHeaders });
  if (origin !== null) headers.set("origin", origin);
  return new NextRequest(`${destination}/api/auth/profile`, { method: "POST", headers });
}

function rejectOrigin(destination, origin, label) {
  const actual = request(destination, origin);
  equal(isSameOrigin(actual, true), false, `${label}: strict origin mode rejects`);
  equal(isSameOrigin(actual, false), false, `${label}: optional origin mode still rejects a supplied invalid origin`);
}

// Reproduce the framework normalization that caused real loopback POSTs to fail.
for (const host of ["127.0.0.1", "[::1]"]) {
  const actualOrigin = `http://${host}:3001`;
  const actual = request(actualOrigin);
  check(actual instanceof NextRequest, "Regression uses the installed NextRequest implementation");
  equal(actual.nextUrl.origin, "http://localhost:3001", `${host}: NextURL actually rewrites the loopback host`);
  equal(actual.headers.get("host"), `${host}:3001`, `${host}: request Host preserves the browser destination`);
  equal(requestOrigin(actual), actualOrigin, `${host}: helper restores the actual destination`);
  equal(isSameOrigin(actual, true), true, `${host}: a real same-origin POST is accepted`);
  equal(isSameOrigin(request(actualOrigin, "http://localhost:3001"), true), false,
    `${host}: normalization must not grant localhost cross-origin access`);
}

// Every distinct alias, port and scheme remains a distinct origin.
const origins = [
  "http://127.0.0.1:3001",
  "http://localhost:3001",
  "http://[::1]:3001",
  "http://127.0.0.1:3101",
  "https://127.0.0.1:3001",
  "https://puppyruby.example",
  "http://puppyruby.example",
  "https://www.puppyruby.example",
  "https://puppyruby.example:8443",
];
for (const destination of origins) {
  equal(requestOrigin(request(destination)), destination, `${destination}: exact request origin`);
  for (const supplied of origins) {
    const actual = request(destination, supplied);
    equal(isSameOrigin(actual, true), supplied === destination, `${destination} vs ${supplied}: strict comparison`);
    equal(isSameOrigin(actual, false), supplied === destination, `${destination} vs ${supplied}: optional comparison`);
  }
}

for (const destination of ["http://127.0.0.1:3001", "https://puppyruby.example"]) {
  equal(isSameOrigin(request(destination, null), false), true, "Missing Origin is allowed only when optional");
  equal(isSameOrigin(request(destination, null), true), false, "Missing Origin is rejected when required");
  equal(isSameOrigin(request(destination, ""), false), true, "An empty Origin is treated as missing in optional mode");
  equal(isSameOrigin(request(destination, ""), true), false, "An empty Origin does not satisfy strict mode");
  for (const supplied of [destination, null]) {
    const crossSite = request(destination, supplied, { "sec-fetch-site": "cross-site" });
    equal(isSameOrigin(crossSite, false), false, "Cross-site fetch metadata rejects even without a required Origin");
    equal(isSameOrigin(crossSite, true), false, "Cross-site fetch metadata rejects even with a matching Origin");
  }
  equal(isSameOrigin(request(destination, destination, { "sec-fetch-site": "same-origin" }), true), true,
    "Matching Origin with same-origin fetch metadata is accepted");
}
rejectOrigin("https://puppyruby.example", "https://www.puppyruby.example", "Subdomain is still cross-origin despite same-site metadata");
equal(isSameOrigin(request("https://puppyruby.example", "https://www.puppyruby.example", { "sec-fetch-site": "same-site" }), true), false,
  "Same-site metadata cannot override a different Origin");

for (const supplied of [
  "null",
  "undefined",
  "not-an-origin",
  "//puppyruby.example",
  "/api/auth/profile",
  "https:",
  "https://",
  "https://puppyruby.example/",
  "https://puppyruby.example/path",
  "https://puppyruby.example?query=1",
  "https://puppyruby.example#fragment",
  "https://user@puppyruby.example",
  "https://user:password@puppyruby.example",
  "https://puppyruby.example@attacker.example",
  "https://puppyruby.example,https://attacker.example",
  "https://puppyruby.example https://attacker.example",
  "https://puppyruby.example\\path",
  "https://puppyruby.example:wrong",
  "https://puppyruby.example:65536",
  "https://puppyruby.example:443",
  "HTTPS://PUPPYRUBY.EXAMPLE",
  "https://::1",
  "data:text/plain,hello",
  "blob:https://puppyruby.example/identifier",
  "file:///",
  "ftp://puppyruby.example",
]) {
  rejectOrigin("https://puppyruby.example", supplied, `Malformed or noncanonical Origin ${JSON.stringify(supplied)}`);
}

// Mutate real request headers after construction so NextURL construction cannot
// reject or repair the hostile value before the helper being tested receives it.
for (const host of [
  "puppyruby.example/path",
  "user@puppyruby.example",
  "puppyruby.example@attacker.example",
  "puppyruby.example\\path",
  "puppy ruby.example",
  "puppy\truby.example",
  "puppyruby.example?query=1",
  "puppyruby.example#fragment",
  "puppyruby.example,attacker.example",
  "puppyruby.example:443, attacker.example",
  "https://puppyruby.example",
  "puppyruby.example:wrong",
  "puppyruby.example:65536",
  "puppyruby.example%2fpath",
  "puppyruby.example%5cpath",
  "puppyruby.example%40attacker.example",
  "::1:3001",
]) {
  const actual = request("https://puppyruby.example");
  actual.headers.set("host", host);
  assert.throws(() => requestOrigin(actual), Error, `Reject hostile Host ${JSON.stringify(host)}`);
  checks++;
  equal(isSameOrigin(actual, true), false, `Host ${JSON.stringify(host)}: strict mode fails closed`);
  equal(isSameOrigin(actual, false), false, `Host ${JSON.stringify(host)}: a matching Origin cannot rescue an invalid Host`);
}

for (const protocol of ["ftp:", "file:"]) {
  const actual = new NextRequest(`${protocol}//puppyruby.example/path`, {
    headers: { host: "puppyruby.example", origin: "https://puppyruby.example" },
  });
  assert.throws(() => requestOrigin(actual), Error, `${protocol}: request protocol is unsupported`);
  checks++;
  equal(isSameOrigin(actual, true), false, `${protocol}: unsupported protocol fails closed`);
}

for (const spoof of ["attacker.example", "127.0.0.1:3101", "puppyruby.example/path"]) {
  const actual = request("http://127.0.0.1:3001", undefined, {
    "x-forwarded-host": spoof,
    "x-forwarded-proto": "https",
    forwarded: `host=${spoof};proto=https`,
  });
  equal(requestOrigin(actual), "http://127.0.0.1:3001", "Forwarded headers do not replace the real Host or protocol");
  equal(isSameOrigin(actual, true), true, "Forwarded Host spoof does not reject a real same-origin request");
}
const spoofedAlias = request("http://localhost:3001", "http://127.0.0.1:3001", { "x-forwarded-host": "127.0.0.1:3001" });
equal(requestOrigin(spoofedAlias), "http://localhost:3001", "X-Forwarded-Host cannot replace localhost with its loopback alias");
equal(isSameOrigin(spoofedAlias, true), false, "X-Forwarded-Host cannot authorize a crossed loopback alias");

// Host case/default port canonicalization and missing-Host fallback remain valid.
const canonical = request("https://puppyruby.example");
canonical.headers.set("host", "PUPPYRUBY.EXAMPLE:443");
equal(requestOrigin(canonical), "https://puppyruby.example", "Canonicalize DNS case and default HTTPS port");
equal(isSameOrigin(canonical, true), true, "A browser's canonical Origin matches an equivalent Host");
const missingHost = request("https://puppyruby.example");
missingHost.headers.delete("host");
equal(requestOrigin(missingHost), "https://puppyruby.example", "Missing Host falls back to the actual NextURL host");
equal(isSameOrigin(missingHost, true), true, "A valid public NextURL fallback still accepts same-origin requests");

console.log(`PASS ${checks} checks: actual NextRequest + frontend/src/lib/request-origin.ts`);
console.log("Reproduced NextURL loopback normalization; 127.0.0.1 and IPv6 POST origins are restored from Host.");
console.log("Aliases, ports, schemes, cross-site metadata, malformed origins/hosts and forwarded-header spoofing verified.");
