import { art16SceneAsset, art16Scenes, art16SceneStyleId } from "./art16-scene-styles";
import { isSpSceneStyleId, spSceneAsset, spScenes, type SpSceneId, type SpSceneSheet } from "./sp-scene-styles";
import type { PixelBreed } from "./dog-breeds";
import { rubyRoundAsset, rubyRoundScenes, rubyRoundStyleId } from "./ruby-round-scene-styles";

export type DogSceneId = SpSceneId;
export function isNativeSceneStyle(style: unknown) { return style === art16SceneStyleId || isSpSceneStyleId(style) || style === rubyRoundStyleId; }
export function nativeDogScenes(style: unknown): readonly { id: DogSceneId; name: string; description: string }[] {
  return style === rubyRoundStyleId ? rubyRoundScenes : isSpSceneStyleId(style) ? spScenes : style === art16SceneStyleId ? art16Scenes : [];
}
export function nativeDogSceneAsset(style: unknown, breed: PixelBreed): { width: number; height: number; aseprite: string; scenes: Partial<Record<DogSceneId, SpSceneSheet>> } | undefined {
  return style === rubyRoundStyleId ? rubyRoundAsset(breed) : isSpSceneStyleId(style) ? spSceneAsset(style, breed) : style === art16SceneStyleId ? art16SceneAsset(breed) : undefined;
}
export function nativeDogSceneId(style: unknown, scene: DogSceneId): DogSceneId {
  return nativeDogScenes(style).some(item => item.id === scene) ? scene : "idle";
}
