import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

assert.equal(process.env.PUPPY_TEST_ISOLATED, "1", "Use only with a disposable local database: PUPPY_TEST_ISOLATED=1");
const origin = process.env.PUPPY_TEST_URL || "http://127.0.0.1:3101";
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname));
let cookie = "";
async function call(path, body) {
  const response = await fetch(origin + path, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", Cookie: cookie }, body: body ? JSON.stringify(body) : undefined });
  const set = response.headers.get("set-cookie"); if (set) cookie = set.split(";")[0];
  const data = await response.json(); assert.ok(response.ok, `${path}: ${JSON.stringify(data)}`); return data;
}
const initial = await call("/api/game");
const first = initial.puppies.find(dog => dog.id === initial.selectedId);
await call("/api/game/rename", { puppyId: first.id, value: "쿠키" });
await call("/api/game/customize", { puppyId: first.id, fur: "rose", eyes: "green", accessory: "crown" });
const adoption = await call("/api/game/adopt", {});
const second = adoption.state.puppies.find(dog => dog.id === adoption.newPuppyId);
await call("/api/game/rename", { puppyId: second.id, value: "둘째" });
await call("/api/game/select", { puppyId: first.id });
const pairing = await call("/api/desktop/pair-code", {});
const output = resolve("local-assets/desktop/build/native-sync-test.txt");
const steps = [
  { op: "expect", expectedName: "쿠키", expectedBreed: first.breed, expectedGrade: first.grade, expectedXp: first.xp, expectedFur: "rose", expectedEyes: "green", expectedAccessory: "crown" },
  { op: "action", action: "feed", xpDelta: 10, expectedPending: false },
  { op: "action", action: "ask", value: "엑셀 붙여넣기", xpDelta: 0 },
  { op: "restart", expectedOnline: false, expectedLinked: true, expectedXp: first.xp + 10 },
  { op: "offline-action", action: "play", xpDelta: 0, expectedPending: false },
  { op: "poll", expectedOnline: true },
  { op: "browser", path: "/api/game/rest", body: { puppyId: "$puppy" } },
  { op: "poll", xpDelta: 5 },
  { op: "browser", path: "/api/game/customize", body: { puppyId: "$puppy", fur: "silver", eyes: "blue", accessory: "ribbon" } },
  { op: "browser", path: "/api/game/rename", body: { puppyId: "$puppy", value: "다정이" } },
  { op: "poll", expectedName: "다정이", expectedFur: "silver", expectedEyes: "blue", expectedAccessory: "ribbon" },
  { op: "browser", path: "/api/game/select", body: { puppyId: second.id } },
  { op: "action-error", action: "play", expectedStatus: 409, expectedPending: false, expectedName: "둘째", expectedBreed: second.breed, expectedGrade: second.grade, expectedXp: second.xp },
  { op: "action", action: "play", xpDelta: 15, expectedPending: false },
  { op: "restart", expectedLinked: true, expectedOnline: false, expectedName: "둘째", expectedXp: second.xp + 15 },
  { op: "poll", expectedOnline: true },
  { op: "revoke" },
  { op: "poll", expectedLinked: false, expectedOnline: false, expectedPending: false },
];
await mkdir(resolve("local-assets/desktop/build"), { recursive: true });
const config = resolve("local-assets/desktop/build/native-sync-scenario.json");
await writeFile(config, JSON.stringify({ origin, code: pairing.code, browserCookie: cookie, output, steps }, null, 2));
console.log(`Disposable native sync scenario ready: ${config}`);
