import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Disposable BFF integration only. Never calls Toss or a production backend.
// PUPPY_TEST_ISOLATED=1 node scripts/verify-commerce.mjs
// The server must use its own DB, local SMTP fixture, ADMIN_EMAIL=admin@puppyruby.test,
// PUBLIC_SITE_URL matching PUPPY_TEST_URL, and NO payment credentials.
assert.equal(process.env.PUPPY_TEST_ISOLATED, "1", "Set PUPPY_TEST_ISOLATED=1 for the disposable commerce verifier.");
const target = new URL(process.env.PUPPY_TEST_URL || "http://localhost:3101");
assert.equal(target.protocol, "http:"); assert.ok(["localhost", "127.0.0.1"].includes(target.hostname));
assert.equal(target.port, "3101"); assert.equal(target.pathname, "/"); assert.equal(target.search, "");
assert.equal(target.hash, ""); assert.equal(target.username, ""); assert.equal(target.password, "");
const base = target.origin;
const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = JSON.parse(await readFile(path.join(workspace, "backend/build/account-fixture.json"), "utf8"));
const mailbox = new URL(fixture.httpUrl);
assert.equal(mailbox.protocol, "http:"); assert.equal(mailbox.hostname, "127.0.0.1");
assert.equal(mailbox.username, ""); assert.equal(mailbox.password, ""); assert.match(fixture.readToken, /^[A-Za-z0-9_-]{43}$/);
const adminEmail = "admin@puppyruby.test", memberEmail = `commerce-${randomUUID().slice(0, 8)}@puppyruby.test`;
const password = "Puppy-Commerce-Test-2026!";
let checks = 0;
const equal = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };
const check = (condition, label) => { assert.ok(condition, label); checks++; };
function person() {
  const cookies = new Map();
  return { async call(route, body, expected = 200, extra = {}) {
    assert.ok(route.startsWith("/api/") && !route.includes("://"));
    const headers = { "Content-Type": "application/json", Origin: base, Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join("; "), ...extra };
    for (const key of Object.keys(headers)) if (headers[key] === null) delete headers[key];
    const response = await fetch(base + route, { method: body === undefined ? "GET" : "POST", redirect: "manual",
      headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20_000) });
    const data = await response.json();
    equal(response.status, expected, `${route} expected ${expected}`);
    check(response.headers.get("cache-control")?.includes("no-store"), `${route} does not cache account/configuration data`);
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";")[0], separator = pair.indexOf("="), key = pair.slice(0, separator), value = pair.slice(separator + 1);
      if (key === "puppyruby-session" && value) {
        check(/;\s*HttpOnly/i.test(cookie), "Session remains HttpOnly");
        check(/;\s*SameSite=Lax/i.test(cookie), "Session remains SameSite Lax");
      }
      if (value) cookies.set(key, value); else cookies.delete(key);
    }
    if (route.startsWith("/api/auth/")) {
      check(!Object.hasOwn(data, "token") && !Object.hasOwn(data, "expiresAt"), "BFF never exposes the session token");
    }
    return data;
  } };
}
function input(catalog, salesEnabled = catalog.salesEnabled) {
  return { expectedRevision: catalog.revision, salesEnabled,
    products: catalog.products.map(product => ({ id: product.id, price: product.price, enabled: product.enabled })),
    pools: catalog.pools.map(pool => ({ kind: pool.kind, entries: pool.entries.map(entry => ({ id: entry.id, weight: entry.weight })) })) };
}
function publicShape(catalog) {
  equal(Object.keys(catalog).sort(), ["pools", "products", "revision", "salesEnabled", "updatedAt"], "Public catalog has only approved fields");
  equal(catalog.products.map(product => product.id), ["dog-1", "dog-10", "aura-1", "aura-10", "accessory-1", "accessory-10"], "Six fixed products");
  equal(catalog.pools.map(pool => pool.kind), ["dog", "aura", "accessory"], "Three fixed kinds");
  equal(catalog.pools.map(pool => pool.entries.length), [24, 8, 7], "All finite reward entries are disclosed");
  for (const product of catalog.products) {
    equal(Object.keys(product).sort(), ["enabled", "id", "kind", "name", "price", "quantity"], "Product fields are public only");
    check(Number.isSafeInteger(product.price) && product.price >= 100, "Server price is valid");
  }
  for (const pool of catalog.pools) {
    check(pool.entries.reduce((total, entry) => total + entry.weight, 0) > 0, "Every pool can award an entry");
    const total = pool.entries.reduce((sum, entry) => sum + Number(entry.probability.replace("%", "")), 0);
    check(Math.abs(total - 100) < 0.0001, "Rounded public odds total 100%");
    for (const entry of pool.entries) {
      equal(Object.keys(entry).sort(), ["breed", "grade", "id", "itemId", "label", "probability", "weight"], "Entry fields match the public contract");
      check(Number.isInteger(entry.weight) && entry.weight >= 0 && entry.weight <= 1_000_000, "Finite relative weight");
      check(/^(\d+)(\.\d{1,6})?%$/.test(entry.probability), "Probability is a percent string");
    }
  }
}

