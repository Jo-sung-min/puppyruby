import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

// This script creates only disposable local test accounts and changes only their isolated server.
if (process.env.PUPPY_TEST_ISOLATED !== "1") throw new Error("Set PUPPY_TEST_ISOLATED=1 for the disposable appearance verifier.");
const base = "http://127.0.0.1:3101";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = JSON.parse(await readFile(path.join(root, "backend/build/account-fixture.json"), "utf8"));
const mailbox = new URL(fixture.httpUrl);
assert.equal(mailbox.hostname, "127.0.0.1"); assert.equal(mailbox.protocol, "http:");
assert.match(fixture.readToken, /^[A-Za-z0-9_-]{43}$/);
const password = "Puppy-Style-Test-2026!";
const adminEmail = "admin@puppyruby.test";
const memberEmail = `styles-${randomUUID().slice(0, 8)}@puppyruby.test`;
const styles = ["classic", "round", "mochi", "chibi", "bean", "plush", "storybook", "bold", "retro", "mini", "sticker", "soft", "fluffy", "pocket", "cookie", "badge"];
let checks = 0;
function check(condition, label) { assert.ok(condition, label); checks++; }
function equal(actual, expected, label) { assert.deepEqual(actual, expected, label); checks++; }
function person() {
  const jar = new Map();
  return {
    async call(route, body, expected = 200, extra = {}) {
      const response = await fetch(`${base}${route}`, {
        method: body === undefined ? "GET" : "POST", redirect: "manual", signal: AbortSignal.timeout(20_000),
        headers: { "Content-Type": "application/json", Origin: base, Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "), ...extra },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await response.json();
      equal(response.status, expected, `${route}: ${JSON.stringify(data)}`);
      check(response.headers.get("cache-control")?.includes("no-store"), "Configuration and account responses do not cache");
      for (const cookie of response.headers.getSetCookie()) {
        const [pair] = cookie.split(";"); const separator = pair.indexOf("=");
        const key = pair.slice(0, separator), value = pair.slice(separator + 1);
        if (value) jar.set(key, value); else jar.delete(key);
      }
      return data;
    },
  };
}
const admin = person(), member = person(), guest = person();
const initial = await guest.call("/api/appearance");
equal(Object.keys(initial).sort(), ["breedStyles", "defaultStyle", "revision", "updatedAt"], "Public configuration contains no private identities");
check(styles.includes(initial.defaultStyle), "Public default belongs to the finite catalog");
await guest.call("/api/admin/appearance", undefined, 401);
await guest.call("/api/admin/appearance", { defaultStyle: "badge", breedStyles: {}, expectedRevision: initial.revision }, 401,
  { "X-Session-Token": "x".repeat(43), "X-Player-Id": randomUUID() });
equal((await fetch(`${base}/api/appearance`, { method: "POST", redirect: "manual", signal: AbortSignal.timeout(5000) })).status, 405, "Public appearance endpoint is read-only");
await member.call("/api/auth/register", { email: memberEmail, password, displayName: "도트 검증 회원" });
await member.call("/api/admin/appearance", undefined, 403);
await member.call("/api/admin/appearance", { defaultStyle: "badge", breedStyles: {}, expectedRevision: initial.revision }, 403);
await admin.call("/api/auth/register", { email: adminEmail, password, displayName: "도트 검증 관리자" });
await admin.call("/api/admin/appearance", undefined, 403);
await admin.call("/api/auth/verify-email/request", {});
const inbox = await fetch(`${mailbox.origin}/messages?to=${encodeURIComponent(adminEmail)}`, {
  headers: { Authorization: `Bearer ${fixture.readToken}` }, signal: AbortSignal.timeout(5000),
}).then(response => response.json());
const email = [...inbox.messages].reverse().find(message => message.text.includes("/account/verify?token="));
check(email, "Verification email was delivered to the local test sink");
const link = email.text.match(/https?:\/\/[^\s<>"']+/g)?.map(value => new URL(value)).find(value => value.pathname === "/account/verify");
equal(link?.origin, base, "Verification remains on the isolated frontend");
await guest.call("/api/auth/verify-email/confirm", { token: link.searchParams.get("token") });
equal((await admin.call("/api/auth/me")).user.role, "ADMIN", "Verified configured test admin is authorized");
const ownedBefore = await admin.call("/api/game");
let current = await admin.call("/api/admin/appearance");
equal(current, initial, "Failed writes left the configuration unchanged");
const save = (defaultStyle, breedStyles = {}) => admin.call("/api/admin/appearance", { defaultStyle, breedStyles, expectedRevision: current.revision });
const firstRevision = current.revision;
current = await save("round");
equal(current.revision, firstRevision + 1, "One save increments the revision once");
equal(current.breedStyles, {}, "Applying to all clears individual overrides");
current = await save("round", { beagle: "mini", maltese: "mochi" });
equal((await guest.call("/api/appearance")).breedStyles, { beagle: "mini", maltese: "mochi" }, "Other users see per-breed settings");
await admin.call("/api/admin/appearance", { defaultStyle: "bold", breedStyles: {}, expectedRevision: firstRevision }, 409);
for (const body of [
  { defaultStyle: "missing", breedStyles: {}, expectedRevision: current.revision },
  { defaultStyle: "round", breedStyles: { cat: "mini" }, expectedRevision: current.revision },
  { defaultStyle: "round", breedStyles: { beagle: "missing" }, expectedRevision: current.revision },
  { defaultStyle: "round", breedStyles: null, expectedRevision: current.revision },
  { defaultStyle: "round", breedStyles: [], expectedRevision: current.revision },
  { defaultStyle: "round", breedStyles: {}, expectedRevision: -1 },
  { defaultStyle: "round", breedStyles: {} },
]) await admin.call("/api/admin/appearance", body, 400);
await admin.call("/api/admin/appearance", { defaultStyle: "badge", breedStyles: {}, expectedRevision: current.revision }, 403, { Origin: "https://attacker.example" });
await admin.call("/api/admin/appearance", { defaultStyle: "badge", breedStyles: {}, expectedRevision: current.revision }, 403, { Origin: "http://localhost:3101" });
equal(await guest.call("/api/appearance"), current, "Invalid data, stale saves, and cross-origin writes have no effects");
for (const style of styles) {
  const revision = current.revision;
  current = await save(style);
  equal(current.defaultStyle, style, `Style ${style} persists`);
  equal(current.revision, revision + 1, "Saved revisions are monotonic");
  equal(await guest.call("/api/appearance"), current, "Public readers receive the saved configuration");
}
current = await save("classic");
const ownedAfter = await admin.call("/api/game");
equal(ownedAfter.puppies, ownedBefore.puppies, "Style settings preserve individual puppy names, breeds, stats, and wardrobe");
equal(ownedAfter.coins, ownedBefore.coins, "Style changes do not spend hearts");
await writeFile(path.join(root, "backend/build/appearance-ui-fixture.json"), JSON.stringify({ base, adminEmail, password, checks, revision: current.revision }, null, 2));
console.log(`PASS ${checks} appearance checks. Disposable administrator ready for local UI verification.`);
