import completedAssets from "./generated/ruby-round-scene-assets.json";
import akitaArt from './generated/akita-art-revision.json';
import {akitaCoatEnabled} from './akita-coat';
import { dogBreedIds, type PixelBreed } from "./dog-breeds";
import type { PixelMood } from "../components/pixel-dog";

export const rubyRoundStyleId = "ruby-round-scenes" as const;
export const rubyRoundSceneIds = ["idle", "side", "walk", "happy", "sleep"] as const;
export type RubyRoundSceneId = (typeof rubyRoundSceneIds)[number];
export const rubyRoundActionIds = [
  "idle", "side", "walk", "happy", "sleep", "typing", "petting", "eat", "belly", "stretch", "wag", "scratch",
  "walk-left", "walk-right", "walk-up", "walk-down",
] as const;
export type RubyRoundActionId = (typeof rubyRoundActionIds)[number];
export type RubyRoundActionKind = "legacy" | "derived" | "redrawn";
export type RubyRoundEyeMode = "shared" | "closed" | "baked" | "hidden";
export type RubyRoundFrameEyeMode = "shared" | "baked-closed" | "hidden";
export type RubyRoundActionSource = RubyRoundSceneId | "independently-redrawn-atlas";
export type RubyRoundActionDefinition = {
  id: RubyRoundActionId; name: string; description: string; frameMs: number; source: RubyRoundActionSource;
  kind: RubyRoundActionKind; eyeMode: RubyRoundEyeMode;
};

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const integer = (value: unknown, min: number, max: number): value is number => typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
const finite = (value: unknown, min: number, max: number): value is number => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
const isSceneId = (value: unknown): value is RubyRoundSceneId => typeof value === "string" && rubyRoundSceneIds.some(id => id === value);
const isActionKind = (value: unknown): value is RubyRoundActionKind => value === "legacy" || value === "derived" || value === "redrawn";
const isEyeMode = (value: unknown): value is RubyRoundEyeMode => value === "shared" || value === "closed" || value === "baked" || value === "hidden";
const isFrameEyeMode = (value: unknown): value is RubyRoundFrameEyeMode => value === "shared" || value === "baked-closed" || value === "hidden";

function parseActionDefinitions(input: unknown): RubyRoundActionDefinition[] {
  if (!record(input) || input.schemaVersion !== 2 || input.framesPerAction !== 4 || !Array.isArray(input.actions)
    || input.actions.length !== rubyRoundActionIds.length) return [];
  const result: RubyRoundActionDefinition[] = [];
  for (let index = 0; index < rubyRoundActionIds.length; index++) {
    const value = input.actions[index], id = rubyRoundActionIds[index];
    if (!record(value) || value.id !== id || typeof value.name !== "string" || !value.name.trim() || value.name.length > 40
      || typeof value.description !== "string" || !value.description.trim() || value.description.length > 160
      || !integer(value.frameMs, 50, 2000) || !isActionKind(value.kind) || !isEyeMode(value.eyeMode)
      || (value.kind === "redrawn" ? value.source !== "independently-redrawn-atlas"
        : !isSceneId(value.source) || (value.kind === "legacy") !== isSceneId(id))) return [];
    result.push({ id, name: value.name, description: value.description, frameMs: value.frameMs,
      source: value.source as RubyRoundActionSource, kind: value.kind, eyeMode: value.eyeMode });
  }
  return result;
}

// The release manifest copies this metadata from shared/ruby-round-actions.json.
// Reading it here keeps the Vercel frontend bundle inside its configured project root.
const firstGeneratedEntry: unknown = Array.isArray(completedAssets) ? completedAssets[0] : undefined;
const firstGeneratedActions = record(firstGeneratedEntry) && record(firstGeneratedEntry.actions) ? firstGeneratedEntry.actions : undefined;
const generatedActionContract = firstGeneratedActions
  ? { schemaVersion: 2, framesPerAction: 4, actions: rubyRoundActionIds.map(id => firstGeneratedActions[id]) }
  : undefined;
