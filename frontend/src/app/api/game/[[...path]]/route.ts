import { NextRequest, NextResponse } from "next/server";
import { apiBase, browserIdentity, clearSession, isSameOrigin, privateHeaders, saveGuest } from "@/lib/server-session";

const actions = new Set(["adopt", "gift", "select", "feed", "play", "rest", "train", "promote", "customize", "rename", "ask"]);
async function proxy(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await context.params;
  const action = path.join("/");
  if ((request.method === "GET" && action) || (request.method === "POST" && !actions.has(action)))
    return NextResponse.json({ message: "페이지를 찾을 수 없어요." }, { status: 404 });
  if (request.method === "POST" && !isSameOrigin(request))
    return NextResponse.json({ message: "요청 출처를 확인할 수 없어요." }, { status: 403, headers: privateHeaders });
  const identity = await browserIdentity();
  try {
    const body = request.method === "POST" ? await request.text() : undefined;
    if (body && body.length > 2048) return NextResponse.json({ message: "요청이 너무 커요." }, { status: 413 });
    const upstream = await fetch(`${apiBase()}/game${action ? `/${action}` : ""}`, {
      method: request.method,
      headers: identity.headers,
      body, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000),
    });
    const data = await upstream.json();
    const response = NextResponse.json(data, { status: upstream.status, headers: privateHeaders });
    if (upstream.ok && identity.fresh) saveGuest(response, request, identity.playerId);
    if (upstream.status === 401) clearSession(response, request);
    return response;
  } catch {
    return NextResponse.json({ message: "강아지 집에 연결하지 못했어요. 서버 연결 후 다시 시도해 주세요." }, { status: 503 });
  }
}
export const GET = proxy;
export const POST = proxy;
