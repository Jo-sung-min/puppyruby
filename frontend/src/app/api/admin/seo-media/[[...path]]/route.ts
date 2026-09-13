import { NextRequest, NextResponse } from "next/server";
import { apiBase, apiFailure, browserIdentity, clearSession, isSameOrigin, privateHeaders, readJsonBody } from "@/lib/server-session";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function failure(status: number) {
  if (status === 401) return "공유 이미지를 올리려면 다시 로그인해 주세요.";
  if (status === 403) return "이메일 인증을 마친 관리자만 공유 이미지를 올릴 수 있어요.";
  if (status === 429) return "이미지를 너무 자주 올렸어요. 잠시 후 다시 시도해 주세요.";
  if (status === 503) return "이미지 업로드를 준비 중이에요. 공유 이미지 주소를 직접 입력할 수 있어요.";
  return "공유 이미지 등록 정보를 확인해 주세요.";
}

async function handle(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  const action = (await context.params).path?.join("/") ?? "";
  const read = request.method === "GET" && action === "config";
  if (!read && !(request.method === "POST" && (action === "presign" || action === "complete"))) return apiFailure("메뉴를 찾을 수 없어요.", 404);
  if (!read && !isSameOrigin(request, true)) return apiFailure("요청 출처를 확인할 수 없어요.", 403);
  const identity = await browserIdentity();
  if (!identity.hasSession) return apiFailure(failure(401), 401);
  let body: Record<string, unknown> | undefined;
  if (!read) {
    if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") return apiFailure("JSON 형식으로 보내 주세요.", 400);
    try { body = await readJsonBody(request, 1024); }
    catch { return apiFailure(failure(400), 400); }
    if (action === "presign") {
      if (Object.keys(body).length !== 3 || typeof body.contentType !== "string" || !["image/jpeg", "image/png"].includes(body.contentType)
        || typeof body.size !== "number" || !Number.isSafeInteger(body.size) || body.size <= 0 || body.size > 5 * 1024 * 1024
        || typeof body.sha256 !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(body.sha256)) return apiFailure(failure(400), 400);
    } else if (Object.keys(body).length !== 1 || typeof body.uploadId !== "string" || !uuid.test(body.uploadId)) return apiFailure(failure(400), 400);
  }
  try {
    const upstream = await fetch(`${apiBase()}/admin/seo-media/${action}`, {
      method: request.method, headers: identity.headers, body: body ? JSON.stringify(body) : undefined,
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(30000),
    });
    const response = upstream.ok ? NextResponse.json(await upstream.json(), { headers: privateHeaders }) : apiFailure(failure(upstream.status), upstream.status);
    if (upstream.status === 401) clearSession(response, request);
    return response;
  } catch { return apiFailure("이미지 업로드에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.", 503); }
}

export const GET = handle;
export const POST = handle;
