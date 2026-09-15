import { createHash } from "node:crypto";
import fingerprints from "./generated/desktop-appearance-assets.json";
import { assetUrl } from "./asset-url";
import { dogBreedAt } from "./dog-breeds";
import { dogStyles, resolveDogStyle, resolveDogVariety, type AppearanceConfig } from "./dog-styles";
import { parseAppearance } from "./dog-appearance";
import { art16SceneAsset, art16SceneStyleId, art16Scenes, type Art16SceneId } from "./art16-scene-styles";
import { isSpSceneStyleId, spSceneAsset } from "./sp-scene-styles";
import { originalArtDogAsset } from "./original-art-dog-styles";
import { premiumDogAsset } from "./premium-dog-styles";
import { rubyRoundAsset, rubyRoundStyleId } from "./ruby-round-scene-styles";
import { rubyRoundEyePair } from "./ruby-round-eye-motion";
import { rubyEyeStyle } from "./ruby-round-eyes";
import type { DesktopAppearance, DesktopAppearanceScene } from "./desktop";

type JsonRecord = Record<string, unknown>;
const record = (value: unknown): value is JsonRecord => !!value && typeof value === "object" && !Array.isArray(value);
const unavailable = "웹 강아지의 모습을 불러오지 못했어요. 마지막으로 확인한 모습을 유지하고 다시 확인해요.";

function sceneDescriptor(png: string, width: number, height: number, frames: number, frameMs: number, origin: string): DesktopAppearanceScene {
  const file = (fingerprints as Record<string, { sha256: string; width: number; height: number }>)[png];
  if (!file || file.width !== width * frames || file.height !== height || !/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error(unavailable);
  // Only our finite image catalog is eligible; no user-provided image URLs or credentials enter this response.
  const url = new URL(assetUrl(png), origin);
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || (url.protocol !== "https:" && !(url.protocol === "http:" && local))) throw new Error(unavailable);
  return { url: url.href, sha256: file.sha256, frames, frameMs };
}

function imageDescriptor(png: string, width: number, height: number, origin: string) {
  const file = (fingerprints as Record<string, { sha256: string; width: number; height: number }>)[png];
  if (!file || file.width !== width || file.height !== height || !/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error(unavailable);
  const url = new URL(assetUrl(png), origin);
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || (url.protocol !== "https:" && !(url.protocol === "http:" && local))) throw new Error(unavailable);
  return { url: url.href, sha256: file.sha256 };
}

