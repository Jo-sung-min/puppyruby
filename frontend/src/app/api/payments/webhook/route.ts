import { NextRequest, NextResponse } from "next/server";
import { apiBase, apiFailure, privateHeaders, readJsonBody } from "@/lib/server-session";

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await readJsonBody(request, 32768); }
  catch { return apiFailure("잘못된 알림 요청입니다.", 400); }
  try {
    // The backend verifies every event against Toss's Payment API. No browser
    // session or identity headers are accepted on this provider notification path.
    const upstream = await fetch(`${apiBase()}/payments/webhook`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(45000),
    });
    return NextResponse.json({ received: upstream.ok }, { status: upstream.status, headers: privateHeaders });
  } catch { return apiFailure("알림 확인을 다시 시도해 주세요.", 503); }
}
