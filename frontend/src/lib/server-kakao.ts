import { NextRequest, NextResponse } from "next/server";
import { cookieOptions, privateHeaders } from "./server-session";

export const KAKAO_STATE_COOKIE = "puppyruby-kakao-state";

export function publicSiteOrigin() {
  const site = new URL(process.env.PUBLIC_SITE_URL || "http://127.0.0.1:3000");
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(site.hostname);
  if (site.username || site.password || site.search || site.hash || site.pathname !== "/" || (site.protocol !== "https:" && !(site.protocol === "http:" && loopback))) throw new Error("Invalid public site origin");
  return site.origin;
}

export function clearKakaoState(response: NextResponse, request: NextRequest) {
  response.cookies.set(KAKAO_STATE_COOKIE, "", { ...cookieOptions(request, 0), path: "/api/auth/kakao" });
}

export function kakaoFailure(request: NextRequest, code: "kakao_unavailable" | "kakao_cancelled" | "kakao_invalid_state" | "kakao_failed") {
  // A relative redirect keeps the browser on its exact original host.
  const response = new NextResponse(null, { status: 303, headers: { Location: `/account?error=${code}` } });
  for (const [name, value] of Object.entries(privateHeaders)) response.headers.set(name, value);
  clearKakaoState(response, request);
  return response;
}
