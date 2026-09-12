import { NextRequest, NextResponse } from "next/server";
import { apiBase, apiFailure, browserIdentity, clearSession, isSameOrigin, privateHeaders, readJsonBody, saveGuest, saveSession } from "@/lib/server-session";

const actions = new Set(["register", "login", "logout", "profile", "password", "verify-email/request", "verify-email/confirm", "password-reset/request", "password-reset/confirm"]);

async function handle(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  const action = (await context.params).path?.join("/") || "me";
  if ((request.method === "GET" && action !== "me") || (request.method === "POST" && !actions.has(action))) return apiFailure("회원 메뉴를 찾을 수 없어요.", 404);
  if (request.method === "POST" && !isSameOrigin(request, true)) return apiFailure("요청 출처를 확인할 수 없어요.", 403);
  let body: Record<string, unknown> | undefined;
  if (request.method === "POST") {
    try { body = await readJsonBody(request); }
    catch { return apiFailure("입력 형식이나 길이를 확인해 주세요.", 400); }
  }
  const identity = await browserIdentity();
  try {
    const upstream = await fetch(`${apiBase()}/auth/${action}`, {
      method: request.method, headers: identity.headers, body: body ? JSON.stringify(body) : undefined,
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000),
    });
    const data = await upstream.json();
    if (!upstream.ok) {
      const response = apiFailure(typeof data.message === "string" ? data.message : "회원 정보를 확인해 주세요.", upstream.status);
      if (upstream.status === 401 && action !== "login") clearSession(response, request);
      return response;
    }
    const { token, expiresAt, ...publicData } = data;
    if (action === "me" && publicData.config) {
      publicData.config.kakaoEnabled = !!publicData.config.kakaoEnabled && !!process.env.KAKAO_REST_API_KEY?.trim();
    }
    const response = NextResponse.json(publicData, { headers: privateHeaders });
    if (action === "login" || action === "register") saveSession(response, request, token, expiresAt);
    else if (action === "logout" || publicData.logout) clearSession(response, request);
    else if (identity.fresh) saveGuest(response, request, identity.playerId);
    return response;
  } catch {
    return apiFailure("회원 서비스에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.", 503);
  }
}

export const GET = handle;
export const POST = handle;
