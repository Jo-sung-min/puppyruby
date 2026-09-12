import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { apiBase, privateHeaders, saveSession } from "@/lib/server-session";
import { KAKAO_STATE_COOKIE, clearKakaoState, kakaoFailure, publicSiteOrigin } from "@/lib/server-kakao";
import { requestOrigin } from "@/lib/request-origin";

export async function GET(request: NextRequest) {
  const stored = (await cookies()).get(KAKAO_STATE_COOKIE)?.value || "";
  const [expected, playerId, issued] = stored.split(".");
  const state = request.nextUrl.searchParams.get("state") || "";
  const valid = /^[A-Za-z0-9_-]{43}$/.test(expected || "") && /^[A-Za-z0-9_-]{43}$/.test(state)
    && /^[0-9a-f-]{36}$/i.test(playerId || "") && Number.isFinite(Number(issued))
    && Date.now() - Number(issued) >= 0 && Date.now() - Number(issued) < 600_000;
  if (!valid || !timingSafeEqual(Buffer.from(expected), Buffer.from(state))) return kakaoFailure(request, "kakao_invalid_state");
  if (request.nextUrl.searchParams.has("error")) return kakaoFailure(request, "kakao_cancelled");
  const code = request.nextUrl.searchParams.get("code");
  if (!code || code.length > 2048) return kakaoFailure(request, "kakao_failed");
  try {
    const origin = publicSiteOrigin();
    if (origin !== requestOrigin(request)) return kakaoFailure(request, "kakao_unavailable");
    const upstream = await fetch(`${apiBase()}/auth/kakao`, {
      method: "POST", headers: { "Content-Type": "application/json", "X-Player-Id": playerId },
      body: JSON.stringify({ code, redirectUri: `${origin}/api/auth/kakao/callback` }),
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000),
    });
    if (!upstream.ok) return kakaoFailure(request, "kakao_failed");
    const data = await upstream.json();
    const response = NextResponse.redirect(new URL("/account/me?connected=kakao", origin), 303);
    for (const [name, value] of Object.entries(privateHeaders)) response.headers.set(name, value);
    saveSession(response, request, data.token, data.expiresAt);
    clearKakaoState(response, request);
    return response;
  } catch { return kakaoFailure(request, "kakao_failed"); }
}
