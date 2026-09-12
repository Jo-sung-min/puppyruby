import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

// A temporary second participant for manual UI checks. Use a disposable database.
const base = process.env.WALK_TEST_URL || "http://127.0.0.1:3101";
const title = process.argv[2] || "루비와 함께 걷는 오후";
let cookie = "";
async function api(path, body) {
  const response = await fetch(`${base}/api/${path}`, {
    method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = response.headers.get("set-cookie"); if (set) cookie = set.split(";")[0];
  const data = await response.json();
  if (!response.ok) throw new Error(data.message);
  return body ? data.state : data;
}
let game = await api("game");
for (let index = 0; index < 3 && game.puppies.find(puppy => puppy.id === game.selectedId).breed === 0; index++) game = await api("game/adopt", {});
await api("game/rename", { puppyId: game.selectedId, value: "모카" });
let photo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=";
try { photo = `data:image/png;base64,${(await readFile(new URL("../desktop/build/assets/shiba-typing-0-0.png", import.meta.url))).toString("base64")}`; } catch { /* A generated pet avatar is optional for this test. */ }
let state = await api("walk/profile", { nickname: "모카아빠", age: 32, realName: "친구에게 공개된 테스트 이름", photo });
const room = state.rooms.find(room => room.title === title);
if (!room) throw new Error("먼저 UI에서 임시 산책방을 만들어 주세요.");
await api("walk/join", { roomId: room.id });
await api("walk/message", { text: "안녕하세요! 모카와 함께 산책 왔어요 🐾", clientId: randomUUID() });
console.log("Temporary second participant joined; incoming friend requests accepted after 10 seconds.");
const pending = new Map();
const until = Date.now() + 10 * 60 * 1000;
while (Date.now() < until) {
  await delay(2000);
  state = await api("walk");
  for (const request of state.requests) {
    if (!pending.has(request.id)) pending.set(request.id, Date.now() + 10000);
    if (Date.now() >= pending.get(request.id)) {
      await api("walk/friend-accept", { targetId: request.id });
      console.log("Friend request accepted for UI privacy check.");
      pending.delete(request.id);
    }
  }
}
await api("walk/leave", {});
