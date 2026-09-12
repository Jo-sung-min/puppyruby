import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
export { isSameOrigin } from "./request-origin";

export const SESSION_COOKIE = "puppyruby-session";
export const PLAYER_COOKIE = "puppyruby-player";
export const privateHeaders = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie", "Referrer-Policy": "no-referrer" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function apiBase() {
  return (process.env.API_URL || "http://127.0.0.1:8081/api/v1").replace(/\/$/, "");
}

export async function browserIdentity() {
  const jar = await cookies();
  const stored = jar.get(PLAYER_COOKIE)?.value;
  const playerId = stored && uuid.test(stored) ? stored : randomUUID();
  const session = jar.get(SESSION_COOKIE)?.value;
  const headers: Record<string, string> = { "Content-Type": "application/json", "X-Player-Id": playerId };
  // Never forward identity or session headers supplied by a browser caller.
  if (session) headers["X-Session-Token"] = /^[A-Za-z0-9_-]{43}$/.test(session) ? session : "invalid";
  return { headers, playerId, fresh: playerId !== stored, hasSession: !!session };
}

export function cookieOptions(request: NextRequest, maxAge: number) {
  return { httpOnly: true, sameSite: "lax" as const, secure: request.nextUrl.protocol === "https:", path: "/", maxAge };
}

export function saveGuest(response: NextResponse, request: NextRequest, playerId: string) {
  response.cookies.set(PLAYER_COOKIE, playerId, cookieOptions(request, 365 * 24 * 60 * 60));
}

export function clearSession(response: NextResponse, request: NextRequest) {
  response.cookies.set(SESSION_COOKIE, "", cookieOptions(request, 0));
  saveGuest(response, request, randomUUID());
}

export function saveSession(response: NextResponse, request: NextRequest, token: string, expiresAt: number) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token) || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) throw new Error("Invalid session response");
  const lifetime = Math.min(7 * 24 * 60 * 60, Math.floor((expiresAt - Date.now()) / 1000));
  response.cookies.set(SESSION_COOKIE, token, cookieOptions(request, lifetime));
  // A registered player's old guest cookie must never authorize a signed-out browser.
  saveGuest(response, request, randomUUID());
}

export async function readJsonBody(request: NextRequest, limit = 8192): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new Error("JSON 형식으로 입력해 주세요.");
  if (!request.body) throw new Error("입력 내용을 확인해 주세요.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Error("입력 내용이 너무 길어요."); }
      chunks.push(part.value);
    }
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("입력 내용을 확인해 주세요.");
    return value as Record<string, unknown>;
  } finally { reader.releaseLock(); }
}

export function apiFailure(message: string, status: number) {
  return NextResponse.json({ message }, { status, headers: privateHeaders });
}
