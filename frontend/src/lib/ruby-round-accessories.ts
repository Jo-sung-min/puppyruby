// Generated verbatim from shared/accessories.json because the frontend build root
// cannot import files outside frontend. The prepare script keeps this copy current.
import accessorySource from "./generated/ruby-accessories.json";
import { akitaRig, akitaCoatSheet, akitaCoatAssets, coatAssetUrl } from './akita-coat';
import anchorSource from "./generated/ruby-round-accessory-anchors.json";
import { dogBreedIds, type PixelBreed } from "./dog-breeds";
import { isRubyRoundSceneId, rubyRoundAsset, rubyRoundScenes, type RubyRoundSceneId, type RubyRoundActionId } from "./ruby-round-scene-styles";

export const rubyAccessorySlots = ["face", "head", "neck", "back"] as const;
export const rubyAccessoryLayers = ["behind", "front"] as const;
export type RubyAccessorySlot = (typeof rubyAccessorySlots)[number];
export type RubyAccessoryLayerName = (typeof rubyAccessoryLayers)[number];
export type RubyAccessoryRenderer = "builtin" | "image";

export type RubyAccessoryAsset = {
  png: string; sha256: string; width: number; height: number; pivotX: number; pivotY: number;
};
export type RubyAccessoryTransform = {
  offsetX: number; offsetY: number; scaleX: number; scaleY: number; rotation: number; flipX: boolean;
};
export type RubyAccessoryItem = {
  id: string; label: string; emoji?: string; availability: "free" | "paid"; slot: RubyAccessorySlot; layer: RubyAccessoryLayerName;
  renderer: RubyAccessoryRenderer; revision: string; asset?: RubyAccessoryAsset; defaultTransform: RubyAccessoryTransform;
  grade?: "R" | "SR" | "SSR"; weight?: number;
};
export type RubyAccessoryPlacement = {
  x: number; y: number; width: number; height: number; rotation: number; flipX: boolean; visible: boolean;
};
export type RubyAccessoryFrameSlots = Partial<Record<RubyAccessorySlot, RubyAccessoryPlacement>>;
export type RubyAccessoryAnchorEntry = {
  width: number; height: number; scenes: Record<RubyRoundSceneId, RubyAccessoryFrameSlots[]>;
};
export type RubyAccessoryCatalog = { schemaVersion: number; revision: string; items: RubyAccessoryItem[] };
export type RubyAccessoryAnchors = Partial<Record<PixelBreed, RubyAccessoryAnchorEntry>>;
export type RubyAccessoryPlacementOverride = Partial<RubyAccessoryPlacement>;
export type RubyAccessoryItemOverrideEntry = {
  breeds: Partial<Record<PixelBreed, { scenes: Partial<Record<RubyRoundSceneId, Array<RubyAccessoryPlacementOverride | null>>> }>>;
};
export type RubyAccessoryItemOverrides = Record<string, RubyAccessoryItemOverrideEntry>;

type JsonRecord = Record<string, unknown>;
const record = (value: unknown): value is JsonRecord => !!value && typeof value === "object" && !Array.isArray(value);
const finite = (value: unknown, min: number, max: number): value is number => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
const integer = (value: unknown, min: number, max: number): value is number => typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
const oneOf = <T extends readonly string[]>(values: T, value: unknown): value is T[number] => typeof value === "string" && values.includes(value);
const invalidCatalog = (): RubyAccessoryCatalog => ({ schemaVersion: 1, revision: "invalid", items: [] });
const builtinAccessoryIds = new Set(["ribbon", "scarf", "crown", "bow-blue", "bow-lilac", "party-hat", "flower", "glasses", "halo", "angel-wings"]);

