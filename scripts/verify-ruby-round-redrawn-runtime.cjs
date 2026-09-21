'use strict';
// Regression checks for independently drawn poses, including closed-eye transitions.
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const path = require('node:path');
const { loadFrontend } = require('./frontend-loader.cjs');
const req = createRequire(path.resolve(__dirname, '../frontend/package.json'));
const React = req('react'), { renderToStaticMarkup } = req('react-dom/server');
const current = loadFrontend('src/lib/ruby-round-scene-styles.ts');
const catalog = require('../shared/ruby-round-actions.json');
let checks = 0;
const check = (condition, label) => { assert.ok(condition, label); checks++; };
const pair = [
  [{ x: 74, y: 73, width: 22, height: 22 }, { x: 116, y: 73, width: 22, height: 22 }],
  [{ x: 67, y: 66, width: 20, height: 24 }, { x: 112, y: 82, width: 24, height: 24 }],
  [], [],
];
const entry = { breed: 'pomeranian', width: 224, height: 224,
  aseprite: '/downloads/ruby-round-v1/pomeranian.aseprite',
  motionAseprite: '/downloads/ruby-round-v1/pomeranian-16-actions.aseprite', scenes: {}, actions: {} };
for (const definition of catalog.actions) {
  const id = definition.id, core = current.isRubyRoundSceneId(id), hidden = id === 'walk-up';
  const action = { ...definition, kind: 'redrawn', source: 'independently-redrawn-atlas',
    png: `/images/ruby-round-v1/pomeranian/${core ? '' : 'actions/'}${id}.png`, frames: 4,
    eyeMode: hidden ? 'hidden' : ['sleep', 'belly'].includes(id) ? 'closed' : 'shared',
    eyeModeByFrame: hidden ? Array(4).fill('hidden') : ['shared', 'shared', 'baked-closed', 'baked-closed'],
    eyes: hidden ? [[], [], [], []] : structuredClone(pair) };
  entry.actions[id] = action;
  if (core) entry.scenes[id] = { ...action, desktopPng: `/images/ruby-round-v1/pomeranian/${id}-desktop.png`, desktopFrames: id === 'walk' ? 4 : 1 };
}
const redrawn = loadFrontend('src/lib/ruby-round-scene-styles.ts', { './generated/ruby-round-scene-assets.json': [entry] });
const asset = redrawn.rubyRoundAssets[0];
check(asset?.actions && Object.keys(asset.actions).length === 16, 'A complete redrawn atlas exposes every action');
check(redrawn.rubyRoundScenes.length === 5, 'The desktop scene list remains the same five IDs even when all artwork is redrawn');
check(asset.actions.belly.eyes[1][1].y === 82, 'Parsing preserves the tilted head geometry');
for (const mutate of [
  action => { delete action.eyeModeByFrame; },
  action => { action.eyeModeByFrame.pop(); },
  action => { action.eyeModeByFrame[2] = 'shared'; },
  action => { action.eyeModeByFrame[1] = 'baked-closed'; },
  action => { action.eyeModeByFrame[2] = 'other'; },
  action => { action.source = 'idle'; },
]) {
  const invalid = structuredClone(entry); mutate(invalid.actions.belly);
  check(!redrawn.parseRubyRoundAssets([invalid])[0]?.actions, 'Malformed native-eye contract cannot be activated');
}
const badScene = structuredClone(entry); badScene.scenes.sleep.eyeModeByFrame[2] = 'shared';
check(redrawn.parseRubyRoundAssets([badScene]).length === 0, 'Invalid compatibility scene eyes reject the breed');
const { RubyRoundPixelDog } = loadFrontend('src/components/ruby-round-pixel-dog.tsx', { '../lib/ruby-round-scene-styles': redrawn });
const markup = props => renderToStaticMarkup(React.createElement(RubyRoundPixelDog, { breed: 'pomeranian', mood: 'idle', groundShadow: false, ...props }));
for (const id of redrawn.rubyRoundActionIds) {
  const svg = markup({ scene: id, paused: true, frame: 1, eyeStyle: 'ruby-eye-06' });
  check(svg.includes(`data-dog-scene="${id}"`) && !/NaN|Infinity/.test(svg), 'Every native action is renderable');
  if (id === 'walk-up') {
    check(!svg.includes('data-common-eye='), 'Back-facing artwork has no eye overlays');
    continue;
  }
  check((svg.match(/data-common-eye=/g) ?? []).length === 4, 'Two open frames receive pairs; two closed frames receive no additional eyes');
  check(svg.includes('x="67" y="66" width="20" height="24"') && svg.includes('x="112" y="82" width="24" height="24"'), 'A tilted pair is not flattened or replaced with the idle pair');
  check(svg.includes('/eyes/eye-06.png') && !svg.includes('/eyes/eye-10.png'), 'Selected eyes appear on open frames even in sleep and belly actions');
}
for (const mood of ['typing', 'love', 'eat', 'belly', 'play', 'sleep']) {
  const svg = markup({ mood });
  check(!svg.includes('data-dog-reaction=') && !svg.includes('data-dog-keyboard='), 'Native actions do not receive duplicate legacy motion or keyboard effects');
}
const gaze = markup({ look: 3, lookY: -3 });
check((gaze.match(/data-eye-offset="3,-3"/g) ?? []).length === 2, 'Both open-eye frames apply a single synchronized gaze translation');
check((gaze.match(/data-eye-pair="true"/g) ?? []).length === 2, 'Closed frames receive no extra gaze layer');

