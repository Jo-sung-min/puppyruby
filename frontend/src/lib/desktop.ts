import type { Puppy } from "./game";

export type DesktopDevice = { id: string; label: string; createdAt: number; lastSeen: number };
export type DesktopLinks = { devices: DesktopDevice[] };
export type DesktopPairingCode = { code: string; expiresAt: number };
export type DesktopState = { puppy: Puppy; coins: number; promotionXp: number; obedience: number; syncedAt: number };
export type DesktopPairResult = { token: string; device: DesktopDevice; state: DesktopState };
export type DesktopActionResult = { state: DesktopState; success: boolean; message: string };
export type DesktopAction = "feed" | "play" | "rest" | "train" | "promote" | "ask";

export async function requestDesktop<T>(action: "links" | "pair-code" | "revoke", body?: { deviceId?: string }): Promise<T> {
  const response = await fetch(`/api/desktop/${action}`, {
    method: action === "links" ? "GET" : "POST", headers: { "Content-Type": "application/json" },
    body: action === "links" ? undefined : JSON.stringify(body || {}), cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "강아지 연결을 확인하지 못했어요. 다시 시도해 주세요.");
  return data;
}
