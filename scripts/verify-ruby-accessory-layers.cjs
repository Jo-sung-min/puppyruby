'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { loadFrontend } = require('./frontend-loader.cjs');

const root = path.resolve(__dirname, '..');
const req = createRequire(path.join(root, 'frontend/package.json'));
const React = req('react');
const { renderToStaticMarkup } = req('react-dom/server');
const accessories = loadFrontend('src/lib/ruby-round-accessories.ts');
const { dogBreedIds } = loadFrontend('src/lib/dog-breeds.ts');
const ruby = loadFrontend('src/lib/ruby-round-scene-styles.ts');
const { RubyRoundPixelDog } = loadFrontend('src/components/ruby-round-pixel-dog.tsx');
const styles = loadFrontend('src/lib/dog-styles.ts');
const { desktopAppearance, legacyDesktopAccessoryId } = loadFrontend('src/lib/desktop-appearance.ts', { './dog-styles': { ...styles, resolveDogStyle: () => ruby.rubyRoundStyleId } });
let checks = 0;
const check = (value, label) => { assert.ok(value, label); checks++; };

check(accessories.rubyAccessoryCatalog.schemaVersion === 1 && accessories.rubyAccessoryCatalog.items.length >= 10,
  'shared accessory catalog exposes every compatible item');
check(new Set(accessories.rubyAccessoryCatalog.items.map(item => item.id)).size === accessories.rubyAccessoryCatalog.items.length,
  'catalog IDs are unique');

const anchors = JSON.parse(fs.readFileSync(path.join(root, 'frontend/src/lib/generated/ruby-round-accessory-anchors.json'), 'utf8'));
const parsedAnchors = accessories.parseRubyAccessoryAnchors(anchors);
check(Object.keys(parsedAnchors).length === 30, 'all 30 Ruby breeds have reusable attachment slots');
for (const breed of dogBreedIds) {
  const asset = ruby.rubyRoundAsset(breed), entry = parsedAnchors[breed];
  check(entry?.width === asset.width && entry?.height === asset.height, `${breed}: slots use the native dog canvas`);
  for (const { id } of ruby.rubyRoundScenes) {
    check(entry.scenes[id].length === asset.scenes[id].frames, `${breed}/${id}: every animation frame has slots`);
    for (const frame of entry.scenes[id]) check(['face', 'head', 'neck', 'back'].every(slot => frame[slot]
      && Object.values(frame[slot]).every(value => typeof value === 'boolean' || Number.isFinite(value))), `${breed}/${id}: slot values are finite`);
  }
}

const itemOverrideFixture = { itemOverrides: { glasses: { breeds: { pomeranian: { scenes: { idle: [
  { x: 17, y: 19, width: 44, height: 20, rotation: 12, flipX: true, visible: true },
] } } } } } };
const parsedItemOverrides = accessories.parseRubyAccessoryItemOverrides(itemOverrideFixture, accessories.rubyAccessoryCatalog);
const glassesItem = accessories.rubyAccessoryCatalog.items.find(item => item.id === 'glasses');
const overriddenPlacement = accessories.resolvedRubyAccessoryPlacement(glassesItem, 'pomeranian', 'idle', 0, parsedItemOverrides);
check(overriddenPlacement?.x === 17 && overriddenPlacement.y === 19 && overriddenPlacement.rotation === 12 && overriddenPlacement.flipX,
  'one accessory can override one breed, scene and frame without duplicating dog art');
check(Object.keys(accessories.parseRubyAccessoryItemOverrides({ itemOverrides: { unknown: { breeds: {} } } }, accessories.rubyAccessoryCatalog)).length === 0,
  'unknown or malformed item overrides fail closed');

const validImage = { schemaVersion: 1, revision: 'fixture-1', items: [
  ...JSON.parse(JSON.stringify(accessories.rubyAccessoryCatalog.items)),
  { id: 'round-glasses', label: '새 안경', availability: 'paid', grade: 'R', weight: 0,
    slot: 'face', layer: 'front', renderer: 'image', revision: 'art-1', asset: { png: '/images/ruby-round-v1/accessories/round-glasses.png',
      sha256: 'a'.repeat(64), width: 32, height: 16, pivotX: 16, pivotY: 8 }, defaultTransform: { offsetX: 1, scaleX: 1.1, flipX: true } },
] };
const imageItem = accessories.parseRubyAccessoryCatalog(validImage).items.find(item => item.id === 'round-glasses');
check(imageItem?.renderer === 'image' && imageItem.asset?.pivotX === 16 && imageItem.defaultTransform.offsetX === 1,
  'finite shared image metadata and defaults are accepted');