// Verify the linked-app descriptor with finite fake fingerprints, without network access.
const hashes = {};
for (const [id, sheet] of Object.entries(entry.scenes)) {
  hashes[sheet.png] = { width: 224 * 4, height: 224, sha256: 'a'.repeat(64) };
  hashes[sheet.desktopPng] = { width: 224 * sheet.desktopFrames, height: 224, sha256: 'b'.repeat(64) };
}
for (const [id, sheet] of Object.entries(entry.actions)) if (!current.isRubyRoundSceneId(id)) {
  hashes[sheet.png] = { width: 224 * 4, height: 224, sha256: 'd'.repeat(64) };
}
hashes['/images/ruby-round-v1/eyes/eye-06.png'] = { width: 32, height: 16, sha256: 'c'.repeat(64) };
const styles = loadFrontend('src/lib/dog-styles.ts');
const fixtureSlots = { width: 224, height: 224, scenes: {} };
for (const id of current.rubyRoundSceneIds) fixtureSlots.scenes[id] = Array.from({length: 4}, () => Object.fromEntries(['face', 'head', 'neck', 'back'].map(slot =>
  [slot, {x: 112, y: 100, width: 60, height: 30, rotation: 0, flipX: false, visible: true}])));
const accessoryBindings = loadFrontend('src/lib/ruby-round-accessories.ts', {
  './ruby-round-scene-styles': redrawn,
  './generated/ruby-round-accessory-anchors.json': {schemaVersion: 1, breeds: {pomeranian: fixtureSlots}},
});
const { desktopAppearance, desktopAppearanceForClient } = loadFrontend('src/lib/desktop-appearance.ts', {
  './generated/desktop-appearance-assets.json': hashes,
  './ruby-round-scene-styles': redrawn,
  './ruby-round-accessories': accessoryBindings,
  './dog-styles': { ...styles, resolveDogStyle: () => redrawn.rubyRoundStyleId },
});
const descriptor = desktopAppearance(styles.defaultAppearance, 0, 'http://localhost:3001', 'ruby-eye-06');
check(Object.keys(descriptor.scenes).length === 5, 'Linked-app response retains exactly five compatibility scenes');
for (const sheet of Object.values(descriptor.scenes)) {
  check(sheet.eyeModeByFrame.join(',') === 'shared,shared,baked-closed,baked-closed', 'Linked-app descriptor carries the frame eye contract');
  check(sheet.eyeAnchors[1][1].y === 82 && sheet.eyeAnchors[2].length === 0, 'Desktop eyes preserve native tilt and closed-eye frames');
  check(sheet.eyeStyle === 'ruby-eye-06', 'Desktop sleep open frame uses the selected common eyes');
}
const nativeIds = catalog.actions.map(action => action.id).filter(id => !current.isRubyRoundSceneId(id));
check(Object.keys(descriptor.nativeActions).join(',') === nativeIds.join(','), 'Optional native action dictionary has exactly the eleven additional IDs');
for (const id of nativeIds) {
  const action = descriptor.nativeActions[id];
  check(action.frames === 4 && action.bodyFrames === 4 && action.url === action.bodyUrl && action.sha256 === action.bodySha256, 'Native action fallback fields retain the exact body strip');
  check(action.eyeStyle === 'ruby-eye-06' && action.eyeAnchors.length === 4 && action.eyeModeByFrame.length === 4, 'Every native action carries current eyes and all frame modes');
  check(action.eyeModeByFrame[2] === (id === 'walk-up' ? 'hidden' : 'baked-closed') && action.eyeAnchors[2].length === 0, 'Native closed/back frames never gain painted shared eyes');
}
const changedPath = entry.actions.belly.png;
hashes[changedPath].sha256 = 'e'.repeat(64);
const changed = desktopAppearance(styles.defaultAppearance, 0, 'http://localhost:3001', 'ruby-eye-06');
check(changed.key === descriptor.key && changed.renderKey !== descriptor.renderKey, 'Changing one additional action invalidates the new cache while preserving the five-scene legacy key');
const withGlasses = desktopAppearance(styles.defaultAppearance, 0, 'http://localhost:3001', 'ruby-eye-06', 'glasses');
check(Object.keys(withGlasses.accessoryLayer.placements).length === 5 && Object.keys(withGlasses.accessoryLayer.nativeActions).length === 11, 'Accessory descriptor separates five compatibility placements and eleven native placements');
for (const id of nativeIds) check(withGlasses.accessoryLayer.nativeActions[id].length === 4, 'Every native action has four concrete accessory placements');
check(withGlasses.accessoryLayer.nativeActions.typing[2].visible && !withGlasses.accessoryLayer.nativeActions.belly[2].visible
  && withGlasses.accessoryLayer.nativeActions['walk-up'].every(placement => !placement.visible), 'Blink fallback retains a stable face but never borrows a sitting face for a supine or hidden head');