function parseDefaultTransform(value: unknown): RubyAccessoryTransform | undefined {
  if (value !== undefined && !record(value)) return;
  const input = record(value) ? value : {};
  if (Object.keys(input).some(key => !["offsetX", "offsetY", "scaleX", "scaleY", "rotation", "flipX"].includes(key))
    || (input.offsetX !== undefined && !finite(input.offsetX, -512, 512)) || (input.offsetY !== undefined && !finite(input.offsetY, -512, 512))
    || (input.scaleX !== undefined && !finite(input.scaleX, .05, 2)) || (input.scaleY !== undefined && !finite(input.scaleY, .05, 2))
    || (input.rotation !== undefined && !finite(input.rotation, -180, 180)) || (input.flipX !== undefined && typeof input.flipX !== "boolean")) return;
  return {
    offsetX: finite(input.offsetX, -512, 512) ? input.offsetX : 0,
    offsetY: finite(input.offsetY, -512, 512) ? input.offsetY : 0,
    scaleX: finite(input.scaleX, .05, 2) ? input.scaleX : 1,
    scaleY: finite(input.scaleY, .05, 2) ? input.scaleY : 1,
    rotation: finite(input.rotation, -180, 180) ? input.rotation : 0,
    flipX: input.flipX === true,
  };
}

/** Parse the shared finite catalog. Invalid or duplicate items never enter a renderer or desktop descriptor. */
export function parseRubyAccessoryCatalog(input: unknown): RubyAccessoryCatalog {
  const source = Array.isArray(input) ? { schemaVersion: 1, revision: "legacy", items: input } : input;
  if (!record(source) || source.schemaVersion !== 1 || !Array.isArray(source.items) || source.items.length < 1 || source.items.length > 1000
    || Object.keys(source).some(key => !["schemaVersion", "revision", "items"].includes(key))
    || typeof source.revision !== "string" || !/^[a-zA-Z0-9._-]{1,80}$/.test(source.revision)) return invalidCatalog();
  const revision = source.revision;
  const seen = new Set<string>(), items: RubyAccessoryItem[] = [];
  for (const value of source.items) {
    if (!record(value) || Object.keys(value).some(key => !["id", "label", "emoji", "availability", "slot", "layer", "renderer", "revision", "grade", "weight", "asset", "defaultTransform"].includes(key))
      || typeof value.id !== "string" || value.id.length > 40 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.id) || value.id === "none" || seen.has(value.id)
      || typeof value.label !== "string" || !value.label.trim() || value.label.length > 80
      || (value.availability !== "free" && value.availability !== "paid")
      || !oneOf(rubyAccessorySlots, value.slot) || !oneOf(rubyAccessoryLayers, value.layer)
      || (value.renderer !== "builtin" && value.renderer !== "image")
      || !((typeof value.revision === "string" && /^[a-zA-Z0-9._-]{1,80}$/.test(value.revision)) || integer(value.revision, 1, 1_000_000))) return invalidCatalog();
    let asset: RubyAccessoryAsset | undefined;
    if (record(value.asset) && typeof value.asset.png === "string"
      && value.asset.png === `/images/ruby-round-v1/accessories/${value.id}.png`
      && typeof value.asset.sha256 === "string" && /^[a-f0-9]{64}$/.test(value.asset.sha256)
      && integer(value.asset.width, 1, 2048) && integer(value.asset.height, 1, 2048)
      && finite(value.asset.pivotX, 0, value.asset.width) && finite(value.asset.pivotY, 0, value.asset.height)) {
      asset = { png: value.asset.png, sha256: value.asset.sha256, width: value.asset.width, height: value.asset.height,
        pivotX: value.asset.pivotX, pivotY: value.asset.pivotY };
    }
    if (value.renderer === "image" && !asset || value.renderer === "builtin" && (!builtinAccessoryIds.has(value.id) || value.asset !== undefined)) return invalidCatalog();
    const defaultTransform = parseDefaultTransform(value.defaultTransform);
    if (!defaultTransform) return invalidCatalog();
    seen.add(value.id);
    const grade = value.grade === "R" || value.grade === "SR" || value.grade === "SSR" ? value.grade : undefined;
    const weight = integer(value.weight, 0, 1_000_000) ? value.weight : undefined;
    if (value.availability === "paid" && (!grade || weight === undefined)
      || value.availability === "free" && (value.grade !== undefined || value.weight !== undefined)) return invalidCatalog();
    if (value.renderer === "image" && value.availability === "paid" && weight !== 0) return invalidCatalog();
    items.push({ id: value.id, label: value.label.trim(), emoji: typeof value.emoji === "string" && value.emoji.length <= 16 ? value.emoji : undefined,
      availability: value.availability, slot: value.slot, layer: value.layer, renderer: value.renderer, revision: String(value.revision), asset,
      defaultTransform, grade, weight });
  }
  if (!["ribbon", "scarf", "crown"].every(id => items.some(item => item.id === id && item.availability === "free"))
    || !["bow-blue", "bow-lilac", "party-hat", "flower", "glasses", "halo", "angel-wings"].every(id => items.some(item => item.id === id && item.availability === "paid"))
    || !items.some(item => item.availability === "paid" && (item.weight ?? 0) > 0)) return invalidCatalog();
  return { schemaVersion: source.schemaVersion, revision, items };
}

