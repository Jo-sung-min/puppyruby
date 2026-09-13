import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

// This script creates only disposable local test accounts and changes only their isolated server.
if (process.env.PUPPY_TEST_ISOLATED !== "1") throw new Error("Set PUPPY_TEST_ISOLATED=1 for the disposable appearance verifier.");
const target = new URL(process.env.PUPPY_TEST_URL || "http://127.0.0.1:3101");
assert.equal(target.protocol, "http:"); assert.ok(["127.0.0.1", "localhost"].includes(target.hostname));
assert.equal(target.port, "3101"); assert.equal(target.pathname, "/");
assert.equal(target.search, ""); assert.equal(target.hash, "");
assert.equal(target.username, ""); assert.equal(target.password, "");
const base = target.origin;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = JSON.parse(await readFile(path.join(root, "backend/build/account-fixture.json"), "utf8"));
const mailbox = new URL(fixture.httpUrl);
assert.equal(mailbox.hostname, "127.0.0.1"); assert.equal(mailbox.protocol, "http:");
assert.equal(mailbox.username, ""); assert.equal(mailbox.password, "");
assert.match(fixture.readToken, /^[A-Za-z0-9_-]{43}$/);
const password = "Puppy-Style-Test-2026!";
const adminEmail = "admin@puppyruby.test";
const memberEmail = `styles-${randomUUID().slice(0, 8)}@puppyruby.test`;
const styles = ["classic", "round", "mochi", "chibi", "bean", "plush", "storybook", "bold", "retro", "mini", "sticker", "soft", "fluffy", "pocket", "cookie", "badge",
  "marshmallow", "dumpling", "pebble", "jellybean", "teacup", "loaf", "pear", "egg", "snowball", "teddy", "panda", "cub", "foxlet", "longbody", "tinyhead", "bigpaws",
  "cheeky", "squircle", "diamond", "toast", "waffle", "pixel8", "arcade", "robot", "paper", "origami", "patchwork", "pompom", "cloudlet", "sprout", "sleepy", "wink", "happy", "hug", "meadow", "animated-2d"];
const breeds = ["pomeranian", "poodle", "maltese", "shiba", "corgi", "beagle", "samoyed"];
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
equal(Object.keys(initial).sort(), ["breedStyles", "breedVarieties", "defaultStyle", "deletedStyles", "revision", "updatedAt", "varieties"], "Public configuration contains no private identities");
check(styles.includes(initial.defaultStyle), "Public default belongs to the finite catalog");
equal(initial.deletedStyles, [], "A fresh isolated server starts with every catalog style available");
equal(initial.varieties, [], "A fresh isolated server does not create unrequested breed varieties");
equal(initial.breedVarieties, {}, "Breeds start without an active custom variety");
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
const memberOwnedBefore = await member.call("/api/game");
let current = await admin.call("/api/admin/appearance");
equal(current, initial, "Failed writes left the configuration unchanged");
const save = (defaultStyle, breedStyles = {}, deletedStyles) => admin.call("/api/admin/appearance", {
  defaultStyle, breedStyles, expectedRevision: current.revision,
  ...(deletedStyles === undefined ? {} : { deletedStyles }),
});
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
const crossedAlias = target.hostname === "127.0.0.1" ? "http://localhost:3101" : "http://127.0.0.1:3101";
await admin.call("/api/admin/appearance", { defaultStyle: "badge", breedStyles: {}, expectedRevision: current.revision }, 403, { Origin: crossedAlias });
equal(await guest.call("/api/appearance"), current, "Invalid data, stale saves, and cross-origin writes have no effects");

// Deletion changes the public style catalog only; no puppy or account record is removed.
const beforeDeletion = current;
for (const deletedStyles of [null, "badge", {}, [42], [""], ["unknown"], ["badge", "badge"], styles]) {
  await admin.call("/api/admin/appearance", {
    defaultStyle: "round", breedStyles: {}, deletedStyles, expectedRevision: current.revision,
  }, 400);
}
await admin.call("/api/admin/appearance", {
  defaultStyle: "round", breedStyles: {}, deletedStyles: ["round"], expectedRevision: current.revision,
}, 400);
await admin.call("/api/admin/appearance", {
  defaultStyle: "round", breedStyles: { beagle: "mini" }, deletedStyles: ["mini"], expectedRevision: current.revision,
}, 400);
equal(await guest.call("/api/appearance"), beforeDeletion, "Rejected deletions preserve the complete configuration and revision");

