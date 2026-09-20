'use strict';

// Derive reusable attachment slots from the reviewed per-frame Ruby eye anchors.
// Artists can refine this generated file without creating a dog image per accessory.
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'frontend/src/lib/generated/ruby-round-scene-assets.json');
const target = path.join(root, 'frontend/src/lib/generated/ruby-round-accessory-anchors.json');
const assets = JSON.parse(fs.readFileSync(source, 'utf8'));
const sceneIds = ['idle', 'side', 'walk', 'happy', 'sleep'];
const slotIds = ['face', 'head', 'neck', 'back'];
const placementKeys = ['x', 'y', 'width', 'height', 'rotation', 'flipX', 'visible'];
const isRecord = value => value && typeof value === 'object' && !Array.isArray(value);
const round = value => Math.round(value * 1000) / 1000;
const placement = (x, y, width, height, visible = true) => ({
  x: round(x), y: round(y), width: round(width), height: round(height), rotation: 0, flipX: false, visible,
});

const breeds = {};
for (const asset of assets) {
  const scenes = {};
  for (const scene of sceneIds) {
    const sheet = asset.scenes[scene];
    scenes[scene] = sheet.eyes.map((nativeEyes, frameIndex) => {
      // A blink closes the drawn eyelids, not the face attachment slot. The
      // nearest open frame retains glasses/head/neck positions during a blink.
      const nearest = sheet.eyeModeByFrame?.[frameIndex] === 'baked-closed'
        ? sheet.eyes.map((eyes, index) => ({ eyes, distance: Math.abs(index - frameIndex) }))
          .filter(candidate => candidate.eyes.length > 0).sort((a, b) => a.distance - b.distance)[0]?.eyes
        : undefined;
      const eyes = nativeEyes.length ? nativeEyes : nearest ?? nativeEyes;
      const visibleFace = eyes.length > 0;
      const left = visibleFace ? Math.min(...eyes.map(eye => eye.x)) : asset.width * .42;
      const right = visibleFace ? Math.max(...eyes.map(eye => eye.x + eye.width)) : asset.width * .58;
      const top = visibleFace ? Math.min(...eyes.map(eye => eye.y)) : asset.height * .34;
      const bottom = visibleFace ? Math.max(...eyes.map(eye => eye.y + eye.height)) : asset.height * .43;
      const centerX = (left + right) / 2, centerY = (top + bottom) / 2;
      const faceWidth = asset.width * 22 / 64;
      const faceHeight = asset.height * 10 / 64;
      return {
        face: placement(centerX, centerY, faceWidth, faceHeight, visibleFace),
        head: placement(centerX, Math.max(asset.height * .035, centerY - asset.height * 18 / 64), asset.width * 18 / 64, asset.height * 14 / 64),
        neck: placement(centerX, Math.min(asset.height * .82, centerY + asset.height * 13 / 64), asset.width * 24 / 64, asset.height * 12 / 64),
        back: placement(centerX, Math.min(asset.height * .74, centerY + asset.height * .16), asset.width * 58 / 64, asset.height * 23 / 64),
      };
    });
  }
  breeds[asset.breed] = { width: asset.width, height: asset.height, scenes };
}