function parsePlacement(value: unknown, width: number, height: number): RubyAccessoryPlacement | undefined {
  if (!record(value) || !finite(value.x, 0, width) || !finite(value.y, 0, height)
    || !finite(value.width, .25, width) || !finite(value.height, .25, height)
    || !finite(value.rotation, -180, 180) || (value.flipX !== undefined && typeof value.flipX !== "boolean")
    || (value.visible !== undefined && typeof value.visible !== "boolean")) return;
  return { x: value.x, y: value.y, width: value.width, height: value.height, rotation: value.rotation,
    flipX: value.flipX === true, visible: value.visible !== false };
}

/** The generated attachment map is deliberately separate from item metadata, so new art reuses reviewed dog slots. */
export function parseRubyAccessoryAnchors(input: unknown): RubyAccessoryAnchors {
  const source = record(input) && record(input.breeds) ? input.breeds : input;
  if (!record(source)) return {};
  const result: RubyAccessoryAnchors = {};
  for (const breed of dogBreedIds) {
    const value = source[breed], asset = rubyRoundAsset(breed);
    if (!record(value) || !asset || value.width !== asset.width || value.height !== asset.height || !record(value.scenes)) continue;
    const scenes = {} as RubyAccessoryAnchorEntry["scenes"];
    let valid = true;
    for (const { id } of rubyRoundScenes) {
      const frames = value.scenes[id], expected = asset.scenes[id].frames;
      if (!Array.isArray(frames) || frames.length !== expected) { valid = false; break; }
      const parsed: RubyAccessoryFrameSlots[] = [];
      for (const frame of frames) {
        if (!record(frame)) { valid = false; break; }
        const slots: RubyAccessoryFrameSlots = {};
        for (const slot of rubyAccessorySlots) {
          if (frame[slot] === undefined) { valid = false; break; }
          const placement = parsePlacement(frame[slot], asset.width, asset.height);
          if (!placement) { valid = false; break; }
          slots[slot] = placement;
        }
        if (!valid) break;
        parsed.push(slots);
      }
      if (!valid) break;
      scenes[id] = parsed;
    }
    if (valid) result[breed] = { width: asset.width, height: asset.height, scenes };
  }
  return result;
}

function parsePlacementOverride(value: unknown, width: number, height: number): RubyAccessoryPlacementOverride | undefined {
  if (!record(value) || Object.keys(value).length < 1
    || Object.keys(value).some(key => !["x", "y", "width", "height", "rotation", "flipX", "visible"].includes(key))
    || (value.x !== undefined && !finite(value.x, -width * 2, width * 2))
    || (value.y !== undefined && !finite(value.y, -height * 2, height * 2))
    || (value.width !== undefined && !finite(value.width, .25, width * 2))
    || (value.height !== undefined && !finite(value.height, .25, height * 2))
    || (value.rotation !== undefined && !finite(value.rotation, -180, 180))
    || (value.flipX !== undefined && typeof value.flipX !== "boolean")
    || (value.visible !== undefined && typeof value.visible !== "boolean")) return;
  return Object.fromEntries(Object.entries(value)) as RubyAccessoryPlacementOverride;
}

