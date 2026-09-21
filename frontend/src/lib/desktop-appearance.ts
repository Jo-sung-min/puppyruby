import { createHash } from "node:crypto";
import {akitaCoatSheet,coatAssetUrl,coatPalette,coatRevision} from './akita-coat';
import fingerprints from "./generated/desktop-appearance-assets.json";
import { assetUrl } from "./asset-url";
import { dogBreedAt } from "./dog-breeds";
import { dogStyles, resolveDogStyle, resolveDogVariety, type AppearanceConfig } from "./dog-styles";
import { parseAppearance } from "./dog-appearance";
import { art16SceneAsset, art16SceneStyleId, art16Scenes, type Art16SceneId } from "./art16-scene-styles";
import { isSpSceneStyleId, spSceneAsset } from "./sp-scene-styles";
import { originalArtDogAsset } from "./original-art-dog-styles";
import { premiumDogAsset } from "./premium-dog-styles";
import { isRubyRoundSceneId, rubyRoundActionIds, rubyRoundAsset, rubyRoundStyleId, type RubyRoundActionId, type RubyRoundSheet } from "./ruby-round-scene-styles";
import { rubyRoundEyePair } from "./ruby-round-eye-motion";
import { rubyEyeStyle } from "./ruby-round-eyes";
import { resolvedRubyAccessoryActionPlacement, resolvedRubyAccessoryPlacement, rubyAccessoryCatalog, rubyAccessoryItem, rubyAccessoryItemForBreed } from "./ruby-round-accessories";
import type { DesktopAccessoryLayer, DesktopAppearance, DesktopAppearanceScene, DesktopNativeActionId } from "./desktop";

type JsonRecord = Record<string, unknown>;
const record = (value: unknown): value is JsonRecord => !!value && typeof value === "object" && !Array.isArray(value);
const unavailable = "웹 강아지의 모습을 불러오지 못했어요. 마지막으로 확인한 모습을 유지하고 다시 확인해요.";
const desktopAccessories = new Set(["none", "ribbon", "scarf", "crown", "bow-blue", "bow-lilac", "party-hat", "flower", "glasses", "halo", "angel-wings",
  ...rubyAccessoryCatalog.items.map(item => item.id)]);
const nativeActionIds = rubyRoundActionIds.filter((id): id is DesktopNativeActionId => !isRubyRoundSceneId(id));

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

function catalogImageDescriptor(png: string, sha256: string, origin: string) {
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error(unavailable);
  const url = new URL(assetUrl(png), origin);
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || (url.protocol !== "https:" && !(url.protocol === "http:" && local))) throw new Error(unavailable);
  return { url: url.href, sha256 };
}

function accessoryLayer(id: string, breedId: ReturnType<typeof dogBreedAt>["id"], origin: string, includeNative: boolean): DesktopAccessoryLayer | undefined {
  const item = rubyAccessoryItemForBreed(id,breedId), ruby = rubyRoundAsset(breedId);
  if (!item || !ruby) return;
  const placements = {} as DesktopAccessoryLayer["placements"];
  for (const { id: scene } of art16Scenes) {
    placements[scene] = Array.from({ length: ruby.scenes[scene].frames }, (_, frame) => resolvedRubyAccessoryPlacement(item, breedId, scene, frame))
      .filter((placement): placement is NonNullable<typeof placement> => !!placement);
    if (placements[scene].length !== ruby.scenes[scene].frames) return;
  }
  const nativeActions = includeNative ? {} as NonNullable<DesktopAccessoryLayer["nativeActions"]> : undefined;
  if (nativeActions) for (const action of nativeActionIds) {
    const sheet = ruby.actions?.[action];
    if (!sheet) throw new Error(unavailable);
    nativeActions[action] = Array.from({ length: sheet.frames }, (_, frame) => resolvedRubyAccessoryActionPlacement(item, breedId, action, frame))
      .filter((placement): placement is NonNullable<typeof placement> => !!placement);
    if (nativeActions[action].length !== sheet.frames) throw new Error(unavailable);
  }
  const image = item.renderer === "image" && item.asset
    ? { ...catalogImageDescriptor(item.asset.png, item.asset.sha256, origin), width: item.asset.width, height: item.asset.height,
      pivotX: item.asset.pivotX, pivotY: item.asset.pivotY }
    : undefined;
  return { schemaVersion: 1, id: item.id, revision: `${rubyAccessoryCatalog.revision}:${item.revision}`,
    catalogRevision: rubyAccessoryCatalog.revision, renderer: item.renderer, slot: item.slot, layer: item.layer, ...image, placements, nativeActions };
}