try {
  current = await save("round", { beagle: "mini", maltese: "mochi" }, ["badge", "classic"]);
  equal(current.revision, beforeDeletion.revision + 1, "Valid deletion advances the revision once");
  equal(current.deletedStyles, ["classic", "badge"], "Deleted styles are normalized in catalog order");
  equal(current.defaultStyle, "round", "A remaining style is the active default after deleting classic");
  equal(current.breedStyles, { beagle: "mini", maltese: "mochi" }, "Valid individual overrides remain explicit");
  equal(await guest.call("/api/appearance"), current, "Anonymous readers see the saved deletion list");
  equal(await member.call("/api/appearance"), current, "Another account sees the same remaining styles");
  equal(await admin.call("/api/admin/appearance"), current, "A fresh administrator read preserves deletions");

  const deletedRevision = current.revision;
  current = await save("mochi", { pomeranian: "round", beagle: "mini" });
  equal(current.revision, deletedRevision + 1, "A legacy save still increments the revision once");
  equal(current.deletedStyles, ["classic", "badge"], "Omitting deletedStyles preserves previously deleted styles");
  equal(await person().call("/api/appearance"), current, "A new reader receives persisted deletions after an omitted-field save");
  for (const selection of [
    { defaultStyle: "classic", breedStyles: {} },
    { defaultStyle: "mochi", breedStyles: { maltese: "badge" } },
  ]) {
    await admin.call("/api/admin/appearance", { ...selection, expectedRevision: current.revision }, 400);
    await admin.call("/api/admin/appearance", { ...selection, deletedStyles: ["classic", "badge"], expectedRevision: current.revision }, 400);
  }
  await admin.call("/api/admin/appearance", {
    defaultStyle: "classic", breedStyles: {}, deletedStyles: [], expectedRevision: deletedRevision,
  }, 409);
  equal(await guest.call("/api/appearance"), current, "Stale restoration and deleted-style references cannot overwrite the current draft basis");

  const memberWhileDeleted = await member.call("/api/game");
  equal(memberWhileDeleted, memberOwnedBefore, "Deleting styles leaves another member's full game state and puppies intact");
  equal(await admin.call("/api/game"), ownedBefore, "Deleting styles preserves the administrator's game data too");

  current = await save("mini", {}, styles.filter(style => style !== "mini").reverse());
  equal(current.deletedStyles, styles.filter(style => style !== "mini"), "Deleting all other styles is allowed when one usable style remains");
  equal(current.defaultStyle, "mini", "The single remaining style stays selected");
  equal(current.breedStyles, {}, "Single-style configuration contains no deleted override references");
  equal(await guest.call("/api/appearance"), current, "The single remaining style is visible in public configuration");

  current = await save("classic", {}, []);
  equal(current.deletedStyles, [], "An explicit empty list restores all styles");
  equal(current.defaultStyle, "classic", "A restored style can be selected in the same save");
  equal(await admin.call("/api/admin/appearance"), current, "Restoration persists on re-read");
  equal(await member.call("/api/appearance"), current, "Restoration is visible to other accounts");
} finally {
  // Leave the disposable UI fixture usable even if one deletion assertion fails.
  current = await admin.call("/api/admin/appearance");
  if (current.defaultStyle !== "classic" || Object.keys(current.breedStyles).length || current.deletedStyles.length) {
    current = await save("classic", {}, []);
  }
}

for (const style of styles) {
  const revision = current.revision;
  current = await save(style);
  equal(current.defaultStyle, style, `Style ${style} persists`);
  equal(current.deletedStyles, [], `Restored style ${style} stays available through legacy saves`);
  equal(current.revision, revision + 1, "Saved revisions are monotonic");
  equal(await guest.call("/api/appearance"), current, "Public readers receive the saved configuration");
}
current = await save("classic");

