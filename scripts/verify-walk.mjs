import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

// Run against a disposable local database; this creates profiles, a room and chat.
const base = process.env.WALK_TEST_URL || "http://127.0.0.1:3101";
const privateName = `친구공개-${randomUUID().slice(0, 8)}`;
const otherPrivateName = `친구공개B-${randomUUID().slice(0, 8)}`;
const photo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=";
let checks = 0;
function check(value, message) { assert.ok(value, message); checks++; }
function client() {
  let cookie = "";
  return {
    get cookie() { return cookie; },
    async call(action = "", body, extraHeaders = {}) {
      const response = await fetch(`${base}/api/walk${action ? `/${action}` : ""}`, {
        method: body === undefined ? "GET" : "POST",
        headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...extraHeaders },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const set = response.headers.get("set-cookie");
      if (set) cookie = set.split(";")[0];
      const data = await response.json();
      check(response.headers.get("cache-control")?.includes("no-store"), "All social responses must bypass caches");
      return { response, data };
    },
    async ok(action, body, headers) {
      const { response, data } = await this.call(action, body, headers);
      assert.equal(response.status, 200, `${action || "state"}: ${JSON.stringify(data)}`);
      return body === undefined ? data : data.state;
    },
  };
}
const [a, b, c, d, e] = Array.from({ length: 5 }, client);
const clients = [a, b, c, d, e];
const initial = await Promise.all(clients.map(person => person.ok()));
check(initial.every(state => state.me.id && !state.me.configured && state.rooms.length >= 3), "First visit has real empty starter rooms and unconfigured profile");
check(initial.every((state, index) => !JSON.stringify(state).includes(clients[index].cookie.split("=")[1])), "Visitor credential never exposed as public profile ID");
const stateA = await a.ok("profile", { nickname: "쿠키엄마", age: 28, realName: privateName, photo });
for (const [index, person] of clients.entries()) if (index) await person.ok("profile", { nickname: ["", "쿠키아빠", "모카엄마", "두부아빠", "솜이엄마"][index], age: 29 + index, realName: index === 1 ? otherPrivateName : null, photo: null });
check(stateA.me.realName === privateName && stateA.me.photo === photo, "Self can edit private profile");
let state = await a.ok("create", { title: "검증용 산책방", description: "자동 검증 전용 임시 방", theme: "meadow", capacity: 4 });
const roomId = state.room.id;
check(state.room.memberCount === 1 && state.room.members[0].puppy.name, "Creator enters with their owned dog");
await b.ok("join", { roomId });
await c.ok("join", { roomId });
const clientId = randomUUID();
const chat = "안녕하세요! 함께 산책해요 🐾";
await a.ok("message", { text: chat, clientId });
state = await a.ok("message", { text: chat, clientId });
check(state.room.messages.filter(message => message.text === chat).length === 1, "Duplicate message retries are idempotent");
function hidden(snapshot, viewer) {
  const json = JSON.stringify(snapshot);
  check(!json.includes(privateName) && !json.includes(photo), `${viewer}: private name/photo absent across room owners, members, old messages and friend lists`);
  check(!json.includes(a.cookie.split("=")[1]), `${viewer}: private visitor credential absent`);
}
hidden(await b.ok(), "Stranger");
hidden(await c.ok(), "Third participant");
await a.ok("friend-request", { targetId: initial[1].me.id });
hidden(await b.ok(), "Pending friend");
let rejected = await a.call("friend-accept", { targetId: initial[1].me.id });
check(!rejected.response.ok, "Sender cannot accept their own outgoing request");
rejected = await c.call("friend-accept", { targetId: initial[0].me.id });
check(!rejected.response.ok, "Third party cannot accept another person's request");
rejected = await c.call("friend-request", { targetId: a.cookie.split("=")[1] });
check(!rejected.response.ok, "Private visitor ID cannot be used as public friendship target");
state = await b.ok("friend-accept", { targetId: initial[0].me.id });
check(state.friends.some(friend => friend.id === initial[0].me.id && friend.realName === privateName && friend.photo === photo), "Recipient acceptance reveals private profile");
check(state.room.members.some(member => member.profile.id === initial[0].me.id && member.profile.realName === privateName), "Accepted profile appears in room");
check(state.room.messages.some(message => message.author?.id === initial[0].me.id && message.author.realName === privateName), "Old message profile uses current friendship");
check((await a.ok()).friends.some(friend => friend.id === initial[1].me.id && friend.realName === otherPrivateName), "Acceptance reveals profile in both directions");
hidden(await c.ok(), "Third participant after friendship");
await b.ok("friend-remove", { targetId: initial[0].me.id });
hidden(await b.ok(), "Removed friend");
check(!JSON.stringify(await a.ok()).includes(otherPrivateName), "Removal hides profile in both directions");
const spoof = await b.ok(undefined, undefined, { "X-Player-Id": a.cookie.split("=")[1] });
check(spoof.me.id === initial[1].me.id, "Proxy overrides client-supplied identity header");
const denied = await b.call("profile", { nickname: "침입" }, { Origin: "https://unrelated.invalid" });
check(denied.response.status === 403, "Cross-origin mutations are rejected");
const race = await Promise.all([d.call("join", { roomId }), e.call("join", { roomId })]);
check(race.filter(result => result.response.ok).length === 1, "Only one simultaneous caller gets last capacity slot");
check((await (race[0].response.ok ? e : d).ok()).room === null, "Capacity race loser does not enter room");
state = await a.ok("move", { x: 73, y: 64 });
const moved = (await b.ok()).room.members.find(member => member.profile.id === initial[0].me.id);
check(moved.x === 73 && moved.y === 64, "Dog movement reaches another user");
await c.ok("leave", {});
rejected = await c.call("message", { text: "밖에서 보낸 메시지", clientId: randomUUID() });
check(!rejected.response.ok, "Nonmember cannot send room chat");
rejected = await c.call("move", { x: 50, y: 50 });
check(!rejected.response.ok, "Nonmember cannot move a dog in the room");
check((await c.ok()).room === null, "Leaving removes access to room chat and members");
for (const person of clients) await person.ok("leave", {});
check((await a.ok()).rooms.find(room => room.id === roomId).memberCount === 0, "Leave releases room capacity");
console.log(`PASS ${checks} walking-room checks: separate users, chat, movement, capacity, friendship privacy and proxy boundaries.`);