check(legacyDesktopAccessoryId(imageItem.id, { renderer: imageItem.renderer }) === 'none',
  'new image item is hidden from the legacy top-level desktop accessory field');
check(legacyDesktopAccessoryId('glasses', { renderer: 'builtin' }) === 'glasses',
  'existing builtin ID remains compatible with old desktop clients');
for (const mutation of [
  item => { item.asset.png = 'https://untrusted.invalid/glasses.png'; },
  item => { item.asset.sha256 = 'bad'; },
  item => { item.slot = 'tail'; },
  item => { item.layer = 'middle'; },
  item => { item.defaultTransform.scaleX = 100; },
  item => { item.weight = 1; },
]) {
  const invalid = structuredClone(validImage); mutation(invalid.items[invalid.items.length - 1]);
  check(accessories.parseRubyAccessoryCatalog(invalid).items.length === 0, 'unsafe asset or placement metadata is rejected');
}

const markup = accessory => renderToStaticMarkup(React.createElement(RubyRoundPixelDog,
  { breed: 'pomeranian', mood: 'idle', accessory, paused: true, frame: 0, groundShadow: false }));
const wings = markup('angel-wings'), glasses = markup('glasses');
check(wings.includes('data-cosmetic-slot="back"') && wings.includes('data-cosmetic-layer="behind"'), 'catalog places wings behind the dog');
check(wings.indexOf('data-cosmetic-layer="behind"') < wings.indexOf('data-eyeless-body="true"'), 'behind layer is emitted before body pixels');
check(wings.includes('<clipPath') && wings.includes('clip-path="url(#'), 'each translated accessory frame is clipped to its own dog canvas');
check(glasses.includes('data-cosmetic-slot="face"') && glasses.includes('data-cosmetic-layer="front"'), 'catalog places glasses on the face');
check(glasses.indexOf('data-cosmetic-layer="front"') > glasses.indexOf('data-eyeless-body="true"'), 'front layer is emitted after body pixels');
check(markup('unknown-old-id').includes('data-cosmetic-layer="front"'), 'unknown saved ID keeps the legacy builtin fallback path');

for (const breed of dogBreedIds) for (const { id: scene } of ruby.rubyRoundScenes) {
  const frames = ruby.rubyRoundAsset(breed).scenes[scene].frames;
  for (let frame = 0; frame < frames; frame++) for (const item of accessories.rubyAccessoryCatalog.items) {
    const svg = renderToStaticMarkup(React.createElement(RubyRoundPixelDog,
      { breed, mood: 'idle', scene, accessory: item.id, paused: true, frame, groundShadow: false }));
    // SVG contains all translated animation frames, including those outside the
    // viewport. Closed poses without a reviewed head slot must omit the item.
    const visibleFrames = Array.from({ length: frames }, (_, index) =>
      accessories.resolvedRubyAccessoryPlacement(item, breed, scene, index)?.visible === true).filter(Boolean).length;
    const occurrences = svg.split(`data-cosmetic="${item.id}"`).length - 1;
    check(occurrences === visibleFrames && (!visibleFrames || svg.includes(`data-cosmetic-slot="${item.slot}"`)
      && svg.includes(`data-cosmetic-layer="${item.layer}"`)) && !/NaN|Infinity/.test(svg),
    `${breed}/${scene}/${frame}/${item.id}: finite reviewed slots render only visible accessory frames`);
  }
}

const descriptor = desktopAppearance(styles.defaultAppearance, 0, 'http://localhost:3000', 'ruby-eye-01', 'glasses');
const crown = desktopAppearance(styles.defaultAppearance, 0, 'http://localhost:3000', 'ruby-eye-01', 'crown');
check(descriptor?.accessoryLayer?.id === 'glasses' && descriptor.accessoryLayer.catalogRevision === accessories.rubyAccessoryCatalog.revision,
  'desktop descriptor carries catalog and item revisions');
check(descriptor.accessory === 'glasses', 'builtin accessory remains in the legacy top-level field');
check(ruby.rubyRoundScenes.every(({ id }) => descriptor.accessoryLayer.placements[id].length === ruby.rubyRoundAsset('pomeranian').scenes[id].frames),
  'desktop receives concrete placements for every body frame');
check(descriptor.renderKey !== crown.renderKey, 'accessory identity and revision affect the desktop render key');

console.log(`PASS ${checks} Ruby accessory catalog, reusable slots, web layers and desktop descriptor checks.`);
