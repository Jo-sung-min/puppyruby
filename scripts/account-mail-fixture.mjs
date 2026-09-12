import net from "node:net";
import http from "node:http";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// A disposable SMTP sink. It only accepts @puppyruby.test recipients, never relays,
// and keeps messages in memory. The separately authenticated HTTP API is read-only.
if (process.env.PUPPY_TEST_ISOLATED !== "1") throw new Error("Set PUPPY_TEST_ISOLATED=1 before starting the isolated mail fixture.");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const metadataPath = path.join(root, "backend", "build", "account-fixture.json");
const maximumMessage = 262_144;
const recipients = /^[A-Za-z0-9._%+-]+@puppyruby\.test$/i;
const messages = [];
const connections = new Set();
const readToken = randomBytes(32).toString("base64url");
let stopping = false;

function quotedPrintable(value) {
  const compact = value.replace(/=\r?\n/g, "");
  const bytes = [];
  for (let index = 0; index < compact.length; index++) {
    if (compact[index] === "=" && /^[0-9a-f]{2}$/i.test(compact.slice(index + 1, index + 3))) {
      bytes.push(Number.parseInt(compact.slice(index + 1, index + 3), 16)); index += 2;
    } else bytes.push(compact.charCodeAt(index) & 255);
  }
  return Buffer.from(bytes).toString("utf8");
}
function headerText(value) {
  return value.replace(/=\?utf-8\?([bq])\?([^?]*)\?=/gi, (_, kind, encoded) => kind.toLowerCase() === "b"
    ? Buffer.from(encoded, "base64").toString("utf8") : quotedPrintable(encoded.replace(/_/g, " ")));
}
function parseMessage(raw, to) {
  const boundary = raw.indexOf("\r\n\r\n");
  const header = boundary < 0 ? "" : raw.slice(0, boundary);
  let text = boundary < 0 ? raw : raw.slice(boundary + 4);
  const headers = new Map();
  for (const line of header.replace(/\r\n[ \t]+/g, " ").split("\r\n")) {
    const colon = line.indexOf(":");
    if (colon > 0) headers.set(line.slice(0, colon).toLowerCase(), line.slice(colon + 1).trim());
  }
  const transfer = (headers.get("content-transfer-encoding") || "").toLowerCase();
  if (transfer === "base64") text = Buffer.from(text.replace(/\s/g, ""), "base64").toString("utf8");
  else if (transfer === "quoted-printable") text = quotedPrintable(text);
  else text = Buffer.from(text, "latin1").toString("utf8");
  return { id: randomUUID(), to: [...to], createdAt: Date.now(), subject: headerText(headers.get("subject") || ""), text };
}

const smtp = net.createServer(socket => {
  if (connections.size >= 16) { socket.end("421 Too many test connections\r\n"); return; }
  connections.add(socket); socket.setEncoding("latin1"); socket.setTimeout(15_000);
  let buffer = "", from = false, to = [], data = false, lines = [], bytes = 0;
  const reset = () => { from = false; to = []; data = false; lines = []; bytes = 0; };
  const reply = value => socket.write(value + "\r\n");
  socket.on("timeout", () => socket.destroy()); socket.on("error", () => {});
  socket.on("close", () => connections.delete(socket));
  socket.on("data", chunk => {
    buffer += chunk;
    if (buffer.length > maximumMessage + 4096) { socket.end("552 Test message is too large\r\n"); return; }
    for (;;) {
      const end = buffer.indexOf("\n"); if (end < 0) break;
      const line = buffer.slice(0, end).replace(/\r$/, ""); buffer = buffer.slice(end + 1);
      if (data) {
        if (line === ".") {
          messages.push(parseMessage(lines.join("\r\n"), to));
          if (messages.length > 100) messages.shift();
          reset(); reply("250 Test message stored in memory"); continue;
        }
        const content = line.startsWith("..") ? line.slice(1) : line;
        bytes += content.length + 2;
        if (bytes > maximumMessage) { socket.end("552 Test message is too large\r\n"); return; }
        lines.push(content); continue;
      }
      if (/^(EHLO|HELO)\b/i.test(line)) { reset(); reply("250-localhost\r\n250-SIZE 262144\r\n250 8BITMIME"); }
      else if (/^MAIL FROM:\s*<[^>]*>/i.test(line)) { reset(); from = true; reply("250 Sender accepted"); }
      else if (/^RCPT TO:/i.test(line)) {
        const recipient = /^RCPT TO:\s*<([^>]+)>\s*$/i.exec(line)?.[1]?.toLowerCase();
        if (!from) reply("503 MAIL is required first");
        else if (!recipient || !recipients.test(recipient) || to.length >= 5) reply("550 Only disposable puppyruby.test recipients are allowed");
        else { to.push(recipient); reply("250 Test recipient accepted"); }
      }
      else if (/^DATA$/i.test(line)) {
        if (!from || !to.length) reply("503 A test recipient is required first");
        else { data = true; reply("354 End the test message with a single period"); }
      }
      else if (/^RSET$/i.test(line)) { reset(); reply("250 Reset"); }
      else if (/^NOOP$/i.test(line)) reply("250 OK");
      else if (/^QUIT$/i.test(line)) { socket.end("221 Bye\r\n"); return; }
      else reply("502 Unsupported test SMTP command");
    }
  });
  reply("220 localhost PuppyRuby isolated mail sink");
});