check(withGlasses.accessoryLayer.nativeActions.belly[1].rotation !== 0, 'Tilted native faces rotate their accessory placement with the eye pair');
for (const version of [0, 1, 2, Number.NaN]) {
  const legacy = desktopAppearanceForClient(withGlasses, version);
  check(legacy.key === withGlasses.key && !legacy.renderKey && !legacy.nativeActions && !legacy.accessoryLayer && !legacy.reactionEyes,
    'Older client receives only the legacy identity and no layered native metadata');
  check(Object.keys(legacy.scenes).length === 5 && Object.values(legacy.scenes).every(scene => Object.keys(scene).sort().join(',') === 'frameMs,frames,sha256,url'),
    'Older installed layered clients receive only five precomposed fallback PNG descriptors');
}
check(desktopAppearanceForClient(withGlasses, 3) === withGlasses && desktopAppearanceForClient(withGlasses, 4) === withGlasses,
  'Version3 and later clients retain the complete native descriptor');
if (process.argv.includes('--registered')) {
  check(current.rubyRoundAssets.length === 30 && current.rubyRoundAssets.every(asset => asset.actions
    && catalog.actions.every(action => asset.actions[action.id]?.kind === 'redrawn')), 'All thirty registered breeds use the final redrawn actions');
  const registeredDesktop = loadFrontend('src/lib/desktop-appearance.ts', {
    './dog-styles': { ...styles, resolveDogStyle: () => current.rubyRoundStyleId },
  }).desktopAppearance;
  const { dogBreedIds } = loadFrontend('src/lib/dog-breeds.ts');
  for (const [breedIndex, breed] of dogBreedIds.entries()) {
    const first = registeredDesktop(styles.defaultAppearance, breedIndex, 'http://localhost:3001', 'ruby-eye-01', 'glasses');
    const alternate = registeredDesktop(styles.defaultAppearance, breedIndex, 'http://localhost:3001', 'ruby-eye-30', 'glasses');
    check(first.breedId === breed && Object.keys(first.scenes).length === 5, `${breed}: actual descriptor preserves five compatibility scenes`);
    check(Object.keys(first.nativeActions).join(',') === nativeIds.join(','), `${breed}: actual descriptor has all eleven native actions`);
    check(first.key === alternate.key && first.renderKey !== alternate.renderKey, `${breed}: selected eye style invalidates native cache only`);
    for (const id of nativeIds) {
      const actual = first.nativeActions[id], source = current.rubyRoundAsset(breed).actions[id];
      check(actual.frames === 4 && actual.bodyFrames === 4 && actual.url === actual.bodyUrl && actual.sha256 === actual.bodySha256
        && new URL(actual.bodyUrl).pathname.endsWith(source.revision?`/${source.revision.desktopBodySha256}.png`:source.png), `${breed}/${id}: correct registered four-frame body URL/hash`);
      check(JSON.stringify(actual.eyeAnchors) === JSON.stringify(source.eyes) && JSON.stringify(actual.eyeModeByFrame) === JSON.stringify(source.eyeModeByFrame)
        && actual.eyeStyle === 'ruby-eye-01' && alternate.nativeActions[id].eyeStyle === 'ruby-eye-30', `${breed}/${id}: all native eye geometry and choices retained`);
      const placements = first.accessoryLayer?.nativeActions?.[id];
      check(placements?.length === 4 && placements.every(placement => Object.values(placement).every(value => typeof value === 'boolean' || Number.isFinite(value))), `${breed}/${id}: four finite accessory placements`);
    }
  }
}
console.log(`PASS ${checks} redrawn runtime checks: 16 poses, native eye geometry, five-scene compatibility, eleven native descriptors, accessory placements and cache invalidation.`);
