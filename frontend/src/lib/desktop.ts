import type { Puppy } from "./game";
import type { Art16SceneId } from "./art16-scene-styles";
import type { RubyRoundActionId } from "./ruby-round-scene-styles";

export type DesktopNativeActionId = Exclude<RubyRoundActionId, Art16SceneId>;

export type DesktopEyeAnchor = { x: number; y: number; width: number; height: number };
export type DesktopAppearanceScene = {
  url: string; sha256: string; frames: number; frameMs: number;
  bodyUrl?: string; bodySha256?: string; bodyFrames?: number;
  eyeUrl?: string; eyeSha256?: string; eyeStyle?: string; eyeAnchors?: DesktopEyeAnchor[][];
  eyeModeByFrame?: ("shared" | "baked-closed" | "hidden")[];
  coat?: { maskUrl:string; maskSha256:string; paletteId:string; revision:string; primary:string[]; secondary:string[] };
};
export type DesktopAccessoryPlacement = { x: number; y: number; width: number; height: number; rotation: number; flipX: boolean; visible: boolean };
export type DesktopAccessoryLayer = {
  schemaVersion: 1; id: string; revision: string; catalogRevision?: string; renderer: "builtin" | "image";
  slot: "face" | "head" | "neck" | "back"; layer: "behind" | "front";
  url?: string; sha256?: string; width?: number; height?: number; pivotX?: number; pivotY?: number;
  placements: Record<Art16SceneId, DesktopAccessoryPlacement[]>;
  nativeActions?: Record<DesktopNativeActionId, DesktopAccessoryPlacement[]>;
};
export type DesktopAppearance = {
  version: 1; key: string; renderKey?: string; styleId: string; styleName: string; breedId: string;
  width: number; height: number; accessory?: string; accessoryLayer?: DesktopAccessoryLayer; reactionEyes?: DesktopEyeAnchor[]; scenes: Record<Art16SceneId, DesktopAppearanceScene>;
  nativeActions?: Record<DesktopNativeActionId, DesktopAppearanceScene>;
};

export type DesktopDevice = { id: string; label: string; createdAt: number; lastSeen: number };
export type DesktopLinks = { devices: DesktopDevice[] };
export type DesktopPairingCode = { code: string; expiresAt: number };
export type DesktopState = { puppy: Puppy; coins: number; promotionXp: number; obedience: number; syncedAt: number; appearance?: DesktopAppearance | null; appearanceError?: string | null };
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