const parsedActions = parseActionDefinitions(generatedActionContract);
export const rubyRoundActions: readonly RubyRoundActionDefinition[] = parsedActions.length === rubyRoundActionIds.length ? parsedActions : [
  { id: "idle", name: "가만히 있기", description: "앞을 보고 편안하게 앉아 숨을 쉬고 눈을 깜빡여요", frameMs: 320, source: "idle", kind: "legacy", eyeMode: "shared" },
  { id: "side", name: "옆모습", description: "옆으로 서서 주변을 살펴봐요", frameMs: 240, source: "side", kind: "legacy", eyeMode: "shared" },
  { id: "walk", name: "기본 걷기", description: "기존 실행파일과 호환되는 옆 방향 걷기예요", frameMs: 140, source: "walk", kind: "legacy", eyeMode: "shared" },
  { id: "happy", name: "반가워요", description: "작은 앞발을 들고 반갑게 인사해요", frameMs: 180, source: "happy", kind: "legacy", eyeMode: "shared" },
  { id: "sleep", name: "잠자기", description: "편안하게 누워 포근히 잠들어요", frameMs: 650, source: "sleep", kind: "legacy", eyeMode: "closed" },
];
export const rubyRoundScenes = rubyRoundActions.filter((action): action is RubyRoundActionDefinition & { id: RubyRoundSceneId } => isSceneId(action.id));
export function isRubyRoundSceneId(value: unknown): value is RubyRoundSceneId { return isSceneId(value); }
export function isRubyRoundActionId(value: unknown): value is RubyRoundActionId { return typeof value === "string" && rubyRoundActionIds.some(id => id === value); }

export type RubyEyeAnchor = { x: number; y: number; width: number; height: number };
export type RubyRoundSheet = {
  revision?: {bodySha256:string;maskSha256:string;closedSha256:string;desktopBodySha256:string;desktopMaskSha256:string;previewSha256:string};
  png: string; frames: number; frameMs: number; eyes: RubyEyeAnchor[][]; source: RubyRoundActionSource;
  kind: RubyRoundActionKind; eyeMode: RubyRoundEyeMode; desktopPng?: string; desktopFrames?: number;
  eyeModeByFrame?: RubyRoundFrameEyeMode[];
};
export type RubyRoundAsset = {
  breed: PixelBreed; width: number; height: number; aseprite: string; motionAseprite?: string;
  scenes: Record<RubyRoundSceneId, RubyRoundSheet>; actions?: Record<RubyRoundActionId, RubyRoundSheet>;
  reactions?: { paws: { x: number; y: number; rx: number; ry: number }[] };
};

function parseFrameEyeModes(value: unknown, frames: number): RubyRoundFrameEyeMode[] | undefined {
  return Array.isArray(value) && value.length === frames && value.every(isFrameEyeMode) ? [...value] : undefined;
}

/** Old sheets use one mode; redrawn sheets may close their painted eyes during a pose. */
export function rubyRoundFrameEyeMode(sheet: RubyRoundSheet, frame: number): RubyRoundFrameEyeMode {
  return sheet.eyeModeByFrame?.[frame] ?? (sheet.eyeMode === "hidden" ? "hidden" : sheet.eyeMode === "baked" ? "baked-closed" : "shared");
}

function parseEyes(value: unknown, frames: number, width: number, height: number, eyeMode: RubyRoundEyeMode,
  eyeModeByFrame?: RubyRoundFrameEyeMode[]): RubyEyeAnchor[][] | undefined {
  if (!Array.isArray(value) || value.length !== frames) return;
  const eyes: RubyEyeAnchor[][] = [];
  for (let index = 0; index < value.length; index++) {
    const anchors = value[index];
    const shared = eyeModeByFrame ? eyeModeByFrame[index] === "shared" : eyeMode !== "hidden" && eyeMode !== "baked";
    if (!Array.isArray(anchors) || anchors.length > 2
      || (shared ? anchors.length === 0 : anchors.length !== 0)) return;
    if (!anchors.every(anchor => record(anchor) && finite(anchor.x, 0, width) && finite(anchor.y, 0, height)
      && finite(anchor.width, 1, width / 3) && finite(anchor.height, 1, height / 3)
      && anchor.x + anchor.width <= width && anchor.y + anchor.height <= height)) return;
    eyes.push(anchors.map(anchor => ({ x: anchor.x, y: anchor.y, width: anchor.width, height: anchor.height })));
  }
  return eyes;
}

