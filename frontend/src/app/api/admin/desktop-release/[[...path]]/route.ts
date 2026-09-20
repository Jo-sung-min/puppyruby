import { NextRequest, NextResponse } from "next/server";
import {
  desktopReleaseCompleteTimeoutMs,
  isDesktopReleaseId,
  isDesktopReleaseNotes,
  isDesktopVersion,
  readDesktopReleaseMetadata,
  readDesktopReleasePreparation,
} from "@/lib/desktop-release-contract";
import { readDesktopUpdateRelease } from "@/lib/desktop-update";
import { apiBase, apiFailure, browserIdentity, clearSession, isSameOrigin, privateHeaders, readJsonBody } from "@/lib/server-session";

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function failure(status: number) {
  if (status === 401) return "Windows 배포를 관리하려면 다시 로그인해 주세요.";
  if (status === 403) return "이메일 인증을 마친 관리자만 Windows 배포를 공개할 수 있어요.";
  if (status === 409) return "실행파일의 실제 버전, 업로드 상태와 현재 공개 버전을 확인해 주세요.";
  if (status === 413) return "선택한 실행파일의 용량이 너무 커요.";
  if (status === 429) return "배포 요청이 너무 잦아요. 잠시 후 다시 시도해 주세요.";
  if (status === 503) return "Windows 배포 저장소를 준비 중이에요. 서버 설정을 확인해 주세요.";
  if (status === 400 || status === 410 || status === 422) return "버전과 실행파일을 확인한 뒤 다시 시도해 주세요.";
  return "Windows 배포를 처리하지 못했어요. 잠시 후 다시 시도해 주세요.";
}

async function smallJson(response: Response): Promise<unknown> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > 32 * 1024) throw new Error("Oversized response");
  const text = await response.text();
  if (text.length > 32 * 1024) throw new Error("Oversized response");
  return JSON.parse(text);
}

function requestBody(value: Record<string, unknown>, complete: boolean) {
  const keys = Object.keys(value).sort();
  const expected = (complete ? ["files", "notes", "release", "version"] : ["files", "notes", "version"]).sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])
    || !isDesktopVersion(value.version) || !isDesktopReleaseNotes(value.notes)) return null;
  const files = readDesktopReleaseMetadata(value.files);
  if (!files || (complete && !isDesktopReleaseId(value.release))) return null;
  return complete
    ? { version: value.version, notes: value.notes, release: value.release, files }
    : { version: value.version, notes: value.notes, files };
}

async function handle(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  const action = (await context.params).path?.join("/") ?? "";
  const read = request.method === "GET" && action === "";
  const write = request.method === "POST" && (action === "prepare" || action === "complete");
  if (!read && !write) return apiFailure("Windows 배포 메뉴를 찾을 수 없어요.", 404);
  if (!isSameOrigin(request, write)) return apiFailure("요청 출처를 확인할 수 없어요.", 403);
  const identity = await browserIdentity();
  if (!identity.hasSession) return apiFailure("Windows 배포를 관리하려면 로그인해 주세요.", 401);

  let body: ReturnType<typeof requestBody> = null;
  if (write) {
    if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json")
      return apiFailure("JSON 형식으로 Windows 배포 정보를 보내 주세요.", 400);
    try { body = requestBody(await readJsonBody(request, 4096), action === "complete"); }
    catch { return apiFailure("Windows 배포 정보를 확인해 주세요.", 400); }
    if (!body) return apiFailure("Windows 배포 정보를 확인해 주세요.", 400);
  }

  try {
    const upstream = await fetch(`${apiBase()}/admin/desktop-release${action ? `/${action}` : ""}`, {
      method: request.method, headers: identity.headers, body: body ? JSON.stringify(body) : undefined,
      cache: "no-store", redirect: "error",
      signal: AbortSignal.timeout(action === "complete" ? desktopReleaseCompleteTimeoutMs : 15_000),
    });
    if (!upstream.ok) {
      const response = apiFailure(failure(upstream.status), upstream.status);
      if (upstream.status === 401) clearSession(response, request);
      return response;
    }
    const value = await smallJson(upstream);
    if (read) {
      if (!object(value) || typeof value.enabled !== "boolean" || !(value.current === null || object(value.current)))
        return apiFailure("Windows 배포 설정을 확인하지 못했어요.", 502);
      const current = value.current === null ? null : readDesktopUpdateRelease(value.current);
      if (value.current !== null && !current) return apiFailure("현재 Windows 릴리스 정보를 확인하지 못했어요.", 502);
      return NextResponse.json({ enabled: value.enabled, current }, { headers: privateHeaders });
    }
    if (action === "prepare") {
      const metadata = body && readDesktopReleaseMetadata(body.files);
      const prepared = metadata && readDesktopReleasePreparation(value, metadata);
      return prepared ? NextResponse.json(prepared, { headers: privateHeaders })
        : apiFailure("실행파일 업로드 주소를 확인하지 못했어요.", 502);
    }
    const manifest = readDesktopUpdateRelease(value);
    return manifest ? NextResponse.json(manifest, { headers: privateHeaders })
      : apiFailure("공개된 Windows 릴리스를 확인하지 못했어요.", 502);
  } catch { return apiFailure("Windows 배포 서비스에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.", 503); }
}

export const GET = handle;
export const POST = handle;