/** Resolve the very same breed/variety/global priority used by the live web renderer. */
export function desktopAppearance(config: AppearanceConfig, breed: number, origin: string, eyes: unknown = "original"): DesktopAppearance | null {
  const breedId = dogBreedAt(breed).id;
  const styleId = resolveDogStyle(config, breedId);
  const variety = resolveDogVariety(config, breedId);
  if (styleId === "classic" && (!variety || (variety.shape === "original" && variety.pattern === "solid" && !variety.coatColor))) return null;
  const styleName = dogStyles.find(style => style.id === styleId)?.name ?? styleId;
  let width: number, height: number;
  const scenes = {} as Record<Art16SceneId, DesktopAppearanceScene>;
  let renderKey: string | undefined;
  if (styleId === rubyRoundStyleId) {
    const asset = rubyRoundAsset(breedId);
    if (!asset) throw new Error(unavailable);
    ({ width, height } = asset);
    // Keep the original v1 image fields for already-installed clients. Newer
    // clients can compose the same eyeless body and shared eyes used by the web.
    for (const { id } of art16Scenes) {
      const sheet = asset.scenes[id];
      if (!sheet.desktopPng || !sheet.desktopFrames) throw new Error(unavailable);
      const legacy = sceneDescriptor(sheet.desktopPng, width, height, sheet.desktopFrames, sheet.frameMs, origin);
      const body = imageDescriptor(sheet.png, width * sheet.frames, height, origin);
      const eye = rubyEyeStyle(id === "sleep" ? "ruby-eye-10" : eyes);
      const eyeImage = imageDescriptor(eye.png, 32, 16, origin);
      const eyeAnchors = sheet.eyes.map(anchors => (id === "idle" || id === "happy"
        ? rubyRoundEyePair(anchors, asset.scenes.idle.eyes[0]) : anchors).map(anchor => ({ ...anchor })));
      if (sheet.frames > 8 || eyeAnchors.length !== sheet.frames || eyeAnchors.some(anchors => anchors.length < 1 || anchors.length > 2
        || anchors.some(anchor => ![anchor.x, anchor.y, anchor.width, anchor.height].every(Number.isInteger)))) throw new Error(unavailable);
      scenes[id] = { ...legacy, bodyUrl: body.url, bodySha256: body.sha256, bodyFrames: sheet.frames,
        eyeUrl: eyeImage.url, eyeSha256: eyeImage.sha256, eyeStyle: eye.id, eyeAnchors };
    }
  } else if (styleId === art16SceneStyleId || isSpSceneStyleId(styleId)) {
    const asset = isSpSceneStyleId(styleId) ? spSceneAsset(styleId, breedId) : art16SceneAsset(breedId);
    if (!asset) throw new Error(unavailable);
    ({ width, height } = asset);
    // Installed version-1 clients require exactly five scenes. Keep their appearance and
    // eight-frame walk compatible; the extra tail-wag scene is available on the web.
    for (const { id } of art16Scenes) {
      const sheet = asset.scenes[id];
      scenes[id] = sceneDescriptor(sheet.png, width, height, sheet.frames, sheet.frameMs, origin);
    }
  } else {
    const asset = originalArtDogAsset(styleId) ?? premiumDogAsset(styleId);
    if (!asset) throw new Error("이 도트 스타일은 아직 PC 앱에서 같은 모습으로 표시할 수 없어요. 원본 픽셀아트나 ‘픽셀아트 16 · 다섯 장면’을 선택해 주세요.");
    ({ width, height } = asset);
    // Single original artworks remain single frames in every mood. Never replace them with a small built-in dog.
    for (const { id } of art16Scenes) scenes[id] = sceneDescriptor(asset.png, width, height, 1, 125, origin);
  }
  const legacyScenes = Object.fromEntries(Object.entries(scenes).map(([id, scene]) => [id,
    { url: scene.url, sha256: scene.sha256, frames: scene.frames, frameMs: scene.frameMs }])) as Record<Art16SceneId, DesktopAppearanceScene>;
  const legacyIdentity = { version: 1 as const, styleId, styleName, breedId, width, height, scenes: legacyScenes };
  const key = createHash("sha256").update(JSON.stringify(legacyIdentity)).digest("hex");
  if (styleId === rubyRoundStyleId) {
    const layeredIdentity = { version: 1 as const, styleId, styleName, breedId, width, height, scenes };
    renderKey = createHash("sha256").update(JSON.stringify(layeredIdentity)).digest("hex");
  }
  return { ...legacyIdentity, key, ...(renderKey ? { renderKey, scenes } : {}) };
}

/** Cosmetic failures must never fail pairing, replay an action, or discard a successful game-state update. */
export async function attachDesktopAppearance(data: unknown, action: string, origin: string, backendBase: string, fetcher: typeof fetch = fetch): Promise<unknown> {
  if (!record(data) || !["pair", "state", "action"].includes(action)) return data;
  const state = action === "state" ? data : data.state;
  if (!record(state) || !record(state.puppy)) return data;
  let appearance: DesktopAppearance | null = null;
  let appearanceError: string | null = null;
  try {
    const response = await fetcher(`${backendBase}/appearance`, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(unavailable);
    const config = parseAppearance(await response.json());
    if (typeof state.puppy.breed !== "number" || !Number.isInteger(state.puppy.breed)) throw new Error(unavailable);
    appearance = desktopAppearance(config, state.puppy.breed, origin, state.puppy.eyes);
  } catch (error) {
    appearanceError = error instanceof Error && error.message.startsWith("이 도트 스타일은") ? error.message : unavailable;
  }
  const enriched = { ...state, appearance, appearanceError };
  return action === "state" ? enriched : { ...data, state: enriched };
}
