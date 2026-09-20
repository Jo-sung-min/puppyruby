'use strict';
// Read-only app contract and renderer checks. --partial allows a staged asset pilot.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { createRequire } = require('node:module'), { loadFrontend } = require('./frontend-loader.cjs');
const root = path.resolve(__dirname, '..'), req = createRequire(path.join(root, 'frontend/package.json'));
const React = req('react'), { renderToStaticMarkup } = req('react-dom/server');
const lib = loadFrontend('src/lib/ruby-round-scene-styles.ts');
const eyes = loadFrontend('src/lib/ruby-round-eyes.ts');
const eyeMotion = loadFrontend('src/lib/ruby-round-eye-motion.ts');
const { dogBreedIds } = loadFrontend('src/lib/dog-breeds.ts');
const { dogStyles } = loadFrontend('src/lib/dog-styles.ts');
const { PixelDog } = loadFrontend('src/components/pixel-dog.tsx');
const { RubyEyePicker } = loadFrontend('src/components/ruby-eye-picker.tsx');
const { nativeDogScenes, nativeDogSceneAsset } = loadFrontend('src/lib/native-dog-scenes.ts');
const partial = process.argv.includes('--partial');
let checks = 0;
const check = (value, label) => { assert.ok(value, label); checks++; };
const fixture = breed => ({ breed, width: 300, height: 300, aseprite: `/downloads/ruby-round-v1/${breed}.aseprite`,
  scenes: Object.fromEntries(lib.rubyRoundScenes.map(({ id }) => [id, { png: `/images/ruby-round-v1/${breed}/${id}.png`, frames: 4, frameMs: 180,
    eyes: Array.from({ length: 4 }, () => [{ x: 110, y: 130, width: 24, height: 24 }, { x: 166, y: 130, width: 24, height: 24 }]) }])) });