const guest = person(), member = person(), admin = person();
const config = await guest.call("/api/payments/config");
// Fail closed before any payment-related POST: this verifier must never contact a provider.
equal(config.enabled, false, "Payment provider MUST be disabled on the isolated server");
equal(config.mode, "disabled", "No live or test provider is allowed"); equal(config.clientKey, null, "No provider key is published");
const authConfig = await guest.call("/api/auth/me");
equal(authConfig.config.emailEnabled, true, "Disposable server is configured for the local SMTP sink");
const initial = await guest.call("/api/commerce/catalog"); publicShape(initial);
equal(initial.salesEnabled, false, "Disposable catalog starts with sales closed");
await guest.call("/api/commerce/catalog", {}, 404);
for (const route of ["/api/commerce/me", "/api/payments/orders", "/api/admin/commerce/catalog"]) await guest.call(route, undefined, 401);
for (const route of ["/api/commerce/draw", "/api/commerce/equip", "/api/payments/orders", "/api/admin/commerce/catalog"])
  await guest.call(route, {}, 401, { "X-Player-Id": randomUUID(), "X-Session-Token": "x".repeat(43) });
await member.call("/api/auth/register", { email: memberEmail, password, displayName: "상점 검증 회원" });
await member.call("/api/admin/commerce/catalog", undefined, 403);
await member.call("/api/admin/commerce/catalog", input(initial, true), 403);
await admin.call("/api/auth/register", { email: adminEmail, password, displayName: "상점 검증 관리자" });
await admin.call("/api/admin/commerce/catalog", undefined, 403);
await admin.call("/api/auth/verify-email/request", {});
const response = await fetch(`${mailbox.origin}/messages?to=${encodeURIComponent(adminEmail)}`, {
  headers: { Authorization: `Bearer ${fixture.readToken}` }, signal: AbortSignal.timeout(5000), redirect: "error" });