function parseLegacyScenes(value: unknown, breed: PixelBreed, width: number, height: number) {
  if (!record(value)) return;
  const scenes = {} as Record<RubyRoundSceneId, RubyRoundSheet>;
  for (const definition of rubyRoundScenes) {
    const sheet = value[definition.id];
    if (!record(sheet) || sheet.png !== `/images/ruby-round-v1/${breed}/${definition.id}.png`
      || !integer(sheet.frames, 2, 16) || !integer(sheet.frameMs, 50, 2000)) return;
    const eyeMode = sheet.eyeMode === undefined ? definition.eyeMode : sheet.eyeMode;
    if (!isEyeMode(eyeMode)) return;
    const eyeModeByFrame = parseFrameEyeModes(sheet.eyeModeByFrame, sheet.frames);
    if (sheet.eyeModeByFrame !== undefined && !eyeModeByFrame) return;
    const eyes = parseEyes(sheet.eyes, sheet.frames, width, height, eyeMode, eyeModeByFrame);
    if (!eyes) return;
    scenes[definition.id] = { png: sheet.png, frames: sheet.frames, frameMs: sheet.frameMs, eyes,
      source: definition.source, kind: definition.kind, eyeMode, eyeModeByFrame };
    const desktopFrames = definition.id === "walk" ? sheet.frames : 1;
    if (sheet.desktopPng === `/images/ruby-round-v1/${breed}/${definition.id}-desktop.png` && sheet.desktopFrames === desktopFrames) {
      scenes[definition.id].desktopPng = sheet.desktopPng;
      scenes[definition.id].desktopFrames = desktopFrames;
    }
  }
  return scenes;
}

function parseActions(value: unknown, breed: PixelBreed, width: number, height: number) {
  if (!record(value) || rubyRoundActions.length !== rubyRoundActionIds.length) return;
  const actions = {} as Record<RubyRoundActionId, RubyRoundSheet>;
  for (const definition of rubyRoundActions) {
    const sheet = value[definition.id];
    const expectedPng = isSceneId(definition.id) ? `/images/ruby-round-v1/${breed}/${definition.id}.png`
      : `/images/ruby-round-v1/${breed}/actions/${definition.id}.png`;
    if (!record(sheet) || sheet.png !== expectedPng || sheet.frames !== 4 || sheet.frameMs !== definition.frameMs
      || sheet.source !== definition.source || sheet.kind !== definition.kind || sheet.eyeMode !== definition.eyeMode) return;
    const eyeModeByFrame = parseFrameEyeModes(sheet.eyeModeByFrame, 4);
    if ((sheet.eyeModeByFrame !== undefined || definition.kind === "redrawn") && !eyeModeByFrame) return;
    const eyes = parseEyes(sheet.eyes, 4, width, height, definition.eyeMode, eyeModeByFrame);
    if (!eyes) return;
    actions[definition.id] = { png: sheet.png, frames: 4, frameMs: definition.frameMs, eyes,
      source: definition.source, kind: definition.kind, eyeMode: definition.eyeMode, eyeModeByFrame };
  }
  return actions;
}

