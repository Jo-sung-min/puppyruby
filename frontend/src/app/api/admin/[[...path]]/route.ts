import { NextRequest, NextResponse } from "next/server";
import { apiBase, apiFailure, browserIdentity, clearSession, isSameOrigin, privateHeaders, readJsonBody } from "@/lib/server-session";

async function handle(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  const action = (await context.params).path?.join("/") || "overview";
  const read = /^(overview|appearance|members|rooms|rooms\/[A-Za-z0-9_-]{1,80}\/messages)$/.test(action);
  const write = /^(appearance|members\/[0-9a-f-]{36}\/status|rooms\/[A-Za-z0-9_-]{1,80}\/close|messages\/[0-9a-f-]{36}\/hide)$/.test(action);
  if ((request.method === "GET" && !read) || (request.method === "POST" && !write)) return apiFailure("관리 메뉴를 찾을 수 없어요.", 404);
  if (request.method === "POST" && !isSameOrigin(request, true)) return apiFailure("요청 출처를 확인할 수 없어요.", 403);
  const identity = await browserIdentity();
  if (!identity.hasSession) return apiFailure("관리자 계정으로 로그인해 주세요.", 401);
  let body: Record<string, unknown> | undefined;
  if (request.method === "POST") {
    try { body = await readJsonBody(request, 4096); }
    catch { return apiFailure("입력 내용을 확인해 주세요.", 400); }
  }
  const query = new URLSearchParams();
  if (action === "members") {
    query.set("page", request.nextUrl.searchParams.get("page") || "0");
    query.set("query", (request.nextUrl.searchParams.get("query") || "").slice(0, 100));
  }
  if (action === "rooms" || action.endsWith("/messages")) query.set("page", request.nextUrl.searchParams.get("page") || "0");
  try {
    const upstream = await fetch(`${apiBase()}/admin/${action}${query.size ? `?${query}` : ""}`, {
      method: request.method, headers: identity.headers, body: body ? JSON.stringify(body) : undefined,
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(12000),
    });
    const data = await upstream.json();
    const response = upstream.ok ? NextResponse.json(data, { headers: privateHeaders }) : apiFailure(typeof data.message === "string" ? data.message : "관리 요청을 처리하지 못했어요.", upstream.status);
    if (upstream.status === 401) clearSession(response, request);
    return response;
  } catch { return apiFailure("관리 서비스에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.", 503); }
}

export const GET = handle;
export const POST = handle;
