import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Requires an isolated Next frontend :3101, a disposable backend DB, and the local
// account-mail-fixture. No external email or Kakao request is made by this script.
if (process.env.PUPPY_TEST_ISOLATED !== "1") throw new Error("Set PUPPY_TEST_ISOLATED=1; this verifier creates disposable account and moderation data.");
const target = new URL(process.env.PUPPY_TEST_URL || "http://localhost:3101");
if (!["http://localhost:3101", "http://127.0.0.1:3101"].includes(target.origin) || target.pathname !== "/" || target.username || target.password || target.search || target.hash)
  throw new Error("Only an isolated localhost:3101 or 127.0.0.1:3101 frontend origin is permitted.");
const base = target.origin;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = JSON.parse(await readFile(path.join(root, "backend", "build", "account-fixture.json"), "utf8"));
const mailbox = new URL(fixture.httpUrl);
if (fixture.version !== 1 || fixture.smtpHost !== "127.0.0.1" || !Number.isInteger(fixture.smtpPort)
    || mailbox.protocol !== "http:" || mailbox.hostname !== "127.0.0.1" || !mailbox.port || mailbox.port === "3101"
    || mailbox.pathname !== "/" || mailbox.username || mailbox.password || mailbox.search || mailbox.hash
    || !/^[A-Za-z0-9_-]{43}$/.test(fixture.readToken)) throw new Error("Invalid isolated mail fixture metadata.");

