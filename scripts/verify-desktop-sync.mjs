import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";

// This creates disposable owners, social profiles, puppies and device registrations.
// PUPPY_TEST_ISOLATED=1 node scripts/verify-desktop-sync.mjs
// PUPPY_TEST_URL may select another disposable local frontend (default :3101).
if (process.env.PUPPY_TEST_ISOLATED !== "1" && !process.argv.includes("--isolated")) {
  throw new Error("Refusing to create test data without PUPPY_TEST_ISOLATED=1 or --isolated. Use a disposable local database.");
}
const target = new URL(process.env.PUPPY_TEST_URL || "http://127.0.0.1:3101");
if (!["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) || !["http:", "https:"].includes(target.protocol)
  || target.username || target.password || target.search || target.hash || target.pathname !== "/") {
  throw new Error("PUPPY_TEST_URL must be the base origin of a disposable loopback frontend.");
}
const base = target.origin;
const runId = randomUUID().slice(0, 6);
const privateName = `실명비공개-${runId}`;
const privateNickname = `산책전용-${runId}`;
let checks = 0;
function check(condition, message) { assert.ok(condition, message); checks++; }
function equal(actual, expected, message) { assert.deepEqual(actual, expected, message); checks++; }

async function request(path, { body, headers = {}, method = body === undefined ? "GET" : "POST" } = {}) {
  const response = await fetch(`${base}${path}`, {
    method, headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual", signal: AbortSignal.timeout(18000),
  });
  if (path.startsWith("/api/desktop/")) {
    check(response.headers.get("cache-control")?.includes("no-store"), `${path}: success/error responses must not be cached`);
    const vary = (response.headers.get("vary") || "").toLowerCase();
    check(vary.includes("cookie") && vary.includes("authorization"), `${path}: cache identity includes cookie and authorization`);
  }
  let data;
  try { data = await response.json(); }
  catch { throw new Error(`${path}: expected JSON, received status ${response.status}`); }
  return { response, data };
}
function status(result, expected, label) {
  // Do not include response bodies in failures: pairing responses contain the newly issued secret.
  equal(result.response.status, expected, `${label}: HTTP ${expected}`);
  return result.data;
}
function browser() {
  let cookie = "";
  return {
    get cookie() { return cookie; },
    get credential() { return cookie.slice(cookie.indexOf("=") + 1); },
    async call(path, body, extraHeaders = {}) {
      const result = await request(path, { body, headers: { ...(cookie ? { Cookie: cookie } : {}), Origin: base, ...extraHeaders } });
      const set = result.response.headers.get("set-cookie");
      if (set) {
        check(/HttpOnly/i.test(set) && /SameSite=Lax/i.test(set) && /Path=\//i.test(set), "Owner cookie remains HttpOnly and same-site");
        cookie = set.split(";")[0];
      }
      return result;
    },
    async ok(path, body, headers) { return status(await this.call(path, body, headers), 200, path); },
  };
}
const a = browser(), b = browser();
const paired = [];
const forbiddenValues = [privateName, privateNickname];
const socialKeys = new Set(["playerId", "player_id", "realName", "photo", "nickname", "age", "friendship", "friends", "requests", "messages", "room", "rooms", "puppies", "selectedId", "tokenHash", "codeHash"]);
function narrow(payload, label, forbiddenToken) {
  const serialized = JSON.stringify(payload);
  for (const secret of [...forbiddenValues, ...(forbiddenToken ? [forbiddenToken] : [])]) {
    check(!serialized.includes(secret), `${label}: private owner/social/credential data is absent`);
  }
  function inspect(value) {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      check(!socialKeys.has(key), `${label}: field ${key} must not cross the desktop scope`);
      inspect(child);
    }
  }
  inspect(payload);
}
function stateShape(value, label) {
  equal(Object.keys(value).sort(), ["coins", "obedience", "promotionXp", "puppy", "syncedAt"].sort(), `${label}: only current-puppy state is returned`);
  check(value.puppy && !Array.isArray(value.puppy) && typeof value.puppy.id === "string", `${label}: exactly one current puppy`);
  equal(Object.keys(value.puppy).sort(), ["id", "name", "breed", "grade", "xp", "hunger", "happiness", "energy", "fur", "eyes", "accessory", "lastFeed", "lastPlay", "lastRest", "lastTrain"].sort(), `${label}: narrow puppy fields`);
  narrow(value, label);
}
function dogOf(game) { return game.puppies.find(puppy => puppy.id === game.selectedId); }
function appearanceMatches(state, game, label) {
  stateShape(state, label);
  equal(state.puppy, dogOf(game), `${label}: current puppy appearance and progression match web`);
  equal(state.coins, game.coins, `${label}: shared coins match web`);
}
async function device(pair, path = "state", body, headers = {}) {
  const result = await request(`/api/desktop/${path}`, { body, headers: { Authorization: `Bearer ${pair.token}`, ...headers } });
  check(!result.response.headers.has("set-cookie"), "Device endpoints never issue the private browser cookie");
  return result;
}
async function deviceOk(pair, path = "state", body, headers) { return status(await device(pair, path, body, headers), 200, `device ${path}`); }
const action = (puppyId, name, extra = {}) => ({ action: name, puppyId, requestId: randomUUID(), ...extra });

try {
  const [firstA, firstB] = await Promise.all([a.ok("/api/game"), b.ok("/api/game")]);
  check(a.cookie && b.cookie && a.credential !== b.credential, "Two independent browser owners bootstrap separate cookies");
  check(firstA.selectedId !== firstB.selectedId, "Owners have different puppies");
  forbiddenValues.push(a.credential, b.credential);
  const oldDogId = firstA.selectedId, otherDogId = firstB.selectedId;
  const social = await a.ok("/api/walk/profile", { nickname: privateNickname, age: 31, realName: privateName, photo: null });
  forbiddenValues.push(social.state.me.id);
  await a.ok("/api/game/rename", { puppyId: oldDogId, value: `연결루비${runId}` });
  const customized = await a.ok("/api/game/customize", { puppyId: oldDogId, fur: "rose", eyes: "blue", accessory: "ribbon" });

  const oldCode = await a.ok("/api/desktop/pair-code", {});
  const code = await a.ok("/api/desktop/pair-code", {});
  check(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/.test(code.code), "Pairing code has twelve unambiguous characters");
  check(code.expiresAt > Date.now() && code.expiresAt < Date.now() + 310000, "Pairing code expires in approximately five minutes");
  status(await request("/api/desktop/pair", { body: { code: oldCode.code, deviceName: "무효 코드" } }), 400, "Replacing a code invalidates the previous one");
  const pairRace = await Promise.all([0, 1].map(index => request("/api/desktop/pair", {
    body: { code: code.code.toLowerCase(), deviceName: `격리검증 A-${index}` },
    headers: { Cookie: b.cookie, "X-Player-Id": b.credential },
  })));
  equal(pairRace.filter(result => result.response.status === 200).length, 1, "Exactly one simultaneous caller can redeem a code");
  equal(pairRace.filter(result => result.response.status === 400).length, 1, "The losing redemption rejects the consumed code");
  const pairedResult = pairRace.find(result => result.response.status === 200);
  check(!pairedResult.response.headers.has("set-cookie"), "Pairing never exposes or rewrites an owner cookie");
  const deviceA = pairedResult.data; paired.push({ owner: a, device: deviceA });
  check(/^[A-Za-z0-9_-]{43}$/.test(deviceA.token) && Buffer.from(deviceA.token, "base64url").length === 32, "Desktop receives a distinct 256-bit scoped token");
  narrow(deviceA, "pairing result");
  appearanceMatches(deviceA.state, customized.state, "initial linked puppy");
  status(await request("/api/desktop/pair", { body: { code: code.code, deviceName: "재사용 불가" } }), 400, "Code replay after successful pairing is rejected");

  const codeB = await b.ok("/api/desktop/pair-code", {});
  const deviceB = status(await request("/api/desktop/pair", { body: { code: codeB.code, deviceName: "격리검증 B" } }), 200, "Second independent owner pairing");
  paired.push({ owner: b, device: deviceB });
  check(deviceA.token !== deviceB.token && deviceA.device.id !== deviceB.device.id, "Device identities and credentials are independent");
  const linksA = await a.ok("/api/desktop/links"), linksB = await b.ok("/api/desktop/links");
  equal(linksA.devices.map(item => item.id), [deviceA.device.id], "Owner A only lists their device");
  equal(linksB.devices.map(item => item.id), [deviceB.device.id], "Owner B only lists their device");
  narrow(linksA, "device list A", deviceA.token); narrow(linksB, "device list B", deviceB.token);
  const spoofedLinks = await b.ok("/api/desktop/links", undefined, { Authorization: `Bearer ${deviceA.token}`, "X-Player-Id": a.credential });
  equal(spoofedLinks.devices.map(item => item.id), [deviceB.device.id], "Browser management ignores device tokens and forged player headers");
  status(await b.call("/api/desktop/revoke", { deviceId: deviceA.device.id }), 404, "Another owner cannot revoke this device");

  for (const [label, headers] of [
    ["no credentials", {}], ["browser cookie only", { Cookie: a.cookie }],
    ["raw owner credential", { Authorization: `Bearer ${a.credential}` }],
    ["public device ID", { Authorization: `Bearer ${deviceA.device.id}` }],
    ["unknown well-formed token", { Authorization: `Bearer ${randomBytes(32).toString("base64url")}` }],
  ]) status(await request("/api/desktop/state", { headers }), 401, `Desktop state rejects ${label}`);
  const initialState = await deviceOk(deviceA, "state", undefined, { Cookie: b.cookie, "X-Player-Id": b.credential });
  appearanceMatches(initialState, customized.state, "device bearer takes precedence over unrelated browser cookie");
  const otherGame = await b.ok("/api/game", undefined, { Authorization: `Bearer ${deviceA.token}`, "X-Player-Id": a.credential });
  equal(otherGame.selectedId, otherDogId, "Device token cannot impersonate its owner through game proxy");
  const otherSocial = await b.ok("/api/walk", undefined, { Authorization: `Bearer ${deviceA.token}`, "X-Player-Id": a.credential });
  check(otherSocial.me.id !== social.state.me.id && !JSON.stringify(otherSocial).includes(privateName), "Device token cannot access owner social data through walk proxy");

  const feed = action(oldDogId, "feed");
  const duplicateFeeds = await Promise.all([0, 1, 2].map(() => deviceOk(deviceA, "action", feed)));
  check(duplicateFeeds.every(result => result.success && result.message === duplicateFeeds[0].message), "Concurrent feed retries return the same stored outcome");
  equal(duplicateFeeds.map(result => result.state.puppy.xp), [10, 10, 10], "Concurrent feed requests grant exactly 10 XP total");
  let webA = await a.ok("/api/game");
  equal([webA.coins, dogOf(webA).xp, webA.careCount], [1010, 10, 1], "Feed rewards and care count are applied once on the web");
  const restedWeb = await a.ok("/api/game/rest", { puppyId: oldDogId });
  const replayedFeed = await deviceOk(deviceA, "action", feed);
  appearanceMatches(replayedFeed.state, restedWeb.state, "idempotent replay returns fresh state after web care");
  equal([replayedFeed.state.coins, replayedFeed.state.puppy.xp], [1015, 15], "Replayed feed never grants extra rewards");
  equal(replayedFeed.message, duplicateFeeds[0].message, "Replay retains original action message");
  status(await device(deviceA, "action", { ...feed, action: "play" }), 409, "Request ID cannot be reused for another action");
  status(await device(deviceA, "action", { ...feed, value: "changed" }), 409, "Request ID cannot be reused with altered input");
  status(await device(deviceA, "action", action(oldDogId, "play", { requestId: "invalid-id" })), 400, "Malformed action request IDs are rejected");
  status(await device(deviceA, "action", action(otherDogId, "feed")), 409, "A device cannot act on another owner's puppy");

  const rest = action(otherDogId, "rest");
  const duplicateRests = await Promise.all([deviceOk(deviceB, "action", rest), deviceOk(deviceB, "action", rest)]);
  check(duplicateRests.every(result => result.success && result.state.puppy.xp === 5 && result.state.coins === 1005), "Concurrent desktop rest rewards occur once");
  const webB = await b.ok("/api/game");
  equal([webB.careCount, dogOf(webB).xp, webB.coins], [1, 5, 1005], "Other owner's progression stays independent");
  equal((await deviceOk(deviceB, "action", rest)).state.puppy.xp, 5, "Later rest replay is also idempotent");
  const answer = await deviceOk(deviceA, "action", action(oldDogId, "ask", { value: "엑셀 붙여넣기" }));
  check(answer.success && answer.message.includes("Ctrl + V다 멍!"), "Scoped desktop questions use real grade-unlocked answers");
  equal([answer.state.puppy.xp, answer.state.coins], [15, 1015], "Questions do not grant XP or coins");
  for (const forbidden of ["adopt", "gift", "select", "rename", "customize", "profile", "friend-request"])
    status(await device(deviceA, "action", action(oldDogId, forbidden)), 400, `Device scope rejects ${forbidden}`);
  equal((await deviceOk(deviceA)).puppy.xp, 15, "Rejected scope attempts grant no XP");

  for (const headers of [{ Origin: "https://unrelated.invalid" }, { Origin: "not-a-valid-origin" }, { "Sec-Fetch-Site": "cross-site" }]) {
    status(await a.call("/api/desktop/pair-code", {}, headers), 403, "Cross-site or malformed-origin code issuance is rejected");
  }
  status(await a.call("/api/desktop/revoke", { deviceId: deviceA.device.id }, { Origin: "https://unrelated.invalid" }), 403, "CSRF cannot revoke an owner's device");
  status(await device(deviceA, "action", action(oldDogId, "play"), { Origin: "https://unrelated.invalid" }), 403, "Cross-site action requests are rejected");
  status(await request("/api/desktop/pair", { body: { code: "AAAAAAAAAAAA", deviceName: "CSRF" }, headers: { Origin: "https://unrelated.invalid" } }), 403, "CSRF is rejected before pairing code redemption");
  status(await request("/api/desktop/pair-code"), 404, "Wrong endpoint methods are rejected without caching");

  const adopted = await a.ok("/api/game/adopt", {});
  const newDogId = adopted.newPuppyId;
  check(newDogId && newDogId !== oldDogId && adopted.state.puppies.length === 2, "Web adoption changes the selected puppy");
  await a.ok("/api/game/rename", { puppyId: newDogId, value: `새루비${runId}` });
  const changed = await a.ok("/api/game/customize", { puppyId: newDogId, fur: "silver", eyes: "green", accessory: "crown" });
  status(await device(deviceA, "action", action(oldDogId, "feed")), 409, "Stale desktop actions on the previous selected puppy require refresh");
  status(await device(deviceA, "action", feed), 409, "A prior-puppy receipt never replays as an action on the new puppy");
  const followed = await deviceOk(deviceA);
  appearanceMatches(followed, changed.state, "web-selected new puppy follows to desktop with exact appearance");
  check(!JSON.stringify(followed).includes(oldDogId), "Desktop never receives the whole puppy collection");
  equal(followed.puppy.xp, 0, "Rejected stale actions cannot reward the newly selected puppy");
  const selectedBack = await a.ok("/api/game/select", { puppyId: oldDogId });
  appearanceMatches(await deviceOk(deviceA), selectedBack.state, "switching back restores the original puppy progression");
  const finalStyle = await a.ok("/api/game/customize", { puppyId: oldDogId, fur: "cream", eyes: "amber", accessory: "scarf" });
  appearanceMatches(await deviceOk(deviceA), finalStyle.state, "later web appearance edits remain authoritative");

  const revoked = await a.ok("/api/desktop/revoke", { deviceId: deviceA.device.id });
  equal(revoked.devices.length, 0, "Owner revocation removes their active device");
  status(await device(deviceA), 401, "Revoked token cannot poll");
  status(await device(deviceA, "action", action(oldDogId, "play"), { Cookie: a.cookie }), 401, "Browser cookie cannot rescue a revoked device token");
  equal((await a.ok("/api/desktop/revoke", { deviceId: deviceA.device.id })).devices.length, 0, "Revocation is idempotent");
  appearanceMatches(await deviceOk(deviceB), webB, "Another owner's device remains valid after revocation");
  webA = await a.ok("/api/game");
  equal([webA.careCount, dogOf(webA).xp, webA.coins], [2, 15, 915], "Final web rewards contain only one feed, one rest and the adoption charge");
  console.log(`PASS ${checks} isolated desktop-sync checks: pairing, token scope, owner separation, appearance, concurrent idempotency, selected-puppy authority, revocation, CSRF and no-store.`);
} finally {
  // Only registrations created by this run are cleaned up; the disposable DB owns all other fixtures.
  for (const { owner, device: registered } of paired) {
    try { await owner.ok("/api/desktop/revoke", { deviceId: registered.device.id }); }
    catch { /* Keep the original failure; the disposable DB is discarded by its launcher. */ }
  }
}