const inbox = http.createServer((request, response) => {
  response.setHeader("Cache-Control", "no-store"); response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("X-Content-Type-Options", "nosniff");
  const finish = (status, value) => { response.writeHead(status); response.end(JSON.stringify(value)); };
  if (request.method !== "GET") return finish(405, { message: "Read-only fixture" });
  const expectedHost = `127.0.0.1:${inbox.address().port}`;
  if (request.headers.host !== expectedHost || request.socket.remoteAddress !== "127.0.0.1") return finish(403, { message: "Loopback only" });
  const supplied = Buffer.from(request.headers.authorization || "");
  const expected = Buffer.from(`Bearer ${readToken}`);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return finish(401, { message: "Fixture reader credential required" });
  const url = new URL(request.url, `http://${expectedHost}`);
  if (url.pathname === "/health") return finish(200, { ok: true, kind: "puppyruby-isolated-mail" });
  if (url.pathname !== "/messages") return finish(404, { message: "Unknown fixture resource" });
  const to = (url.searchParams.get("to") || "").toLowerCase();
  if (!recipients.test(to)) return finish(400, { message: "A disposable test recipient is required" });
  return finish(200, { messages: messages.filter(message => message.to.includes(to)) });
});

async function listen(server) { await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); }); }
async function stop() {
  if (stopping) return; stopping = true;
  for (const socket of connections) socket.destroy();
  await Promise.all([new Promise(resolve => smtp.close(resolve)), new Promise(resolve => inbox.close(resolve))]);
  try { const saved = JSON.parse(await readFile(metadataPath, "utf8")); if (saved.pid === process.pid) await unlink(metadataPath); } catch {}
}

try {
  try {
    const previous = JSON.parse(await readFile(metadataPath, "utf8"));
    if (Number.isInteger(previous.pid)) {
      let alive = false; try { process.kill(previous.pid, 0); alive = true; } catch {}
      if (alive) throw new Error("A fixture process from the metadata file is still running.");
    }
  } catch (error) { if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error; }
  await listen(smtp); await listen(inbox);
  await mkdir(path.dirname(metadataPath), { recursive: true });
  await writeFile(metadataPath, JSON.stringify({ version: 1, pid: process.pid, smtpHost: "127.0.0.1", smtpPort: smtp.address().port,
    httpUrl: `http://127.0.0.1:${inbox.address().port}`, readToken, startedAt: Date.now() }, null, 2), { mode: 0o600 });
  console.log("Isolated account mail fixture ready; configuration saved locally, messages remain in memory.");
  process.on("SIGINT", () => { stop().finally(() => process.exit(0)); });
  process.on("SIGTERM", () => { stop().finally(() => process.exit(0)); });
} catch {
  await stop(); console.error("Could not start the isolated account mail fixture. Check for an existing fixture process."); process.exitCode = 1;
}