/** Optional per-item exceptions are sparse; the common breed/frame slot remains the default. */
export function parseRubyAccessoryItemOverrides(input: unknown, catalog: RubyAccessoryCatalog): RubyAccessoryItemOverrides {
  if (!record(input) || !record(input.itemOverrides)) return {};
  const knownItems = new Set(catalog.items.map(item => item.id));
  const result: RubyAccessoryItemOverrides = {};
  for (const [itemId, itemValue] of Object.entries(input.itemOverrides)) {
    if (!knownItems.has(itemId) || !record(itemValue) || Object.keys(itemValue).some(key => key !== "breeds") || !record(itemValue.breeds)) return {};
    const breeds: RubyAccessoryItemOverrideEntry["breeds"] = {};
    for (const [breedId, breedValue] of Object.entries(itemValue.breeds)) {
      const breed = breedId as PixelBreed, asset = rubyRoundAsset(breed);
      if (!dogBreedIds.includes(breed) || !asset || !record(breedValue)
        || Object.keys(breedValue).some(key => key !== "scenes") || !record(breedValue.scenes)) return {};
      const scenes: Partial<Record<RubyRoundSceneId, Array<RubyAccessoryPlacementOverride | null>>> = {};
      for (const [sceneId, framesValue] of Object.entries(breedValue.scenes)) {
        if (!rubyRoundScenes.some(scene => scene.id === sceneId) || !Array.isArray(framesValue)
          || framesValue.length > asset.scenes[sceneId as RubyRoundSceneId].frames) return {};
        const parsed: Array<RubyAccessoryPlacementOverride | null> = [];
        for (const frameValue of framesValue) {
          if (frameValue === null) { parsed.push(null); continue; }
          const override = parsePlacementOverride(frameValue, asset.width, asset.height);
          if (!override) return {};
          parsed.push(override);
        }
        scenes[sceneId as RubyRoundSceneId] = parsed;
      }
      breeds[breed] = { scenes };
    }
    result[itemId] = { breeds };
  }
  return result;
}

export const rubyAccessoryCatalog = parseRubyAccessoryCatalog(accessorySource);
export const rubyAccessoryAnchors = parseRubyAccessoryAnchors(anchorSource);
export const rubyAccessoryItemOverrides = parseRubyAccessoryItemOverrides(anchorSource, rubyAccessoryCatalog);
export function rubyAccessoryItem(id: unknown) { return typeof id === "string" ? rubyAccessoryCatalog.items.find(item => item.id === id) : undefined; }
/** Pilot reuses the existing owned glasses ID; it never grants a new paid item. */
export function rubyAccessoryItemForBreed(id:unknown,breed:PixelBreed):RubyAccessoryItem|undefined {
  const item=rubyAccessoryItem(id), sheet=rubyRoundAsset(breed)?.actions?.idle;
  if(item?.id!=='glasses'||!sheet||!akitaCoatSheet(breed,'idle',sheet.png))return item;
  const asset=akitaCoatAssets.glasses;
  return {...item,renderer:'image',revision:`akita-glasses-${asset.sha256.slice(0,12)}`,asset:{...asset,png:coatAssetUrl(asset.sha256)}};
}
export function rubyAccessoryPlacement(breed: PixelBreed, scene: RubyRoundSceneId, frame: number, slot: RubyAccessorySlot) {
  const pilot = akitaFrameSlot(breed, scene, frame, slot);
  if (pilot) return pilot;
  const frames = rubyAccessoryAnchors[breed]?.scenes[scene];
  if (!frames?.length || !Number.isFinite(frame)) return;
  return frames[Math.abs(Math.trunc(frame)) % frames.length]?.[slot];
}

export function resolvedRubyAccessoryPlacement(item: RubyAccessoryItem, breed: PixelBreed, scene: RubyRoundSceneId, frame: number,
  itemOverrides: RubyAccessoryItemOverrides = rubyAccessoryItemOverrides) {
  const placement = rubyAccessoryPlacement(breed, scene, frame, item.slot), asset = rubyRoundAsset(breed);
  if (!placement || !asset) return;
  const overrideFrames = itemOverrides[item.id]?.breeds[breed]?.scenes[scene];
  const override = overrideFrames?.[Math.abs(Math.trunc(frame)) % Math.max(1, asset.scenes[scene].frames)] ?? undefined;
  return transformedPlacement(item, placement, asset.width, asset.height, override);
}

