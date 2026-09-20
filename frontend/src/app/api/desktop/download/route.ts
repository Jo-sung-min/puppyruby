import { NextResponse } from "next/server";
import { latestDesktopUpdateRelease } from "@/lib/desktop-update";

export const dynamic = "force-dynamic";

export async function GET() {
  const release = await latestDesktopUpdateRelease();
  if (!release) return Response.json({ message: "Windows 설치파일을 준비하고 있어요." }, {
    status: 503,
    headers: { "Cache-Control": "no-store, max-age=0", "X-Content-Type-Options": "nosniff" },
  });
  const response = NextResponse.redirect(release.installer.url, 307);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}
