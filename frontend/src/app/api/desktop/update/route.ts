import { desktopUpdateResponse } from "@/lib/desktop-update";

export const dynamic = "force-dynamic";

// Public release metadata; no account session or backend connection is needed.
export function GET() {
  return desktopUpdateResponse();
}
