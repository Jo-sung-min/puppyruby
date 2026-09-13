import completedAssets from "./generated/art16-scene-assets.json";
import { dogBreedIds, type PixelBreed } from "./dog-breeds";
import type { PixelMood } from "../components/pixel-dog";

export const art16SceneStyleId = "art-16-scenes" as const;
export const art16Scenes = [
  { id: "idle", name: "정면 앉기", description: "가만히 있을 때 앞을 보고 편안하게 앉아요" },
  { id: "side", name: "옆모습", description: "견종마다 다른 귀, 털과 꼬리를 옆에서 보아요" },
  { id: "walk", name: "걷기", description: "발을 번갈아 내딛는 여덟 장면이 이어져요" },
  { id: "happy", name: "반가워요", description: "함께 놀면 활짝 웃으며 반겨요" },
  { id: "sleep", name: "잠자기", description: "편안하게 누워 눈을 감고 쉬어요" },
] as const;
export type Art16SceneId = (typeof art16Scenes)[number]["id"];
export type Art16SceneSheet = { png: string; frames: number; frameMs: number };
export type Art16SceneAsset = {
  breed: PixelBreed; width: number; height: number; aseprite: string;
  scenes: Record<Art16SceneId, Art16SceneSheet>;
};

function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function integer(value: unknown, min: number, max: number): value is number { return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max; }
function breedId(value: unknown): value is PixelBreed { return typeof value === "string" && dogBreedIds.some(id => id === value); }
export function isArt16SceneId(value: unknown): value is Art16SceneId { return typeof value === "string" && art16Scenes.some(scene => scene.id === value); }

/** The asset pipeline adds a breed only after its five transparent sheets and editable master pass verification. */
export function parseArt16SceneAssets(input: unknown): Art16SceneAsset[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<PixelBreed>();
  return input.flatMap(entry => {
    if (!record(entry) || !breedId(entry.breed) || seen.has(entry.breed)
      || !integer(entry.width, 256, 4096) || !integer(entry.height, 256, 4096)
      || entry.aseprite !== `/downloads/art16-scenes-v1/${entry.breed}.aseprite` || !record(entry.scenes)) return [];
    const scenes = {} as Record<Art16SceneId, Art16SceneSheet>;
    for (const { id } of art16Scenes) {
      const scene = entry.scenes[id];
      if (!record(scene) || scene.png !== `/images/art16-scenes-v1/${entry.breed}/${id}.png`
        || !integer(scene.frames, id === "walk" ? 8 : 1, id === "walk" ? 8 : 1)
        || !integer(scene.frameMs, 50, 2000)) return [];
      scenes[id] = { png: scene.png, frames: scene.frames, frameMs: scene.frameMs };
    }
    seen.add(entry.breed);
    return [{ breed: entry.breed, width: entry.width, height: entry.height, aseprite: entry.aseprite, scenes }];
  });
}

export const art16SceneAssets = parseArt16SceneAssets(completedAssets);
/** A global assignment must never silently show a different breed while another breed is unfinished. */
export const art16ScenesReady = dogBreedIds.every(breed => art16SceneAssets.some(asset => asset.breed === breed));
export const art16SceneStyles = [{ id: art16SceneStyleId, name: "픽셀아트 16 · 다섯 장면", description: "30종의 강아지가 정면으로 앉고, 옆으로 걷고, 웃고 잠들어요", kind: "pixel" as const }]
  .filter(() => art16ScenesReady);
export function art16SceneAsset(breed: PixelBreed) { return art16SceneAssets.find(asset => asset.breed === breed); }
export function art16SceneForMood(mood: PixelMood): Art16SceneId {
  if (mood === "walk") return "walk";
  if (mood === "sleep") return "sleep";
  if (mood === "drag" || mood === "scroll") return "side";
  // Both slow and rapid typing use the front-facing paws and keyboard.
  if (mood === "love" || mood === "play") return "happy";
  return "idle";
}
export function art16FrameIndex(frame: number, frames: number) {
  return Number.isFinite(frame) && Number.isInteger(frames) && frames > 0 ? ((Math.trunc(frame) % frames) + frames) % frames : 0;
}
