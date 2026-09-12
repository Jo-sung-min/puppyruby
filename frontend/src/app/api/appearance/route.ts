import { NextResponse } from "next/server";
import { apiBase, apiFailure } from "@/lib/server-session";
import { parseAppearance } from "@/lib/dog-appearance";

export async function GET() {
  try {
    // Appearance is public. Do not send player identities or account sessions upstream.
    const upstream = await fetch(`${apiBase()}/appearance`, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000) });
    if (!upstream.ok) return apiFailure("도트 설정을 불러오지 못했어요.", 503);
    return NextResponse.json(parseAppearance(await upstream.json()), { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch { return apiFailure("도트 설정을 불러오지 못했어요. 잠시 후 다시 확인해 주세요.", 503); }
}
