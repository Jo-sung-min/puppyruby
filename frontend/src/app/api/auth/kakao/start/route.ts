import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { browserIdentity, cookieOptions, isSameOrigin, privateHeaders, saveGuest } from "@/lib/server-session";
import { KAKAO_STATE_COOKIE, kakaoFailure, publicSiteOrigin } from "@/lib/server-kakao";
import { requestOrigin } from "@/lib/request-origin";

export async function GET(request: NextRequest) {
  if (!isSameOrigin(request)) return kakaoFailure(request, "kakao_invalid_state");
  try {
    const clientId = process.env.KAKAO_REST_API_KEY?.trim();
    const origin = publicSiteOrigin();
    if (!clientId || origin !== requestOrigin(request)) return kakaoFailure(request, "kakao_unavailable");
    const identity = await browserIdentity();
    const state = randomBytes(32).toString("base64url");
    const target = new URL("https://kauth.kakao.com/oauth/authorize");
    target.search = new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: `${origin}/api/auth/kakao/callback`, state }).toString();
    const response = NextResponse.redirect(target);
    for (const [name, value] of Object.entries(privateHeaders)) response.headers.set(name, value);
    response.cookies.set(KAKAO_STATE_COOKIE, `${state}.${identity.playerId}.${Date.now()}`, { ...cookieOptions(request, 600), path: "/api/auth/kakao" });
    if (identity.fresh) saveGuest(response, request, identity.playerId);
    return response;
  } catch { return kakaoFailure(request, "kakao_unavailable"); }
}
