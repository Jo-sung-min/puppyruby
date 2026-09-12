import { NextRequest, NextResponse } from "next/server";
import { apiBase, apiFailure, browserIdentity, clearSession, isSameOrigin, privateHeaders, readJsonBody } from "./server-session";

export async function commerceProxy(request: NextRequest, area: "commerce" | "payments", action: string) {
  const publicRead = request.method === "GET" && (area === "commerce" ? action === "catalog" : action === "config");
  const allowedRead = area === "commerce" ? /^(catalog|me)$/ : /^(config|orders)$/;
  const allowedWrite = area === "commerce" ? /^(draw|equip)$/ : /^(orders|confirm|orders\/[A-Za-z0-9_-]{6,64}\/reconcile)$/;
  if (!(request.method === "GET" ? allowedRead : allowedWrite).test(action)) return apiFailure("메뉴를 찾을 수 없어요.", 404);
  if (request.method === "POST" && !isSameOrigin(request, true)) return apiFailure("요청 출처를 확인할 수 없어요.", 403);
  const identity = publicRead ? null : await browserIdentity();
  if (identity && !identity.hasSession) return apiFailure("로그인한 뒤 이용해 주세요.", 401);
  let body: Record<string, unknown> | undefined;
  if (request.method === "POST") {
    try { body = await readJsonBody(request, 4096); }
    catch { return apiFailure("입력 내용을 확인해 주세요.", 400); }
  }
  try {
    const upstream = await fetch(`${apiBase()}/${area}/${action}`, {
      method: request.method, headers: identity?.headers ?? { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined, cache: "no-store", redirect: "error",
      signal: AbortSignal.timeout(area === "payments" ? 45000 : 15000),
    });
    const data = await upstream.json();
    const response = upstream.ok ? NextResponse.json(data, { headers: privateHeaders })
      : apiFailure(typeof data.message === "string" ? data.message : "요청을 처리하지 못했어요.", upstream.status);
    if (!publicRead && upstream.status === 401) clearSession(response, request);
    return response;
  } catch { return apiFailure(area === "payments" ? "결제 상태를 확인하지 못했어요. 구매 내역에서 다시 확인해 주세요." : "상점에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.", 503); }
}
