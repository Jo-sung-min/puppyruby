import { NextResponse } from "next/server";
import { apiBase, apiFailure } from "@/lib/server-session";
import { parseSeoConfig } from "@/lib/seo";

export async function GET() {
  try {
    const upstream = await fetch(`${apiBase()}/seo`, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000) });
    if (!upstream.ok) return apiFailure("검색 노출 설정을 불러오지 못했어요.", 503);
    return NextResponse.json(parseSeoConfig(await upstream.json()), { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch { return apiFailure("검색 노출 설정을 불러오지 못했어요.", 503); }
}