if (Object.keys(breeds).length !== 30) throw new Error(`Expected 30 Ruby breeds, got ${Object.keys(breeds).length}`);
const overridesPath = path.join(root, 'shared/ruby-round-accessory-anchor-overrides.json');
let overrideCount = 0;
let itemOverrideCount = 0;
const itemOverrides = {};
if (fs.existsSync(overridesPath)) {
  const document = JSON.parse(fs.readFileSync(overridesPath, 'utf8'));
  if (!isRecord(document) || document.schemaVersion !== 1 || typeof document.revision !== 'string'
    || !/^[A-Za-z0-9._-]{1,80}$/u.test(document.revision)
    || Object.keys(document).some(key => !['schemaVersion', 'revision', 'breeds', 'items'].includes(key)))
    throw new Error('Accessory override document must match schemaVersion 1');
  const overrides = isRecord(document.breeds) ? document.breeds : document;
  if (!isRecord(overrides)) throw new Error('Accessory anchor overrides must be an object');
  for (const [breed, breedOverride] of Object.entries(overrides)) {
    if (!breeds[breed] || !isRecord(breedOverride) || !isRecord(breedOverride.scenes)) throw new Error(`Invalid accessory override breed: ${breed}`);
    for (const [scene, frameOverrides] of Object.entries(breedOverride.scenes)) {
      if (!sceneIds.includes(scene) || !Array.isArray(frameOverrides) || frameOverrides.length > breeds[breed].scenes[scene].length)
        throw new Error(`Invalid accessory override scene: ${breed}/${scene}`);
      frameOverrides.forEach((frameOverride, frame) => {
        if (frameOverride == null) return;
        if (!isRecord(frameOverride) || Object.keys(frameOverride).some(slot => !slotIds.includes(slot))) throw new Error(`Invalid accessory override frame: ${breed}/${scene}/${frame}`);
        for (const [slot, values] of Object.entries(frameOverride)) {
          if (!isRecord(values) || Object.keys(values).some(key => !placementKeys.includes(key)))
            throw new Error(`Invalid accessory override slot: ${breed}/${scene}/${frame}/${slot}`);
          breeds[breed].scenes[scene][frame][slot] = { ...breeds[breed].scenes[scene][frame][slot], ...values };
          overrideCount++;
        }
      });
    }
  }

  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'shared/accessories.json'), 'utf8'));
  const accessoryIds = new Set(Array.isArray(catalog.items) ? catalog.items.map(item => item.id) : []);
  const definitions = document.items ?? {};
  if (!isRecord(definitions)) throw new Error('Accessory item overrides must be an object');
  for (const [itemId, itemOverride] of Object.entries(definitions)) {
    if (!accessoryIds.has(itemId) || !isRecord(itemOverride) || Object.keys(itemOverride).some(key => key !== 'breeds') || !isRecord(itemOverride.breeds))
      throw new Error(`Invalid accessory item override: ${itemId}`);
    const normalized = { breeds: {} };
    for (const [breed, breedOverride] of Object.entries(itemOverride.breeds)) {
      if (!breeds[breed] || !isRecord(breedOverride) || Object.keys(breedOverride).some(key => key !== 'scenes') || !isRecord(breedOverride.scenes))
        throw new Error(`Invalid accessory item override breed: ${itemId}/${breed}`);
      const normalizedBreed = { scenes: {} };
      for (const [scene, frameOverrides] of Object.entries(breedOverride.scenes)) {
        if (!sceneIds.includes(scene) || !Array.isArray(frameOverrides) || frameOverrides.length > breeds[breed].scenes[scene].length)
          throw new Error(`Invalid accessory item override scene: ${itemId}/${breed}/${scene}`);
        normalizedBreed.scenes[scene] = frameOverrides.map((frameOverride, frame) => {
          if (frameOverride === null) return null;
          if (!isRecord(frameOverride) || Object.keys(frameOverride).length < 1 || Object.keys(frameOverride).some(key => !placementKeys.includes(key)))
            throw new Error(`Invalid accessory item override frame: ${itemId}/${breed}/${scene}/${frame}`);
          const width = breeds[breed].width, height = breeds[breed].height;
          if (frameOverride.x !== undefined && (!Number.isFinite(frameOverride.x) || frameOverride.x < -width * 2 || frameOverride.x > width * 2)
            || frameOverride.y !== undefined && (!Number.isFinite(frameOverride.y) || frameOverride.y < -height * 2 || frameOverride.y > height * 2)
            || frameOverride.width !== undefined && (!Number.isFinite(frameOverride.width) || frameOverride.width < .25 || frameOverride.width > width * 2)
            || frameOverride.height !== undefined && (!Number.isFinite(frameOverride.height) || frameOverride.height < .25 || frameOverride.height > height * 2)
            || frameOverride.rotation !== undefined && (!Number.isFinite(frameOverride.rotation) || frameOverride.rotation < -180 || frameOverride.rotation > 180)
            || frameOverride.flipX !== undefined && typeof frameOverride.flipX !== 'boolean'
            || frameOverride.visible !== undefined && typeof frameOverride.visible !== 'boolean')
            throw new Error(`Invalid accessory item override values: ${itemId}/${breed}/${scene}/${frame}`);
          itemOverrideCount++;
          return { ...frameOverride };
        });
      }
      normalized.breeds[breed] = normalizedBreed;
    }
    itemOverrides[itemId] = normalized;
  }
}

for (const [breed, entry] of Object.entries(breeds)) for (const scene of sceneIds) {
  const frames = entry.scenes[scene];
  const expected = assets.find(asset => asset.breed === breed).scenes[scene].frames;
  if (frames.length !== expected) throw new Error(`Incomplete accessory frames: ${breed}/${scene}`);
  frames.forEach((frame, index) => slotIds.forEach(slot => {
    const value = frame[slot];
    if (!isRecord(value) || !Number.isFinite(value.x) || value.x < 0 || value.x > entry.width || !Number.isFinite(value.y) || value.y < 0 || value.y > entry.height
      || !Number.isFinite(value.width) || value.width <= 0 || value.width > entry.width || !Number.isFinite(value.height) || value.height <= 0 || value.height > entry.height
      || !Number.isFinite(value.rotation) || value.rotation < -180 || value.rotation > 180 || typeof value.flipX !== 'boolean' || typeof value.visible !== 'boolean')
      throw new Error(`Invalid accessory slot: ${breed}/${scene}/${index}/${slot}`);
  }));
}

fs.writeFileSync(target, JSON.stringify({ schemaVersion: 1, revision: 'ruby-accessory-anchors-2', breeds, itemOverrides }, null, 2) + '\n');
console.log(`WROTE ${path.relative(root, target)}: ${Object.keys(breeds).length} breeds x ${sceneIds.length} scenes; ${overrideCount} slot and ${itemOverrideCount} item overrides`);