/** Extra native poses follow their own head geometry, never an idle-scene slot. */
export function resolvedRubyAccessoryActionPlacement(item: RubyAccessoryItem, breed: PixelBreed, action: RubyRoundActionId, frame: number) {
  const pilot = akitaFrameSlot(breed, action, frame, item.slot), pilotAsset = rubyRoundAsset(breed);
  if (pilot && pilotAsset) return transformedPlacement(item, pilot, pilotAsset.width, pilotAsset.height);
  if (isRubyRoundSceneId(action)) return resolvedRubyAccessoryPlacement(item, breed, action, frame);
  const asset = rubyRoundAsset(breed), sheet = asset?.actions?.[action];
  if (!asset || !sheet || sheet.kind !== "redrawn" || !Number.isFinite(frame)) return;
  const index = Math.abs(Math.trunc(frame)) % sheet.frames;
  let anchors = sheet.eyes[index];
  // These poses keep the same head orientation through a blink. A closed
  // supine/stretch/scratch face needs its own reviewed slot; borrowing a sitting
  // head there would float an accessory away from the dog.
  if (!anchors.length && sheet.eyeModeByFrame?.[index] === "baked-closed"
    && !["belly", "stretch", "scratch"].includes(action)) {
    anchors = sheet.eyes.map((eyes, candidate) => ({ eyes, distance: Math.abs(candidate - index) }))
      .filter(candidate => candidate.eyes.length).sort((a, b) => a.distance - b.distance)[0]?.eyes ?? anchors;
  }
  const visible = anchors.length > 0;
  const left = visible ? Math.min(...anchors.map(eye => eye.x)) : asset.width * .42;
  const right = visible ? Math.max(...anchors.map(eye => eye.x + eye.width)) : asset.width * .58;
  const top = visible ? Math.min(...anchors.map(eye => eye.y)) : asset.height * .34;
  const bottom = visible ? Math.max(...anchors.map(eye => eye.y + eye.height)) : asset.height * .43;
  const centerX = (left + right) / 2, centerY = (top + bottom) / 2;
  const angle = anchors.length === 2 ? Math.atan2(anchors[1].y + anchors[1].height / 2 - anchors[0].y - anchors[0].height / 2,
    anchors[1].x + anchors[1].width / 2 - anchors[0].x - anchors[0].width / 2) : 0;
  const slot = { face: { y: 0, width: 22, height: 10 }, head: { y: -18, width: 18, height: 14 },
    neck: { y: 13, width: 24, height: 12 }, back: { y: 10.24, width: 58, height: 23 } }[item.slot];
  const offset = asset.height * slot.y / 64;
  return transformedPlacement(item, {
    x: Math.max(0, Math.min(asset.width, centerX - Math.sin(angle) * offset)),
    y: Math.max(0, Math.min(asset.height, centerY + Math.cos(angle) * offset)),
    width: asset.width * slot.width / 64, height: asset.height * slot.height / 64,
    rotation: angle * 180 / Math.PI, flipX: false, visible,
  }, asset.width, asset.height);
}

function akitaFrameSlot(breed: PixelBreed, action: RubyRoundActionId, frame: number, slot: RubyAccessorySlot) {
  const sheet = rubyRoundAsset(breed)?.actions?.[action];
  if (!sheet || !Number.isFinite(frame) || !akitaCoatSheet(breed, action, sheet.png)) return;
  const value = akitaRig.actions[action]?.[Math.abs(Math.trunc(frame)) % 4]?.[slot];
  if (!value) return;
  const { view, ...placement } = value;
  return placement;
}

function transformedPlacement(item: RubyAccessoryItem, placement: RubyAccessoryPlacement, width: number, height: number, override?: RubyAccessoryPlacementOverride) {
  const transform = item.defaultTransform;
  const resolved = { ...placement, x: placement.x + transform.offsetX, y: placement.y + transform.offsetY,
    width: placement.width * transform.scaleX, height: placement.height * transform.scaleY,
    rotation: ((placement.rotation + transform.rotation + 180) % 360 + 360) % 360 - 180,
    flipX: placement.flipX !== transform.flipX };
  if (override) Object.assign(resolved, override);
  if (!finite(resolved.x, -width * 2, width * 2) || !finite(resolved.y, -height * 2, height * 2)
    || !finite(resolved.width, .25, width * 2) || !finite(resolved.height, .25, height * 2)
    || !finite(resolved.rotation, -180, 180) || typeof resolved.flipX !== "boolean" || typeof resolved.visible !== "boolean") return;
  return resolved;
}
