import completedAssets from "./generated/sp-scene-assets.json";
import { dogBreedIds, type PixelBreed } from "./dog-breeds";
import type { PixelMood } from "../components/pixel-dog";

export const spSceneFamilies = ["sp08", "sp15"] as const;
export type SpSceneFamily = (typeof spSceneFamilies)[number];
export type SpSceneStyleId = `${SpSceneFamily}-scenes`;
export const spScenes = [
  { id: "idle", name: "정면 앉기", description: "가만히 있을 때 앞을 보고 편안하게 앉아요" },
  { id: "side", name: "옆모습", description: "귀, 털과 몸의 특징을 옆에서 보아요" },
  { id: "walk", name: "걷기", description: "발을 번갈아 내딛는 여덟 프레임을 이어서 걸어요" },
  { id: "happy", name: "반가워요", description: "활짝 웃으며 반갑게 인사해요" },
  { id: "sleep", name: "잠자기", description: "몸을 편안하게 눕히고 잠들어요" },
  { id: "wag", name: "꼬리 흔들기", description: "네 프레임으로 꼬리를 좌우로 살랑살랑 흔들어요" },
] as const;
export type SpSceneId = (typeof spScenes)[number]["id"];
export type SpSceneSheet = { png: string; frames: number; frameMs: number };
export type SpFrameBounds = { x: number; y: number; width: number; height: number };
export type SpReactionPoint = { x: number; y: number; rx: number; ry: number };
export type SpSceneAsset = {
  style: SpSceneFamily; breed: PixelBreed; width: number; height: number; aseprite: string;
  scenes: Record<SpSceneId, SpSceneSheet>;
  frameBounds?: Partial<Record<SpSceneId, SpFrameBounds[]>>;
  reactions?: { eyes: SpReactionPoint[]; paws: SpReactionPoint[] };
};
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const integer = (value: unknown, min: number, max: number): value is number => typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
const finite = (value: unknown, min: number, max: number): value is number => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
export function isSpSceneStyleId(value: unknown): value is SpSceneStyleId { return value === "sp08-scenes" || value === "sp15-scenes"; }
export function isSpSceneId(value: unknown): value is SpSceneId { return typeof value === "string" && spScenes.some(scene => scene.id === value); }
export function spSceneFamily(style: SpSceneStyleId): SpSceneFamily { return style === "sp08-scenes" ? "sp08" : "sp15"; }

/** A breed enters the gallery only after the six sheets and editable master are verified by the asset pipeline. */
export function parseSpSceneAssets(input: unknown): SpSceneAsset[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  return input.flatMap(entry => {
    if (!record(entry) || !spSceneFamilies.some(style => style === entry.style) || !dogBreedIds.some(breed => breed === entry.breed)
      || !integer(entry.width, 192, 4096) || !integer(entry.height, 192, 4096)) return [];
    const style = entry.style as SpSceneFamily, breed = entry.breed as PixelBreed, key = `${style}/${breed}`;
    if (seen.has(key) || entry.aseprite !== `/downloads/sp-scenes-v1/${key}.aseprite` || !record(entry.scenes)) return [];
    const scenes = {} as Record<SpSceneId, SpSceneSheet>;
    const frameBounds: Partial<Record<SpSceneId, SpFrameBounds[]>> = {};
    for (const { id } of spScenes) {
      const scene = entry.scenes[id], frames = id === "walk" ? 8 : id === "wag" ? 4 : 1;
      if (!record(scene) || scene.png !== `/images/sp-scenes-v1/${key}/${id}.png` || scene.frames !== frames || !integer(scene.frameMs, 50, 2000)) return [];
      scenes[id] = { png: scene.png, frames, frameMs: scene.frameMs };
      const bounds = record(entry.frameBounds) ? entry.frameBounds[id] : undefined;
      if (Array.isArray(bounds) && bounds.length === frames && bounds.every(bound => record(bound)
        && finite(bound.x, 0, entry.width as number) && finite(bound.y, 0, entry.height as number)
        && finite(bound.width, 1, (entry.width as number) - (bound.x as number)) && finite(bound.height, 1, (entry.height as number) - (bound.y as number)))) {
        frameBounds[id] = bounds.map(bound => ({ x: bound.x, y: bound.y, width: bound.width, height: bound.height }));
      }
    }
    let reactions: SpSceneAsset["reactions"];
    if (record(entry.reactions)) {
      const points = (value: unknown): value is SpReactionPoint[] => Array.isArray(value) && value.length === 2 && value.every(point => record(point)
        && finite(point.x, 0, entry.width as number) && finite(point.y, 0, entry.height as number)
        && finite(point.rx, 1, (entry.width as number) / 8) && finite(point.ry, 1, (entry.height as number) / 8)
        && point.x - point.rx >= 0 && point.y - point.ry >= 0
        && point.x + point.rx <= (entry.width as number) && point.y + point.ry <= (entry.height as number));
      if (points(entry.reactions.eyes) && points(entry.reactions.paws)) reactions = { eyes: entry.reactions.eyes, paws: entry.reactions.paws };
    }
    seen.add(key);
    return [{ style, breed, width: entry.width, height: entry.height, aseprite: entry.aseprite, scenes, frameBounds, reactions }];
  });
}
export const spSceneAssets = parseSpSceneAssets(completedAssets);
export function spScenesReady(style: SpSceneFamily) {
  return dogBreedIds.every(breed => spSceneAssets.some(asset => asset.style === style && asset.breed === breed && !!asset.reactions));
}
export const spSceneStyles = [
  { id: "sp08-scenes" as const, name: "몽실 강아지 · 여섯 장면", description: "SP08의 몽실한 모습으로 만나는 30견종 · 꼬리 흔들기까지", kind: "pixel" as const },
  { id: "sp15-scenes" as const, name: "포켓 방울 · 여섯 장면", description: "SP15의 작은 방울 같은 30견종 · 꼬리 흔들기까지", kind: "pixel" as const },
].filter(style => spScenesReady(spSceneFamily(style.id)));
export function spSceneAsset(styleId: SpSceneStyleId, breed: PixelBreed) { return spSceneAssets.find(asset => asset.style === spSceneFamily(styleId) && asset.breed === breed); }
export function spSceneForMood(mood: PixelMood): SpSceneId {
  if (mood === "walk") return "walk";
  if (mood === "sleep") return "sleep";
  if (mood === "drag" || mood === "scroll") return "side";
  if (mood === "love") return "wag";
  if (mood === "play") return "happy";
  return "idle";
}
