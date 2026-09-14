import completedAssets from "./generated/ruby-round-scene-assets.json";
import { dogBreedIds, type PixelBreed } from "./dog-breeds";
import type { PixelMood } from "../components/pixel-dog";

export const rubyRoundStyleId = "ruby-round-scenes" as const;
export const rubyRoundScenes = [
  { id: "idle", name: "정면 앉기", description: "앞을 보고 편안하게 앉아 살짝 숨을 쉬어요" },
  { id: "side", name: "옆모습", description: "옆으로 서서 꼬리를 살랑살랑 흔들어요" },
  { id: "walk", name: "걷기", description: "작은 발을 번갈아 내딛으며 걸어요" },
  { id: "happy", name: "반가워요", description: "작은 앞발을 들고 반갑게 인사해요" },
  { id: "sleep", name: "잠자기", description: "편안하게 누워 포근히 잠들어요" },
] as const;
export type RubyRoundSceneId = (typeof rubyRoundScenes)[number]["id"];
export type RubyEyeAnchor = { x: number; y: number; width: number; height: number };
export type RubyRoundSheet = { png: string; frames: number; frameMs: number; eyes: RubyEyeAnchor[][]; desktopPng?: string; desktopFrames?: number };
export type RubyRoundAsset = { breed: PixelBreed; width: number; height: number; aseprite: string; scenes: Record<RubyRoundSceneId, RubyRoundSheet>;
  reactions?: { paws: { x: number; y: number; rx: number; ry: number }[] } };
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const integer = (value: unknown, min: number, max: number): value is number => typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
const finite = (value: unknown, min: number, max: number): value is number => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;

/** Only complete, locally published scene sets enter the selectable catalog. */
export function parseRubyRoundAssets(input: unknown): RubyRoundAsset[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  return input.flatMap(entry => {
    if (!record(entry) || !dogBreedIds.some(id => id === entry.breed) || !integer(entry.width, 96, 2048) || !integer(entry.height, 96, 2048) || !record(entry.scenes)) return [];
    const breed = entry.breed as PixelBreed, width = entry.width, height = entry.height;
    if (seen.has(breed) || entry.aseprite !== `/downloads/ruby-round-v1/${breed}.aseprite`) return [];
    const scenes = {} as RubyRoundAsset["scenes"];
    for (const { id } of rubyRoundScenes) {
      const sheet = entry.scenes[id];
      if (!record(sheet) || sheet.png !== `/images/ruby-round-v1/${breed}/${id}.png` || !integer(sheet.frames, 2, 16) || !integer(sheet.frameMs, 50, 2000)
        || !Array.isArray(sheet.eyes) || sheet.eyes.length !== sheet.frames) return [];
      const eyes: RubyEyeAnchor[][] = [];
      for (const anchors of sheet.eyes) {
        if (!Array.isArray(anchors) || anchors.length > 2 || (id !== "sleep" && anchors.length === 0)) return [];
        if (!anchors.every(a => record(a) && finite(a.x, 0, width) && finite(a.y, 0, height) && finite(a.width, 1, width / 3)
          && finite(a.height, 1, height / 3) && a.x + a.width <= width && a.y + a.height <= height)) return [];
        eyes.push(anchors.map(a => ({ x: a.x, y: a.y, width: a.width, height: a.height })));
      }
      scenes[id] = { png: sheet.png, frames: sheet.frames, frameMs: sheet.frameMs, eyes };
      const desktopFrames = id === "walk" ? sheet.frames : 1;
      if (sheet.desktopPng === `/images/ruby-round-v1/${breed}/${id}-desktop.png` && sheet.desktopFrames === desktopFrames) {
        scenes[id].desktopPng = sheet.desktopPng;
        scenes[id].desktopFrames = desktopFrames;
      }
    }
    let reactions: RubyRoundAsset["reactions"];
    if (record(entry.reactions) && Array.isArray(entry.reactions.paws) && entry.reactions.paws.length === 2
      && entry.reactions.paws.every(p => record(p) && finite(p.x, 0, width) && finite(p.y, 0, height) && finite(p.rx, 1, width / 8) && finite(p.ry, 1, height / 8))) {
      reactions = { paws: entry.reactions.paws.map(p => ({ x: p.x, y: p.y, rx: p.rx, ry: p.ry })) };
    }
    seen.add(breed);
    return [{ breed, width, height, aseprite: entry.aseprite, scenes, reactions }];
  });
}
export const rubyRoundAssets = parseRubyRoundAssets(completedAssets);
export const rubyRoundReady = dogBreedIds.every(breed => rubyRoundAssets.some(asset => asset.breed === breed));
export const rubyRoundStyles = rubyRoundReady ? [{ id: rubyRoundStyleId, name: "루비 도트 · 다섯 동작", description: "둥글고 포근한 30견종 · 다섯 애니메이션과 갈아 끼우는 30가지 눈", kind: "pixel" as const }] : [];
export function rubyRoundAsset(breed: PixelBreed) { return rubyRoundAssets.find(asset => asset.breed === breed); }
export function rubyRoundSceneForMood(mood: PixelMood): RubyRoundSceneId {
  if (mood === "walk") return "walk";
  if (mood === "sleep") return "sleep";
  if (mood === "drag" || mood === "scroll") return "side";
  if (mood === "love" || mood === "play") return "happy";
  return "idle";
}
