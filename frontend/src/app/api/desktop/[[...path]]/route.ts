import { NextRequest, NextResponse } from "next/server";
import { apiBase, browserIdentity, clearSession, isSameOrigin, saveGuest } from "@/lib/server-session";
import { attachDesktopAppearance } from "@/lib/desktop-appearance";

const browserMethods: Record<string, string> = { links: "GET", "pair-code": "POST", revoke: "POST" };
const deviceMethods: Record<string, string> = { pair: "POST", state: "GET", action: "POST" };
const noStore = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie, Authorization, X-PuppyRuby-Appearance-Version" };
const failure = (message: string, status: number) => NextResponse.json({ message }, { status, headers: noStore });

async function proxy(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await context.params;
  const action = path.join("/");
  const browserOnly = Object.hasOwn(browserMethods, action);
  if ((browserMethods[action] || deviceMethods[action]) !== request.method) return failure("연결 경로를 찾을 수 없어요.", 404);
  if (request.method === "POST" && !isSameOrigin(request)) return failure("요청 출처를 확인할 수 없어요.", 403);

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  let newPlayer: string | undefined;
  if (browserOnly) {
    const identity = await browserIdentity();
    Object.assign(headers, identity.headers);
    if (identity.fresh) newPlayer = identity.playerId;
  } else if (action !== "pair") {
    const bearer = request.headers.get("authorization") || "";
    if (!/^Bearer [A-Za-z0-9_-]{40,100}$/.test(bearer)) return failure("강아지 연결이 만료됐어요. 새 코드로 다시 연결해 주세요.", 401);
    headers.Authorization = bearer;
  }

  let body: string | undefined;
  if (request.method === "POST") {
    if (!request.body) return failure("연결 정보를 입력해 주세요.", 400);
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        length += part.value.byteLength;
        if (length > 4096) { await reader.cancel(); return failure("입력 내용이 너무 길어요.", 413); }
        chunks.push(part.value);
      }
      body = Buffer.concat(chunks).toString("utf8");
      const value: unknown = JSON.parse(body);
      if (!value || typeof value !== "object" || Array.isArray(value)) return failure("입력 내용을 확인해 주세요.", 400);
    } catch { return failure("입력 내용을 확인해 주세요.", 400); }
    finally { reader.releaseLock(); }
  }
  try {
    const upstream = await fetch(`${apiBase()}/desktop/${action}`, {
      method: request.method, headers, body, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(12000),
    });
    const raw = await upstream.json();
    const requestedVersion = request.headers.get("x-puppyruby-appearance-version") ?? "1";
    const appearanceVersion = /^\d{1,3}$/.test(requestedVersion) ? Number(requestedVersion) : 1;
    const data = upstream.ok && !browserOnly ? await attachDesktopAppearance(raw, action, request.nextUrl.origin, apiBase(), undefined, appearanceVersion) : raw;
    const response = NextResponse.json(data, { status: upstream.status, headers: noStore });
    if (upstream.ok && newPlayer) saveGuest(response, request, newPlayer);
    if (browserOnly && upstream.status === 401) clearSession(response, request);
    return response;
  } catch { return failure("강아지 서버에 연결하지 못했어요. 잠시 후 다시 확인해 주세요.", 503); }
}
export const GET = proxy;
export const POST = proxy;