/** Core five-scene records remain valid for the installed desktop client; a complete v2 record adds all sixteen web actions. */
export function parseRubyRoundAssets(input: unknown): RubyRoundAsset[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  return input.flatMap(entry => {
    if (!record(entry) || !dogBreedIds.some(id => id === entry.breed) || !integer(entry.width, 96, 2048)
      || !integer(entry.height, 96, 2048)) return [];
    const breed = entry.breed as PixelBreed, width = entry.width, height = entry.height;
    if (seen.has(breed) || entry.aseprite !== `/downloads/ruby-round-v1/${breed}.aseprite`) return [];
    const scenes = parseLegacyScenes(entry.scenes, breed, width, height);
    if (!scenes) return [];
    let actions: Record<RubyRoundActionId, RubyRoundSheet> | undefined, motionAseprite: string | undefined;
    if (entry.actions !== undefined || entry.motionAseprite !== undefined) {
      const parsed = parseActions(entry.actions, breed, width, height);
      if (parsed && entry.motionAseprite === `/downloads/ruby-round-v1/${breed}-16-actions.aseprite`) {
        actions = parsed;
        motionAseprite = entry.motionAseprite;
      }
    }
    let reactions: RubyRoundAsset["reactions"];
    if (record(entry.reactions) && Array.isArray(entry.reactions.paws) && entry.reactions.paws.length === 2
      && entry.reactions.paws.every(paw => record(paw) && finite(paw.x, 0, width) && finite(paw.y, 0, height)
        && finite(paw.rx, 1, width / 8) && finite(paw.ry, 1, height / 8))) {
      reactions = { paws: entry.reactions.paws.map(paw => ({ x: paw.x, y: paw.y, rx: paw.rx, ry: paw.ry })) };
    }
    seen.add(breed);
    return [{ breed, width, height, aseprite: entry.aseprite, motionAseprite, scenes, actions, reactions }];
  });
}

export const rubyRoundAssets = parseRubyRoundAssets(completedAssets);
export const rubyRoundReady = dogBreedIds.every(breed => rubyRoundAssets.some(asset => asset.breed === breed));
export const rubyRoundActionsReady = rubyRoundActions.length === rubyRoundActionIds.length
  && dogBreedIds.every(breed => rubyRoundAssets.some(asset => asset.breed === breed && !!asset.actions && !!asset.motionAseprite));
export const rubyRoundStyles = rubyRoundReady ? [{ id: rubyRoundStyleId,
  name: rubyRoundActionsReady ? "루비 도트 · 열여섯 동작" : "루비 도트 · 다섯 동작",
  description: rubyRoundActionsReady ? "둥글고 포근한 30견종 · 열여섯 애니메이션과 갈아 끼우는 30가지 눈" : "둥글고 포근한 30견종 · 다섯 애니메이션과 갈아 끼우는 30가지 눈",
  kind: "pixel" as const }] : [];
export function rubyRoundAsset(breed: PixelBreed) {
  const asset=rubyRoundAssets.find(asset => asset.breed === breed);
  if(!asset||breed!=='akita'||!asset.actions||!akitaCoatEnabled())return asset;
  const revised=(id:RubyRoundActionId,sheet:RubyRoundSheet):RubyRoundSheet=>{
    const art=akitaArt.actions[id];
    return {...sheet,revision:art,frames:4,frameMs:art.frameMs,kind:'redrawn',eyes:art.eyes,
      eyeModeByFrame:art.eyeModes.map(mode=>mode==='closed'?'baked-closed':mode) as RubyRoundFrameEyeMode[]};
  };
  return {...asset,scenes:Object.fromEntries(rubyRoundSceneIds.map(id=>[id,revised(id,asset.scenes[id])])) as RubyRoundAsset['scenes'],
    actions:Object.fromEntries(rubyRoundActionIds.map(id=>[id,revised(id,asset.actions![id])])) as RubyRoundAsset['actions']};
}
export function rubyRoundActionList(asset?: RubyRoundAsset) {
  return asset ? asset.actions ? rubyRoundActions : rubyRoundScenes : rubyRoundActionsReady ? rubyRoundActions : rubyRoundScenes;
}
export function rubyRoundActionSheets(asset: RubyRoundAsset): Record<RubyRoundActionId, RubyRoundSheet> | Record<RubyRoundSceneId, RubyRoundSheet> {
  return asset.actions ?? asset.scenes;
}
export function rubyRoundActionForMood(mood: PixelMood): RubyRoundActionId {
  if (mood === "typing" || mood === "excited") return "typing";
  if (mood === "eat") return "eat";
  if (mood === "belly") return "belly";
  if (mood === "walk") return "walk";
  if (mood === "sleep") return "sleep";
  if (mood === "drag" || mood === "scroll") return "side";
  if (mood === "love") return "petting";
  if (mood === "play") return "wag";
  return "idle";
}
/** @deprecated Use rubyRoundActionForMood. */
export const rubyRoundSceneForMood = rubyRoundActionForMood;
