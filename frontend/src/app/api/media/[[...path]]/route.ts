import { NextRequest, NextResponse } from "next/server";
import { apiBase, apiFailure, browserIdentity, clearSession, isSameOrigin, privateHeaders, readJsonBody } from "@/lib/server-session";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function messageFor(status: number) {
  if (status === 401) return "사진을 등록하려면 로그인해 주세요.";
  if (status === 403) return "사진을 등록할 수 없어요. 계정 상태를 확인해 주세요.";
  if (status === 429) return "사진을 너무 자주 등록했어요. 잠시 후 다시 시도해 주세요.";
  if (status === 503) return "사진 등록을 준비 중이에요. 잠시 후 다시 시도해 주세요.";
  return "사진을 등록하지 못했어요. 다시 선택해 주세요.";
}

async function handle(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  const action = (await context.params).path?.join("/") ?? "";
  const publicRead = request.method === "GET" && action === "config";
  if (!publicRead && !(request.method === "POST" && (action === "presign" || action === "complete"))) return apiFailure("메뉴를 찾을 수 없어요.", 404);
  if (!publicRead && !isSameOrigin(request, true)) return apiFailure("요청 출처를 확인할 수 없어요.", 403);
  const identity = publicRead ? null : await browserIdentity();
  if (identity && !identity.hasSession) return apiFailure("사진을 등록하려면 로그인해 주세요.", 401);
  let body: Record<string, unknown> | undefined;
  if (!publicRead) {
    if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") return apiFailure("JSON 형식으로 사진 등록 정보를 보내 주세요.", 400);
    try { body = await readJsonBody(request, 1024); }
    catch { return apiFailure("사진 등록 정보를 확인해 주세요.", 400); }
    if (action === "presign") {
      if (Object.keys(body).length !== 3 || typeof body.contentType !== "string" || !["image/jpeg", "image/png"].includes(body.contentType)
        || typeof body.size !== "number" || !Number.isSafeInteger(body.size) || body.size <= 0 || body.size > 10 * 1024 * 1024
        || typeof body.sha256 !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(body.sha256)) return apiFailure("사진 등록 정보를 확인해 주세요.", 400);
    } else if (Object.keys(body).length !== 1 || typeof body.uploadId !== "string" || !uuid.test(body.uploadId)) return apiFailure("사진 등록 정보를 확인해 주세요.", 400);
  }
  try {
    const upstream = await fetch(`${apiBase()}/media/${action}`, {
      method: request.method, headers: identity?.headers ?? { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(30000),
    });
    const response = upstream.ok
      ? NextResponse.json(await upstream.json(), { headers: privateHeaders })
      : apiFailure(messageFor(upstream.status), upstream.status);
    if (!publicRead && upstream.status === 401) clearSession(response, request);
    return response;
  } catch { return apiFailure("사진 등록에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.", 503); }
}

export const GET = handle;
export const POST = handle;