/** Old desktop clients only understand the finite procedural IDs. Image items live solely in accessoryLayer. */
export function legacyDesktopAccessoryId(id: string, layer?: Pick<DesktopAccessoryLayer, "renderer">) {
  return layer?.renderer === "image" ? "none" : id;
}

/** Older installed layered clients cannot parse closed native eye frames. */
export function desktopAppearanceForClient(appearance: DesktopAppearance | null, appearanceVersion: number): DesktopAppearance | null {
  if (!appearance) return appearance;
  if (Number.isInteger(appearanceVersion) && appearanceVersion >= 4) return appearance;
  if (Number.isInteger(appearanceVersion) && appearanceVersion >= 3) {
    if (![...Object.values(appearance.scenes),...Object.values(appearance.nativeActions??{})].some(s=>s.coat)) return appearance;
    const strip = (entries: Record<string,DesktopAppearanceScene>) => Object.fromEntries(Object.entries(entries).map(([id,{coat,...scene}])=>[id,scene]));
    const scenes=strip(appearance.scenes) as DesktopAppearance['scenes'];
    const nativeActions=appearance.nativeActions ? strip(appearance.nativeActions) as DesktopAppearance['nativeActions'] : undefined;
    const renderKey=createHash('sha256').update(JSON.stringify({...appearance,renderKey:undefined,scenes,nativeActions})).digest('hex');
    return {...appearance,scenes,nativeActions,renderKey};
  }
  const { version, key, styleId, styleName, breedId, width, height } = appearance;
  const scenes = Object.fromEntries(art16Scenes.map(({ id }) => {
    const scene = appearance.scenes[id];
    return [id, {url: scene.url, sha256: scene.sha256, frames: scene.frames, frameMs: scene.frameMs}];
  })) as DesktopAppearance["scenes"];
  return {version, key, styleId, styleName, breedId, width, height, scenes};
}

