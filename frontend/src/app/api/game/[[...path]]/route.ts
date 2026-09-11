import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";

const actions = new Set(["adopt", "gift", "select", "feed", "play", "rest", "train", "promote", "customize", "rename"]);
async function proxy(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await context.params;
  const action = path.join("/");
  if ((request.method === "GET" && action) || (request.method === "POST" && !actions.has(action)))
    return NextResponse.json({ message: "페이지를 찾을 수 없어요." }, { status: 404 });
  if (request.method === "POST") {
    const origin = request.headers.get("origin");
    const host = request.headers.get("host");
    if (origin && new URL(origin).host !== host)
      return NextResponse.json({ message: "요청 출처를 확인할 수 없어요." }, { status: 403 });
  }
  const jar = await cookies();
  const stored = jar.get("puppyruby-player")?.value;
  const playerId = stored && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(stored) ? stored : randomUUID();
  try {
    const body = request.method === "POST" ? await request.text() : undefined;
    if (body && body.length > 2048) return NextResponse.json({ message: "요청이 너무 커요." }, { status: 413 });
    const upstream = await fetch(`${process.env.API_URL || "http://127.0.0.1:8081/api/v1"}/game${action ? `/${action}` : ""}`, {
      method: request.method,
      headers: { "Content-Type": "application/json", "X-Player-Id": playerId },
      body, cache: "no-store", signal: AbortSignal.timeout(10000),
    });
    const data = await upstream.json();
    const response = NextResponse.json(data, { status: upstream.status, headers: { "Cache-Control": "no-store" } });
    if (upstream.ok) response.cookies.set("puppyruby-player", playerId, {
      httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:",
      path: "/", maxAge: 60 * 60 * 24 * 365,
    });
    return response;
  } catch {
    return NextResponse.json({ message: "강아지 집에 연결하지 못했어요. 서버 연결 후 다시 시도해 주세요." }, { status: 503 });
  }
}
export const GET = proxy;
export const POST = proxy;