const variety = (breed, name, extra = {}) => ({
  id: randomUUID(), breed, name, style: null, shape: "original", pattern: "solid", coatColor: null, patternColor: "#FFFFFF", ...extra,
});
const typeBody = (varieties, breedVarieties, extra = {}) => ({
  defaultStyle: current.defaultStyle, breedStyles: current.breedStyles, deletedStyles: current.deletedStyles,
  expectedRevision: current.revision, varieties, breedVarieties, ...extra,
});
try {
  const teddy = variety("pomeranian", "  곰돌이형  ", { style: "teddy", shape: "teddy", pattern: "tuxedo", coatColor: "#ab09cf", patternColor: "#aAbBcC" });
  const fox = variety("pomeranian", "여우형", { shape: "fox", pattern: "blaze" });
  const socks = variety("corgi", "양말 무늬", { style: "animated-2d", pattern: "socks", coatColor: "#E5AC64" });
  const active = { pomeranian: teddy.id, corgi: socks.id };
  current = await admin.call("/api/admin/appearance", typeBody([teddy, fox, socks], active));
  equal(current.varieties.length, 3, "Multiple subtypes are saved alongside the catalog");
  equal(current.breedVarieties, active, "Each breed retains its selected subtype UUID");
  equal(current.varieties[0], { ...teddy, name: "곰돌이형", coatColor: "#AB09CF", patternColor: "#AABBCC" }, "Subtype names and colors are normalized without losing shape or pattern");
  equal(current.varieties[1], fox, "A null subtype style remains an explicit inheritance choice");
  equal(await member.call("/api/appearance"), current, "Other accounts receive the saved active subtypes");
  equal(await person().call("/api/appearance"), current, "A new anonymous reader receives persisted subtype appearance");
  const persisted = current;
  current = await save("round", { pomeranian: "fluffy" });
  equal(current.varieties, persisted.varieties, "A legacy save omitting subtype fields preserves all stored types");
  equal(current.breedVarieties, active, "A legacy save preserves each breed's active type");
  equal(await admin.call("/api/admin/appearance"), current, "Subtype values persist after a separate administrator read");
  await admin.call("/api/admin/appearance", typeBody([], {}, { expectedRevision: persisted.revision }), 409);
  await member.call("/api/admin/appearance", typeBody([], {}), 403);
  const wrongBreed = { ...active, poodle: teddy.id };
  const duplicate = { ...fox, name: " 곰돌이형 " };
  for (const body of [
    typeBody(current.varieties, wrongBreed),
    typeBody(current.varieties, { pomeranian: randomUUID() }),
    typeBody([current.varieties[0], duplicate], {}),
    typeBody([current.varieties[0], { ...fox, id: teddy.id }], {}),
    typeBody([{ ...fox, shape: "bear" }], {}),
    typeBody([{ ...fox, pattern: "striped" }], {}),
    typeBody([{ ...fox, patternColor: "red" }], {}),
    typeBody([{ ...fox, name: "가".repeat(25) }], {}),
    typeBody([{ ...fox, id: "1-1-1-1-1" }], {}),
    { defaultStyle: "round", breedStyles: {}, expectedRevision: current.revision, varieties: [] },
    { defaultStyle: "round", breedStyles: {}, expectedRevision: current.revision, breedVarieties: {} },
    typeBody(null, {}),
  ]) await admin.call("/api/admin/appearance", body, 400);
  equal(await guest.call("/api/appearance"), current, "Rejected type definitions and cross-breed selections do not alter the revision");
  await admin.call("/api/admin/appearance", {
    defaultStyle: current.defaultStyle, breedStyles: current.breedStyles, deletedStyles: ["teddy"], expectedRevision: current.revision,
  }, 400);
  await admin.call("/api/admin/appearance", typeBody(current.varieties, active, { deletedStyles: ["teddy"] }), 400);
  const inheriting = current.varieties.map(value => value.id === teddy.id ? { ...value, style: null } : value);
  current = await admin.call("/api/admin/appearance", typeBody(inheriting, active, { deletedStyles: ["teddy"] }));
  equal(current.varieties[0].style, null, "Clearing a subtype's direct style permits inherited style after deletion");
  equal(current.breedVarieties, active, "Deleting a style does not delete the active subtype itself");
  equal(current.deletedStyles, ["teddy"], "Deleted subtype styles stay excluded in public state");

  const many = breeds.flatMap(breed => Array.from({ length: 20 }, (_, index) => variety(breed, `사진 친구 ${index + 1}`, {
    shape: index % 2 ? "fox" : "teddy", pattern: ["solid", "tuxedo", "patches", "freckles", "socks", "blaze"][index % 6],
  })));
  const manyActive = Object.fromEntries(breeds.map(breed => [breed, many.find(value => value.breed === breed).id]));
  const largeBody = typeBody(many, manyActive, { defaultStyle: "classic", breedStyles: {}, deletedStyles: [] });
  const largeBytes = Buffer.byteLength(JSON.stringify(largeBody));
  check(largeBytes > 4096 && largeBytes < 65536, "The 140-type fixture exceeds the old 4 KiB body limit and fits the new 64 KiB limit");
  current = await admin.call("/api/admin/appearance", largeBody);
  equal(current.varieties, many, "All 140 subtype definitions survive a request larger than 4 KiB");
  equal(current.breedVarieties, manyActive, "All seven selected subtype bindings survive the large request");
  equal(await person().call("/api/appearance"), current, "A new page receives the complete large subtype configuration");
  await admin.call("/api/admin/appearance", typeBody([...many, variety("pomeranian", "추가")], manyActive), 400);
  await admin.call("/api/admin/appearance", typeBody([...many.slice(0, 20), variety("pomeranian", "추가")], {}), 400);
  await admin.call("/api/admin/appearance", { ...typeBody([], {}), extra: "x".repeat(65536) }, 400);
  equal(await guest.call("/api/appearance"), current, "Type count and request size rejections leave the persisted configuration unchanged");
} finally {
  current = await admin.call("/api/admin/appearance");
  current = await admin.call("/api/admin/appearance", typeBody([], {}, { defaultStyle: "classic", breedStyles: {}, deletedStyles: [] }));
}
equal(current.varieties, [], "The disposable UI fixture ends with no custom types");
equal(current.breedVarieties, {}, "Clearing types also explicitly clears active bindings");
const ownedAfter = await admin.call("/api/game");
equal(ownedAfter.puppies, ownedBefore.puppies, "Style settings preserve individual puppy names, breeds, stats, and wardrobe");
equal(ownedAfter.coins, ownedBefore.coins, "Style changes do not spend hearts");
equal(await member.call("/api/game"), memberOwnedBefore, "Deleting and restoring styles never edits another member's puppy collection or progress");
await writeFile(path.join(root, "backend/build/appearance-ui-fixture.json"), JSON.stringify({ base, adminEmail, password, checks, revision: current.revision }, null, 2));
console.log(`PASS ${checks} appearance checks. Disposable administrator ready for local UI verification.`);