/** Resolve the very same breed/variety/global priority used by the live web renderer. */
export function desktopAppearance(config: AppearanceConfig, breed: number, origin: string, eyes: unknown = "original", accessory: unknown = "none", fur: unknown = "original"): DesktopAppearance | null {
  const breedId = dogBreedAt(breed).id;
  const styleId = resolveDogStyle(config, breedId);
  const variety = resolveDogVariety(config, breedId);
  if (styleId === "classic" && (!variety || (variety.shape === "original" && variety.pattern === "solid" && !variety.coatColor))) return null;
  const styleName = dogStyles.find(style => style.id === styleId)?.name ?? styleId;
  let width: number, height: number;
  const scenes = {} as Record<Art16SceneId, DesktopAppearanceScene>;
  let nativeActions: DesktopAppearance["nativeActions"];
  let renderKey: string | undefined;
  if (styleId === rubyRoundStyleId) {
    const asset = rubyRoundAsset(breedId);
    if (!asset) throw new Error(unavailable);
    ({ width, height } = asset);
    const layered = (id: RubyRoundActionId, sheet: RubyRoundSheet, fallback: DesktopAppearanceScene): DesktopAppearanceScene => {
      const body = imageDescriptor(sheet.png, width * sheet.frames, height, origin);
      const eye = rubyEyeStyle(!sheet.eyeModeByFrame && id === "sleep" ? "ruby-eye-10" : eyes);
      const eyeImage = imageDescriptor(eye.png, 32, 16, origin);
      const eyeAnchors = sheet.eyes.map(anchors => (sheet.kind !== "redrawn" && (id === "idle" || id === "happy")
        ? rubyRoundEyePair(anchors, asset.scenes.idle.eyes[0]) : anchors).map(anchor => ({ ...anchor })));
      const eyeModeByFrame = sheet.eyeModeByFrame?.slice();
      const mask=akitaCoatSheet(breedId,id,sheet.png), palette=coatPalette(fur);
      const coat=mask && palette.id!=='original' ? {maskUrl:new URL(coatAssetUrl(mask.maskSha256),origin).href,maskSha256:mask.maskSha256,
        paletteId:palette.id,revision:coatRevision,primary:palette.primary,secondary:palette.secondary} : undefined;
      if (sheet.frames > 8 || eyeAnchors.length !== sheet.frames || eyeAnchors.some((anchors, frame) =>
        (eyeModeByFrame && eyeModeByFrame[frame] !== "shared" ? anchors.length !== 0 : anchors.length < 1 || anchors.length > 2)
        || anchors.some(anchor => ![anchor.x, anchor.y, anchor.width, anchor.height].every(Number.isInteger)))) throw new Error(unavailable);
      return { ...fallback, bodyUrl: body.url, bodySha256: body.sha256, bodyFrames: sheet.frames,
        eyeUrl: eyeImage.url, eyeSha256: eyeImage.sha256, eyeStyle: eye.id, eyeAnchors, eyeModeByFrame, ...(coat?{coat}:{}) };
    };
    // Keep the original v1 image fields for already-installed clients. Newer
    // clients can compose the same eyeless body and shared eyes used by the web.
    for (const { id } of art16Scenes) {
      const sheet = asset.scenes[id];
      if (!sheet.desktopPng || !sheet.desktopFrames) throw new Error(unavailable);
      scenes[id] = layered(id, sheet, sceneDescriptor(sheet.desktopPng, width, height, sheet.desktopFrames, sheet.frameMs, origin));
    }
    if (asset.actions && nativeActionIds.every(id => asset.actions?.[id].kind === "redrawn")) {
      nativeActions = {} as NonNullable<DesktopAppearance["nativeActions"]>;
      for (const id of nativeActionIds) {
        const sheet = asset.actions[id];
        if (sheet.frames !== 4 || !sheet.eyeModeByFrame) throw new Error(unavailable);
        nativeActions[id] = layered(id, sheet, sceneDescriptor(sheet.png, width, height, sheet.frames, sheet.frameMs, origin));
      }
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
    const selectedAccessory = typeof accessory === "string" && desktopAccessories.has(accessory) ? accessory : "none";
    const selectedAccessoryItem = rubyAccessoryItem(selectedAccessory);
    const selectedAccessoryLayer = selectedAccessory === "none" ? undefined : accessoryLayer(selectedAccessory, breedId, origin, !!nativeActions);
    const legacyAccessory = legacyDesktopAccessoryId(selectedAccessory, selectedAccessoryItem);
    const reactionEyes = scenes.idle.eyeAnchors?.[0]?.map(anchor => ({ ...anchor }));
    if (!reactionEyes || reactionEyes.length !== 2) throw new Error(unavailable);
    const layeredIdentity = { version: 1 as const, styleId, styleName, breedId, width, height, accessory: selectedAccessory,
      accessoryRevision: rubyAccessoryItem(selectedAccessory)?.revision, accessoryLayer: selectedAccessoryLayer, reactionEyes, scenes, nativeActions };
    renderKey = createHash("sha256").update(JSON.stringify(layeredIdentity)).digest("hex");
    return { ...legacyIdentity, key, renderKey, accessory: legacyAccessory, accessoryLayer: selectedAccessoryLayer, reactionEyes, scenes, nativeActions };
  }
  return { ...legacyIdentity, key };
}

/** Cosmetic failures must never fail pairing, replay an action, or discard a successful game-state update. */
export async function attachDesktopAppearance(data: unknown, action: string, origin: string, backendBase: string, fetcher: typeof fetch = fetch, appearanceVersion = 1): Promise<unknown> {
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
    appearance = desktopAppearanceForClient(desktopAppearance(config, state.puppy.breed, origin, state.puppy.eyes, state.puppy.accessory, state.puppy.fur), appearanceVersion);
  } catch (error) {
    appearanceError = error instanceof Error && error.message.startsWith("이 도트 스타일은") ? error.message : unavailable;
  }
  const enriched = { ...state, appearance, appearanceError };
  return action === "state" ? enriched : { ...data, state: enriched };
}
