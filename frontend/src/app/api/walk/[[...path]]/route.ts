import { NextRequest, NextResponse } from "next/server";
import { apiBase, browserIdentity, clearSession, isSameOrigin, saveGuest } from "@/lib/server-session";

const actions = new Set(["profile", "create", "join", "leave", "message", "move", "friend-request", "friend-accept", "friend-decline", "friend-remove"]);
const noStore = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" };
const failure = (message: string, status: number) => NextResponse.json({ message }, { status, headers: noStore });

async function proxy(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await context.params;
  const action = path.join("/");
  if ((request.method === "GET" && action) || (request.method === "POST" && !actions.has(action)))
    return failure("산책길을 찾을 수 없어요.", 404);
  if (request.method === "POST" && !isSameOrigin(request)) return failure("요청 출처를 확인할 수 없어요.", 403);
  const identity = await browserIdentity();
  let body: string | undefined;
  if (request.method === "POST" && request.body) {
    const reader = request.body.getReader();
    const limit = action === "profile" ? 220_000 : 4_096;
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        length += chunk.value.byteLength;
        if (length > limit) { await reader.cancel(); return failure("사진이나 입력 내용이 너무 커요.", 413); }
        chunks.push(chunk.value);
      }
      body = Buffer.concat(chunks).toString("utf8");
      const parsed: unknown = JSON.parse(body);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return failure("입력 내용을 확인해 주세요.", 400);
    } catch { return failure("입력 내용을 확인해 주세요.", 400); }
    finally { reader.releaseLock(); }
  }
  try {
    const upstream = await fetch(`${apiBase()}/walk${action ? `/${action}` : ""}`, {
      method: request.method, headers: identity.headers,
      body, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000),
    });
    const data = await upstream.json();
    const response = NextResponse.json(data, { status: upstream.status, headers: noStore });
    if (upstream.ok && identity.fresh) saveGuest(response, request, identity.playerId);
    if (upstream.status === 401) clearSession(response, request);
    return response;
  } catch { return failure("산책길에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.", 503); }
}
export const GET = proxy;
export const POST = proxy;