const originalPassword = "Puppy-Verify-2026!";
const changedPassword = "Puppy-Changed-2026!";
const runId = randomUUID().slice(0, 8);
const memberEmail = `member-${runId}@puppyruby.test`;
const adminEmail = "admin@puppyruby.test";
const uiMemberEmail = "member@puppyruby.test";
const phases = [];
let checks = 0;
function check(value, label) { assert.ok(value, label); checks++; }
function equal(actual, expected, label) { check(JSON.stringify(actual) === JSON.stringify(expected), label); }
function status(result, expected, label) {
  check(result.response.status === expected, `${label}: expected HTTP ${expected}, received ${result.response.status}`);
  return result.data;
}
function publicAccount(payload, label) {
  const forbidden = new Set(["token", "sessionToken", "tokenHash", "password", "passwordHash", "playerId", "kakaoId", "expiresAt"]);
  function inspect(value) {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) { check(!forbidden.has(key), `${label}: credentials and internal identities are absent`); inspect(child); }
  }
  inspect(payload);
}
async function request(route, { body, headers = {}, origin = base, method = body === undefined ? "GET" : "POST" } = {}) {
  const response = await fetch(`${base}${route}`, { method, redirect: "manual", signal: AbortSignal.timeout(20_000),
    headers: { "Content-Type": "application/json", ...(origin === null ? {} : { Origin: origin }), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body) });
  let data;
  try { data = await response.json(); } catch { throw new Error(`${route.split("?")[0]}: JSON response required (HTTP ${response.status})`); }
  if (route.startsWith("/api/auth") || route.startsWith("/api/admin")) {
    check(response.headers.get("cache-control")?.includes("no-store"), "Account/admin responses bypass caches");
    check((response.headers.get("vary") || "").toLowerCase().includes("cookie"), "Account/admin cache varies by cookie");
    publicAccount(data, "Browser account response");
  }
  return { response, data };
}
function browser(seed = {}) {
  const jar = new Map(Object.entries(seed));
  return {
    get player() { return jar.get("puppyruby-player"); },
    get session() { return jar.get("puppyruby-session"); },
    snapshot() { return Object.fromEntries(jar); },
    async call(route, body, options = {}) {
      const cookie = [...jar].map(([key, value]) => `${key}=${value}`).join("; ");
      const result = await request(route, { body, ...options, headers: { ...(cookie ? { Cookie: cookie } : {}), ...options.headers } });
      for (const set of result.response.headers.getSetCookie()) {
        const [pair, ...flags] = set.split(";"); const separator = pair.indexOf("=");
        if (separator < 1) continue;
        const key = pair.slice(0, separator), value = pair.slice(separator + 1);
        if (["puppyruby-session", "puppyruby-player"].includes(key)) {
          const attributes = flags.join(";");
          check(/\bHttpOnly\b/i.test(attributes) && /SameSite=Lax/i.test(attributes) && /Path=\//i.test(attributes), "Identity cookies remain HttpOnly, same-site, and root scoped");
          if (!value || /Max-Age=0\b/i.test(attributes)) jar.delete(key); else jar.set(key, value);
        }
      }
      return result;
    },
    async ok(route, body, options) { return status(await this.call(route, body, options), 200, route.split("?")[0]); },
  };
}
async function inbox(route) {
  const response = await fetch(`${mailbox.origin}${route}`, { headers: { Authorization: `Bearer ${fixture.readToken}` }, signal: AbortSignal.timeout(5000) });
  check(response.status === 200, "Isolated mailbox is readable with its local credential");
  return response.json();
}
async function deliveredToken(email, purpose, after) {
  const result = await inbox(`/messages?to=${encodeURIComponent(email)}`);
  const record = [...result.messages].reverse().find(message => message.createdAt >= after && message.text.includes(`/account/${purpose}?token=`));
  check(record, `Local SMTP delivered the ${purpose} link`);
  const candidates = record.text.match(/https?:\/\/[^\s<>"']+/g) || [];
  const url = candidates.map(value => new URL(value)).find(value => value.pathname === `/account/${purpose}`);
  check(url?.origin === base && !url.username && !url.password && !url.hash, "Mail link uses the configured isolated site origin");
  const token = url.searchParams.get("token"); check(/^[A-Za-z0-9_-]{43}$/.test(token), "Mail link contains a random single-use token");
  return token;
}
async function verifyEmail(person, email) {
  const started = Date.now(); await person.ok("/api/auth/verify-email/request", {});
  const token = await deliveredToken(email, "verify", started);
  await browser().ok("/api/auth/verify-email/confirm", { token });
  check((await person.ok("/api/auth/me")).user.emailVerified, "Verification updates the existing web session");
  return token;
}
async function connect(person) {
  const code = await person.ok("/api/desktop/pair-code", {});
  const paired = status(await request("/api/desktop/pair", { body: { code: code.code, deviceName: "계정 검증 PC" } }), 200, "Desktop pairing");
  check(/^[A-Za-z0-9_-]{43}$/.test(paired.token), "Device receives a separate scoped token");
  return paired;
}
async function deviceState(device, expected = 200) { return status(await request("/api/desktop/state", { headers: { Authorization: `Bearer ${device.token}` } }), expected, "Device authorization"); }
function dog(state) { return state.puppies.find(puppy => puppy.id === state.selectedId); }
async function fixedAccount(email, displayName) {
  const person = browser(); const registered = await person.call("/api/auth/register", { email, password: originalPassword, displayName });
  if (registered.response.status === 409) await person.ok("/api/auth/login", { email, password: originalPassword });
  else status(registered, 200, "Create retained UI fixture account");
  return person;
}

try {
  const health = await inbox("/health"); equal(health.kind, "puppyruby-isolated-mail", "Real local mail sink is active");
  const a = browser(), b = browser(), stranger = browser();
  const initial = await a.ok("/api/game"); const ownedGuest = a.player;
  check(ownedGuest && !a.session, "Guest starts with a private visitor cookie");
  await a.ok("/api/game/rename", { puppyId: initial.selectedId, value: "계정으로 이어온 루비" });
  const styled = (await a.ok("/api/game/customize", { puppyId: initial.selectedId, fur: "rose", eyes: "blue", accessory: "ribbon" })).state;
  const registered = await a.ok("/api/auth/register", { email: memberEmail, password: originalPassword, displayName: "계정 검증 회원" });
  check(a.session && a.session.length === 43 && a.player !== ownedGuest, "Registration creates a fresh server-session cookie and rotates the guest cookie");
  check(!JSON.stringify(registered).includes(a.session), "Raw web session is absent from registration JSON");
  equal(registered.user.role, "USER", "Email signup cannot self-assign administrator rights");
  check(!registered.user.emailVerified, "A new email account is initially unverified");
  const firstMe = await a.ok("/api/auth/me");
  check(firstMe.config.emailEnabled && !firstMe.config.kakaoEnabled, "Fixture mail is enabled and unconfigured Kakao is disabled");
  const preserved = await a.ok("/api/game"); equal(dog(preserved), dog(styled), "Signup preserves the guest's selected puppy, name, and full appearance");
  phases.push("guest adoption and private cookies");

  const otherGuestState = await b.ok("/api/game"); const otherGuest = b.player;
  await b.ok("/api/auth/login", { email: memberEmail.toUpperCase(), password: originalPassword });
  check(a.session !== b.session, "Independent logins receive distinct web sessions");
  equal((await b.ok("/api/game")).selectedId, initial.selectedId, "Another browser restores the same account puppy");
  equal((await browser({ "puppyruby-player": otherGuest }).ok("/api/game")).selectedId, otherGuestState.selectedId, "Login does not merge unrelated guest puppies");
  const loggedOutSession = browser(a.snapshot()); await a.ok("/api/auth/logout", {});
  check(!a.session, "Logout removes the web session cookie");
  check((await a.ok("/api/game")).selectedId !== initial.selectedId, "Logged-out browser gets a separate guest puppy");
  status(await loggedOutSession.call("/api/auth/me"), 401, "Logged-out session cannot be reused");
  for (const route of ["/api/game", "/api/walk", "/api/desktop/links"])
    status(await browser({ "puppyruby-player": ownedGuest }).call(route), 401, "Old owned guest cookie cannot bypass login");
  const strangerState = await stranger.ok("/api/game");
  const forgedHeaders = { "X-Player-Id": ownedGuest, "X-Session-Token": b.session, Authorization: `Bearer ${b.session}` };
  equal((await stranger.ok("/api/game", undefined, { headers: forgedHeaders })).selectedId, strangerState.selectedId, "Game proxy ignores forged browser identity headers");
  equal((await stranger.ok("/api/auth/me", undefined, { headers: forgedHeaders })).user, null, "Auth proxy ignores a forged session header");
  status(await stranger.call("/api/admin/overview", undefined, { headers: forgedHeaders }), 401, "Admin proxy requires its own session cookie");
  status(await b.call("/api/auth/profile", { displayName: "forbidden" }, { origin: "https://other.invalid" }), 403, "Cross-origin account changes are rejected");
  status(await b.call("/api/auth/profile", { displayName: "forbidden" }, { origin: null }), 403, "Account changes require an explicit same-origin request");
  phases.push("cross-browser restore and identity boundaries");

  const oldWeb = browser(b.snapshot()); const linked = await connect(b);
  const pendingCode = await b.ok("/api/desktop/pair-code", {});
  const changed = await b.ok("/api/auth/password", { currentPassword: originalPassword, newPassword: changedPassword });
  check(changed.logout && !b.session, "Password change signs out the current browser");
  status(await oldWeb.call("/api/auth/me"), 401, "Password change revokes existing web sessions");
  await deviceState(linked, 401);
  status(await request("/api/desktop/pair", { body: { code: pendingCode.code, deviceName: "옛 코드" } }), 400, "Password change revokes pending desktop pairing codes");
  status(await b.call("/api/auth/login", { email: memberEmail, password: originalPassword }), 401, "Previous password no longer logs in");
  await b.ok("/api/auth/login", { email: memberEmail, password: changedPassword });
  equal((await b.ok("/api/game")).selectedId, initial.selectedId, "Password change preserves the account's puppy");
  await verifyEmail(b, memberEmail);
  equal((await b.ok("/api/auth/me")).user.role, "USER", "Verifying a normal email does not grant administrator rights");
  phases.push("password changes and email verification");

  const resetDevice = await connect(b), resetWeb = browser(b.snapshot());
  const resetStarted = Date.now();
  const resetResponse = await browser().ok("/api/auth/password-reset/request", { email: memberEmail });
  const resetToken = await deliveredToken(memberEmail, "reset", resetStarted);
  const unknownEmail = `unknown-${runId}@puppyruby.test`;
  equal((await browser().ok("/api/auth/password-reset/request", { email: unknownEmail })).message, resetResponse.message, "Password-reset responses do not reveal account existence");
  equal((await inbox(`/messages?to=${encodeURIComponent(unknownEmail)}`)).messages.length, 0, "Unknown account produces no email");
  await browser().ok("/api/auth/password-reset/confirm", { token: resetToken, password: originalPassword });
  status(await resetWeb.call("/api/auth/me"), 401, "Password reset revokes all previous web sessions");
  await deviceState(resetDevice, 401);
  status(await browser().call("/api/auth/password-reset/confirm", { token: resetToken, password: originalPassword }), 400, "A consumed password-reset link cannot be replayed");
  await b.ok("/api/auth/login", { email: memberEmail, password: originalPassword });
  equal((await b.ok("/api/game")).selectedId, initial.selectedId, "Reset password restores the same puppy");
  phases.push("SMTP password reset and credential revocation");

  const admin = await fixedAccount(adminEmail, "퍼피루비 관리자");
  const beforeAdmin = await admin.ok("/api/auth/me");
  if (!beforeAdmin.user.emailVerified) {
    equal(beforeAdmin.user.role, "USER", "Configured admin email cannot gain rights before verification");
    status(await admin.call("/api/admin/overview"), 403, "Unverified configured admin is denied");
    await verifyEmail(admin, adminEmail);
  }
  const administrator = (await admin.ok("/api/auth/me")).user;
  equal(administrator.role, "ADMIN", "Only the verified configured email becomes administrator");
  const overview = await admin.ok("/api/admin/overview");
  check(overview.members >= 2 && overview.activeMembers >= 2 && overview.rooms >= 3, "Admin overview reports persisted real account and room counts");
  status(await b.call("/api/admin/overview"), 403, "Normal member cannot open admin overview");
  status(await b.call("/api/admin/members", undefined, { headers: { "X-Session-Token": admin.session } }), 403, "Forged admin header cannot override a member's cookie");
  const members = await admin.ok(`/api/admin/members?query=${encodeURIComponent(memberEmail.toUpperCase())}&page=0`);
  const member = members.items.find(item => item.id === registered.user.id);
  check(member && member.puppyCount >= 1 && member.emailVerified, "Member search is case-insensitive and includes puppy count and verification");
  for (const internal of [ownedGuest, b.session, admin.session]) check(!JSON.stringify(members).includes(internal), "Admin member results omit player credentials and session secrets");
  const nextPage = await admin.ok("/api/admin/members?page=1");
  equal(nextPage.page, 1, "Admin member pagination accepts the requested page");
  status(await admin.call("/api/admin/members?page=-1"), 400, "Negative admin pagination is rejected");
  status(await admin.call(`/api/admin/members/${administrator.id}/status`, { status: "SUSPENDED", reason: "본인 제한 검증" }), 403, "Administrator cannot suspend themselves");
  await admin.ok("/api/admin/overview");
  phases.push("verified administrator, search, pagination, and authorization");

  const suspensionDevice = await connect(b), suspendedWeb = browser(b.snapshot());
  status(await b.call(`/api/admin/members/${member.id}/status`, { status: "SUSPENDED", reason: "권한 검증" }), 403, "Member cannot suspend another account");
  status(await admin.call(`/api/admin/members/${member.id}/status`, { status: "SUSPENDED", reason: "출처 검증" }, { origin: "https://other.invalid" }), 403, "Admin mutation rejects a foreign origin");
  await admin.ok(`/api/admin/members/${member.id}/status`, { status: "SUSPENDED", reason: "격리 검증 중 이용 정지" });
  status(await suspendedWeb.call("/api/game"), 401, "Suspension invalidates existing web authorization");
  status(await browser().call("/api/auth/login", { email: memberEmail, password: originalPassword }), 403, "Suspended account cannot log in");
  await deviceState(suspensionDevice, 401);
  equal((await admin.ok(`/api/admin/members?query=${encodeURIComponent(memberEmail)}`)).items.find(item => item.id === member.id).status, "SUSPENDED", "Admin member list reflects suspension");
  await admin.ok(`/api/admin/members/${member.id}/status`, { status: "ACTIVE", reason: "격리 검증 후 이용 재개" });
  await b.ok("/api/auth/login", { email: memberEmail, password: originalPassword });
  equal((await b.ok("/api/game")).selectedId, initial.selectedId, "Reactivation preserves account ownership");
  await deviceState(suspensionDevice, 401);
  phases.push("suspension, reactivation, and permanent token revocation");

  const privateName = `친구만 보는 이름 ${runId}`;
  await b.ok("/api/walk/profile", { nickname: "검증 회원", age: 28, realName: privateName, photo: null });
  await admin.ok("/api/walk/profile", { nickname: "검증 관리자", age: null, realName: "관리자의 개인 이름", photo: null });
  await b.ok("/api/walk/join", { roomId: "official-meadow" });
  const officialText = `공식 산책방 확인 ${runId}`;
  await b.ok("/api/walk/message", { text: officialText, clientId: randomUUID() });
  const officialMessages = await admin.ok("/api/admin/rooms/official-meadow/messages?page=0");
  check(officialMessages.items.some(message => message.text === officialText), "Admin BFF accepts official room IDs and reads their actual messages");
  const created = await b.ok("/api/walk/create", { title: `관리 검증 ${runId}`, description: "임시 데이터로 검사하는 방", theme: "meadow", capacity: 4 });
  const roomId = created.state.room.id;
  await admin.ok("/api/walk/join", { roomId });
  await new Promise(resolve => setTimeout(resolve, 1100));
  const text = `숨김 검증 메시지 ${runId}`;
  const chatted = await b.ok("/api/walk/message", { text, clientId: randomUUID() });
  const messageId = chatted.state.room.messages.find(message => message.text === text).id;
  const rooms = await admin.ok("/api/admin/rooms?page=0");
  const room = rooms.items.find(item => item.id === roomId);
  check(room && room.ownerLabel === "검증 회원" && room.memberCount === 2, "Admin room overview shows public owner label and active participants");
  const reviewMessages = await admin.ok(`/api/admin/rooms/${roomId}/messages?page=0`);
  check(reviewMessages.items.some(message => message.id === messageId), "Admin message view lists the real sent message");
  check(!JSON.stringify([rooms, reviewMessages]).includes(privateName), "Moderation results do not reveal friend-only real names");
  status(await b.call(`/api/admin/messages/${messageId}/hide`, { reason: "권한 검증" }), 403, "Member cannot hide a message through admin API");
  status(await admin.call(`/api/admin/messages/${messageId}/hide`, { reason: "" }), 400, "Moderation requires a reason");
  await admin.ok(`/api/admin/messages/${messageId}/hide`, { reason: "격리 검증용 메시지 숨김" });
  check(!(await b.ok("/api/walk")).room.messages.some(message => message.id === messageId), "Hidden message disappears from the participant view");
  check(!(await admin.ok(`/api/admin/rooms/${roomId}/messages`)).items.some(message => message.id === messageId), "Hidden message disappears from the moderator's visible list");
  await admin.ok(`/api/admin/rooms/${roomId}/close`, { reason: "격리 검증을 마쳐 산책방 종료" });
  equal((await b.ok("/api/walk")).room, null, "Closing a room returns its owner to the lobby");
  equal((await admin.ok("/api/walk")).room, null, "Closing a room returns another participant to the lobby");
  check(!(await admin.ok("/api/admin/rooms")).items.some(item => item.id === roomId), "Closed room leaves the active admin room list");
  status(await b.call("/api/walk/join", { roomId }), 400, "Closed room cannot be joined again");
  phases.push("official room routes and social moderation");

  const uiMember = await fixedAccount(uiMemberEmail, "루비 가족");
  if (!(await uiMember.ok("/api/auth/me")).user.emailVerified) await verifyEmail(uiMember, uiMemberEmail);
  const uiState = await uiMember.ok("/api/game");
  check(uiState.selectedId, "Retained ordinary member has a puppy for UI verification");
  equal((await admin.ok("/api/auth/me")).user.status, "ACTIVE", "Retained administrator remains active for UI verification");
  equal((await uiMember.ok("/api/auth/me")).user.status, "ACTIVE", "Retained ordinary member remains active for UI verification");
  const report = { passed: true, checks, phases, completedAt: new Date().toISOString(), fixtures: { adminEmail, memberEmail: uiMemberEmail }, externalMailSent: false };
  await mkdir(path.join(root, "backend", "build"), { recursive: true });
  await writeFile(path.join(root, "backend", "build", "account-verification.json"), JSON.stringify(report, null, 2));
  console.log(`PASS ${checks} account/admin checks across ${phases.length} scenarios; local SMTP only. UI fixture accounts remain active.`);
} catch (error) {
  console.error(`FAIL after ${checks} account/admin checks: ${error instanceof Error ? error.message : "Unexpected verifier failure"}`);
  process.exitCode = 1;
}