equal(response.status, 200, "Local SMTP fixture is readable");
const inbox = await response.json();
const email = [...inbox.messages].reverse().find(message => message.text.includes("/account/verify?token="));
check(email, "Administrator verification mail reached the local sink");
const verification = email.text.match(/https?:\/\/[^\s<>"']+/g)?.map(value => new URL(value)).find(value => value.pathname === "/account/verify");
equal(verification?.origin, base, "Verification URL targets this isolated frontend");
await guest.call("/api/auth/verify-email/confirm", { token: verification.searchParams.get("token") });
equal((await admin.call("/api/auth/me")).user.role, "ADMIN", "Existing verified session acquires administrator permission");
equal(await admin.call("/api/admin/commerce/catalog"), initial, "Rejected writes did not mutate catalog");
const before = await member.call("/api/game");
const wallet = await member.call("/api/commerce/me");
equal(wallet, { tickets: { dog: 0, aura: 0, accessory: 0 }, items: [], history: [], balanceHold: false }, "New account has no paid entitlements");
await member.call("/api/commerce/draw", { kind: "dog", requestId: randomUUID(), catalogRevision: initial.revision }, 400);
await member.call("/api/commerce/equip", { puppyId: before.selectedId, kind: "aura", itemId: "starlight" }, 400);
const blockedAdoption = await member.call("/api/game/adopt", {}, 400);
check(blockedAdoption.message.includes("뽑기권"), "Old heart adoption directs the user to tickets");
const after = await member.call("/api/game");
equal(after.coins, before.coins, "Blocked adoption preserves hearts"); equal(after.puppies, before.puppies, "Blocked adoption preserves puppies");

let current = initial;
try {
  const changed = input(current, true); changed.products[0].price = 1900;
  for (const entry of changed.pools.find(pool => pool.kind === "dog").entries) entry.weight = entry.id === "dog-0-SSR" ? 1 : 0;
  current = await admin.call("/api/admin/commerce/catalog", changed);
  equal(current.revision, initial.revision + 1, "Saving advances one catalog revision");
  equal(current.products[0].price, 1900, "Administrator price is persisted"); equal(current.salesEnabled, true, "Administrator can open catalog sales");
  equal(current.pools[0].entries.find(entry => entry.id === "dog-0-SSR").probability, "100%", "Published odds reflect the saved weights");
  equal(await guest.call("/api/commerce/catalog"), current, "Public BFF sees the same saved catalog"); publicShape(current);
  await admin.call("/api/admin/commerce/catalog", changed, 409);
  for (const mutate of [
    body => { delete body.expectedRevision; }, body => { body.extra = true; }, body => { body.salesEnabled = null; },
    body => { body.products[0].price = 99; }, body => { body.products[0].price = 1_000_001; }, body => { body.products[0].price = "1900"; },
    body => { body.products[0].id = "foreign"; }, body => { body.products[0].quantity = 100; }, body => { body.products.pop(); },
    body => { body.pools[0].entries[0].weight = -1; }, body => { body.pools[0].entries[0].weight = 1_000_001; },
    body => { body.pools[0].entries[0].weight = 0.5; }, body => { body.pools[0].entries[0].id = "dog-99-SSR"; },
    body => { body.pools[0].entries.forEach(entry => { entry.weight = 0; }); }, body => { body.pools[0].entries.pop(); },
    body => { body.pools[0].kind = "unknown"; }, body => { body.expectedRevision = -1; },
  ]) { const bad = input(current); mutate(bad); await admin.call("/api/admin/commerce/catalog", bad, 400); }
  const aliasOrigin = `http://${target.hostname === "localhost" ? "127.0.0.1" : "localhost"}:3101`;
  for (const extra of [{ Origin: "https://attacker.example" }, { Origin: aliasOrigin }, { Origin: null }, { "Sec-Fetch-Site": "cross-site" }]) {
    await admin.call("/api/admin/commerce/catalog", input(current), 403, extra);
    await member.call("/api/commerce/draw", { kind: "dog", requestId: randomUUID(), catalogRevision: current.revision }, 403, extra);
  }
  await member.call("/api/admin/commerce/catalog", input(current), 403, { "X-Session-Token": "x".repeat(43), "X-Player-Id": randomUUID() });
  equal(await guest.call("/api/commerce/catalog"), current, "Invalid, stale, and cross-origin requests leave settings unchanged");
  // Even when sales are open, absent provider credentials must stop before Toss is contacted.
  await member.call("/api/payments/orders", { productId: "dog-1", requestId: randomUUID(), catalogRevision: current.revision, termsAccepted: true }, 503);
  await member.call("/api/payments/confirm", { orderId: "unconfigured-order", paymentKey: "unconfigured-key", amount: 1900 }, 503);
  equal((await member.call("/api/payments/orders")).orders, [], "Disabled provider creates no orders");
  equal(await member.call("/api/commerce/me"), wallet, "Rejected purchase/draw/equip never grant entitlements");
} finally {
  const latest = await admin.call("/api/admin/commerce/catalog");
  const restore = input(initial, false); restore.expectedRevision = latest.revision;
  current = await admin.call("/api/admin/commerce/catalog", restore);
}
equal(current.salesEnabled, false, "Disposable verification leaves sales closed");
equal(current.products, initial.products, "Initial prices and product switches are restored");
equal(current.pools, initial.pools, "Initial probability tables are restored");
await writeFile(path.join(workspace, "backend/build/commerce-verification.json"), JSON.stringify({
  base, checkedAt: new Date().toISOString(), checks, catalogRevision: current.revision, externalPayments: false,
  fixture: { adminEmail, memberEmail, password },
}, null, 2));
console.log(`PASS: ${checks} isolated commerce BFF checks. No external payment calls; sales left closed.`);
