import { art16SceneAsset, art16Scenes, art16SceneStyleId } from "./art16-scene-styles";
import { isSpSceneStyleId, spSceneAsset, spScenes, type SpSceneId, type SpSceneSheet } from "./sp-scene-styles";
import type { PixelBreed } from "./dog-breeds";
import {coatAssetUrl} from './akita-coat';
import {
  rubyRoundActionList, rubyRoundActionSheets, rubyRoundAsset, rubyRoundStyleId,
  type RubyRoundActionId,
} from "./ruby-round-scene-styles";

export type DogSceneId = SpSceneId | RubyRoundActionId;
export type NativeDogSceneSheet = Pick<SpSceneSheet, "png" | "frames" | "frameMs">;
export type NativeDogSceneAsset = {
  width: number; height: number; aseprite: string; scenes: Partial<Record<DogSceneId, NativeDogSceneSheet>>;
};
export function isNativeSceneStyle(style: unknown) { return style === art16SceneStyleId || isSpSceneStyleId(style) || style === rubyRoundStyleId; }
export function nativeDogScenes(style: unknown): readonly { id: DogSceneId; name: string; description: string }[] {
  return style === rubyRoundStyleId ? rubyRoundActionList() : isSpSceneStyleId(style) ? spScenes : style === art16SceneStyleId ? art16Scenes : [];
}
export function nativeDogScenesForBreed(style: unknown, breed: PixelBreed): readonly { id: DogSceneId; name: string; description: string }[] {
  return style === rubyRoundStyleId ? rubyRoundActionList(rubyRoundAsset(breed)) : nativeDogScenes(style);
}
export function nativeDogSceneAsset(style: unknown, breed: PixelBreed): NativeDogSceneAsset | undefined {
  if (style === rubyRoundStyleId) {
    const asset = rubyRoundAsset(breed);
    return asset ? { width: asset.width, height: asset.height, aseprite: asset.motionAseprite ?? asset.aseprite,
      scenes: Object.fromEntries(Object.entries(rubyRoundActionSheets(asset)).map(([id,sheet])=>[id,sheet.revision?{...sheet,png:coatAssetUrl(sheet.revision.bodySha256)}:sheet])) } : undefined;
  }
  return isSpSceneStyleId(style) ? spSceneAsset(style, breed) : style === art16SceneStyleId ? art16SceneAsset(breed) : undefined;
}
export function nativeDogSceneId(style: unknown, scene: DogSceneId): DogSceneId {
  return nativeDogScenes(style).some(item => item.id === scene) ? scene : "idle";
}
export function nativeDogSceneIdForBreed(style: unknown, breed: PixelBreed, scene: DogSceneId): DogSceneId {
  return nativeDogScenesForBreed(style, breed).some(item => item.id === scene) ? scene : "idle";
}