const actionFixture = breed => {
  const core = fixture(breed);
  return { ...core, motionAseprite: `/downloads/ruby-round-v1/${breed}-16-actions.aseprite`,
    actions: Object.fromEntries(lib.rubyRoundActions.map(action => [action.id, {
      png: lib.isRubyRoundSceneId(action.id) ? `/images/ruby-round-v1/${breed}/${action.id}.png` : `/images/ruby-round-v1/${breed}/actions/${action.id}.png`,
      frames: 4, frameMs: action.frameMs, source: action.source, kind: action.kind, eyeMode: action.eyeMode,
      ...(action.kind === 'redrawn' ? { eyeModeByFrame: Array(4).fill(['hidden', 'baked'].includes(action.eyeMode) ? 'hidden' : 'shared') } : {}),
      eyes: Array.from({ length: 4 }, () => ['hidden', 'baked'].includes(action.eyeMode) ? []
        : [{ x: 110, y: 130, width: 32, height: 32 }, { x: 166, y: 130, width: 32, height: 32 }]),
    }])) };
};
check(lib.parseRubyRoundAssets(dogBreedIds.map(fixture)).length === 30, 'All existing breed IDs retain their matching assets');
check(lib.parseRubyRoundAssets(dogBreedIds.map(actionFixture)).every(asset => Object.keys(asset.actions).length === 16), 'Complete v2 records expose sixteen native actions');
check(dogStyles.some(style => style.id === lib.rubyRoundStyleId) === lib.rubyRoundReady, 'An unfinished pack cannot be applied globally');
check(lib.parseRubyRoundAssets([fixture('shiba'), fixture('shiba')]).length === 1, 'Duplicate breeds cannot masquerade as a full pack');
for (const scene of lib.rubyRoundScenes) {
  const broken = fixture('shiba'); delete broken.scenes[scene.id];
  check(lib.parseRubyRoundAssets([broken]).length === 0, 'Missing scene invalidates a breed');
  for (const mutation of [sheet => sheet.png = 'https://untrusted.test/body.png', sheet => sheet.eyes.pop(), sheet => sheet.eyes[0][0].x = 299, sheet => sheet.frameMs = NaN]) {
    const bad = fixture('shiba'); mutation(bad.scenes[scene.id]);
    check(lib.parseRubyRoundAssets([bad]).length === 0, 'Invalid body path, animation timing or eye alignment is rejected');
  }
}
check(eyes.rubyEyeStyles.length === 30 && new Set(eyes.rubyEyeStyles.map(eye => eye.id)).size === 30, 'Thirty stable interchangeable eye IDs');
for (const value of ['ruby-eye-00', 'ruby-eye-31', 'ruby-eye-1', '', null]) check(!eyes.isRubyEyeStyleId(value), 'Only finite eye choices accepted');
check(eyes.rubyEyeStyle('blue').id === 'ruby-eye-03' && eyes.rubyEyeStyle('green').id === 'ruby-eye-04' && eyes.rubyEyeStyle('amber').id === 'ruby-eye-05', 'Existing eye colors map to matching shared eyes');
check(eyes.rubyEyeStyle('original').id === 'ruby-eye-01', 'Original eyes remain the black default');
const { PuppySprite } = loadFrontend('src/components/puppy-sprite.tsx');
const { eyeOptions } = loadFrontend('src/lib/game.ts');
for (const eye of eyeOptions) {
  const legacy = renderToStaticMarkup(React.createElement(PuppySprite, { puppy: { breed: 0, eyes: eye.id } }));
  const mapped = eyes.rubyEyeStyle(eye.id);
  check(legacy.includes(`data-eye-style="${mapped.id}"`) && legacy.includes(mapped.png), 'Existing saved eye choices map to their matching Ruby eye layer');
}
const signupPuppy = renderToStaticMarkup(React.createElement(PuppySprite, { puppy: { breed: 0 } }));
check(signupPuppy.includes('data-eye-style="ruby-eye-01"') && signupPuppy.includes('/eyes/eye-01.png'), 'Sign-up and catalog puppies use the Ruby black-eye default');
const picker = renderToStaticMarkup(React.createElement(RubyEyePicker, { value: 'ruby-eye-28', onChange() {} }));
check((picker.match(/<button/g) ?? []).length === 30 && (picker.match(/aria-pressed="true"/g) ?? []).length === 1, 'Eye picker exposes 30 keyboard accessible choices and one selection');
check(nativeDogScenes(lib.rubyRoundStyleId).length === 16, 'Consolidated admin previews expose sixteen actions');
if (!partial) check(lib.rubyRoundReady && lib.rubyRoundAssets.length === 30, 'Full release requires all 30 breeds');
check(lib.rubyRoundAssets.length > 0, 'Renderer verification requires actual generated artwork');
const markup = props => renderToStaticMarkup(React.createElement(PixelDog, { styleId: lib.rubyRoundStyleId, groundShadow: false, ...props }));
const referencePair = [{ x: 100, y: 80, width: 32, height: 32 }, { x: 151, y: 80, width: 32, height: 32 }];
const driftingPair = [{ x: 104, y: 77, width: 32, height: 32 }, { x: 148, y: 78, width: 48, height: 48 }];
const rigidPair = eyeMotion.rubyRoundEyePair(driftingPair, referencePair);
check(rigidPair[1].x - rigidPair[0].x === 51 && rigidPair[1].y === rigidPair[0].y, 'Independent anchor drift cannot spread, cross or tilt the frontal eyes');
check(rigidPair.every((eye, i) => eye.x - referencePair[i].x === rigidPair[0].x - referencePair[0].x && eye.y - referencePair[i].y === rigidPair[0].y - referencePair[0].y), 'Both eyes follow the head with exactly one translation');
check(driftingPair[1].width === 48 && referencePair[0].x === 100, 'Pair correction never mutates the artwork manifest');
check(eyeMotion.rubyRoundEyePair([referencePair[0]], referencePair).length === 1, 'Side view does not acquire an extra eye');
for (const direction of [-100, -3, 0, 3, 100]) {
  const offset = eyeMotion.rubyRoundGazeOffset(driftingPair, direction, direction);
  check(offset.x === offset.y && Math.abs(offset.x) <= 4 && Math.sign(offset.x) === Math.sign(direction), 'Shared gaze is bounded and moves both eyes toward the same target');
}
check(eyeMotion.rubyRoundGazeOffset([], NaN, Infinity).x === 0, 'Missing or invalid gaze cannot create invalid SVG coordinates');
const styleLibrary = loadFrontend('src/lib/dog-styles.ts');
const { desktopAppearance } = loadFrontend('src/lib/desktop-appearance.ts', { './dog-styles': { ...styleLibrary, resolveDogStyle: () => lib.rubyRoundStyleId } });
for (const asset of lib.rubyRoundAssets) {
  check(nativeDogSceneAsset(lib.rubyRoundStyleId, asset.breed)?.aseprite === (asset.motionAseprite ?? asset.aseprite), 'Admin offers the matching editable action master');
  for (const { id } of lib.rubyRoundScenes) {
    const sheet = asset.scenes[id], png = fs.readFileSync(path.join(root, 'local-assets/site', sheet.png));
    check(png.readUInt32BE(16) === asset.width * sheet.frames && png.readUInt32BE(20) === asset.height, 'Renderer uses the original sheet dimensions');
    for (let frame = 0; frame < sheet.frames; frame++) {
      const svg = markup({ breed: asset.breed, scene: id, paused: true, frame, eyeStyle: 'ruby-eye-06' });
      check(svg.includes(`data-dog-scene="${id}"`) && svg.includes(`x="${-frame * asset.width}"`), 'Paused preview shows the requested frame');
      check(svg.includes('data-eyeless-body="true"') && svg.includes('data-eye-frame="0"'), 'Shared eyes remain distinct from the unmodified body');
      check(!/NaN|Infinity/.test(svg), 'No invalid coordinates in the rendered dog');
    }
  }
  for (const eye of eyes.rubyEyeStyles) {
    const svg = markup({ breed: asset.breed, eyeStyle: eye.id });
    check(svg.includes(`data-eye-style="${eye.id}"`) && svg.includes(eye.png), 'Every common eye selects its actual shared PNG for every breed');
  }
  const typing = markup({ breed: asset.breed, mood: 'typing' });
  for (const scene of ['idle', 'happy']) {
    const svg = markup({ breed: asset.breed, scene });
    const renderedEyes = [...svg.matchAll(/<svg x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)" viewBox="[^"]+" overflow="hidden" data-common-eye="([01])"/g)];
    const sheet = (asset.actions ?? asset.scenes)[scene];
    const expectedEyes = sheet.eyes.flatMap(anchors => sheet.kind === 'redrawn' ? anchors : eyeMotion.rubyRoundEyePair(anchors, asset.scenes.idle.eyes[0]));
    check(renderedEyes.length === expectedEyes.length, 'Only shared-eye frames render eye overlays; painted closed eyes remain untouched');
    expectedEyes.forEach((eye, index) => check(['x', 'y', 'width', 'height'].every((key, field) => Number(renderedEyes[index][field + 1]) === eye[key]), 'Each eye preserves its reviewed frame geometry, including tilted poses'));
    const sharedFrames = sheet.eyes.filter(anchors => anchors.length).length;
    check((svg.match(/data-eye-pair="true"/g) ?? []).length === sharedFrames && (svg.match(/data-shared-blink="true"/g) ?? []).length === sharedFrames, 'Each shared frame moves and blinks both eyes together');
  }
  if (asset.actions) {
    check(typing.includes('data-dog-scene="typing"') && !typing.includes('data-dog-keyboard="front"'), 'Typing uses the native sheet without a duplicate keyboard overlay');
    check(markup({ breed: asset.breed, mood: 'eat' }).includes('data-dog-scene="eat"'), 'Eating uses its native four-frame sheet');
    const belly = markup({ breed: asset.breed, mood: 'belly' });
    check(belly.includes('data-dog-scene="belly"') && !belly.includes('data-dog-reaction="belly"'), 'Native belly frames avoid the legacy rotation');
    check(!markup({ breed: asset.breed, scene: 'walk-up' }).includes('data-common-eye='), 'Back-facing walking hides interchangeable eyes');
  } else check(typing.includes('data-dog-scene="idle"') && typing.includes('data-dog-keyboard="front"'), 'Legacy typing fallback uses the front pose and keyboard');
  check(markup({ breed: asset.breed, mood: 'idle', look: 2, lookY: -1 }).includes('data-dog-gaze="2,-1"'), 'Gaze follows the input position');
  if (!asset.actions) check(markup({ breed: asset.breed, mood: 'belly' }).includes('data-dog-reaction="belly"'), 'Legacy rapid-click belly fallback remains available');
  check(!markup({ breed: asset.breed, mood: 'typing', paused: true }).includes('data-dog-keyboard'), 'Paused puppy remains still');
  if (Object.values(asset.scenes).every(scene => scene.desktopPng && scene.desktopFrames)) {
    const desktop = desktopAppearance(styleLibrary.defaultAppearance, dogBreedIds.indexOf(asset.breed), 'http://localhost:3000');
    check(desktop.styleId === lib.rubyRoundStyleId && desktop.breedId === asset.breed, 'Desktop receives the same selected breed and style');
    for (const { id } of lib.rubyRoundScenes) {
      check(desktop.scenes[id].frames === (id === 'walk' ? asset.scenes[id].frames : 1), 'Installed desktop v1 receives compatible frame counts');
      check(desktop.scenes[id].url.endsWith(`${id}-desktop.png`) && /^[a-f0-9]{64}$/.test(desktop.scenes[id].sha256), 'Legacy desktop fields retain hashed default-eye composites');
      const legacySleep = id === 'sleep' && !asset.scenes[id].eyeModeByFrame;
      check(desktop.scenes[id].bodyUrl.endsWith(`/${id}.png`) && desktop.scenes[id].eyeUrl.endsWith(legacySleep ? '/eye-10.png' : '/eye-01.png'), 'New desktop fields expose the body and matching shared eye while painted closed frames remain untouched');
    }
  } else check(partial, 'Every complete release requires composited desktop fallback artwork');
}
console.log(`PASS ${checks} ruby-round renderer checks; ${lib.rubyRoundAssets.length}/30 breeds, 16 actions, 30 eyes, admin integration and preserved desktop scenes.`);
