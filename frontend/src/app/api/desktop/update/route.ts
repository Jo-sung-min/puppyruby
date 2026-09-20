import { desktopUpdateResponse, latestDesktopUpdateRelease } from "@/lib/desktop-update";

export const dynamic = "force-dynamic";

// Public release metadata; no account session or backend connection is needed.
export async function GET() {
  return desktopUpdateResponse(await latestDesktopUpdateRelease());
}
