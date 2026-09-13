'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { createHash } = require('node:crypto'), { createRequire } = require('node:module');
const { loadFrontend } = require('./frontend-loader.cjs');
const root = path.resolve(__dirname, '..'), frontendRequire = createRequire(path.join(root, 'frontend/package.json'));
const React = frontendRequire('react'), { renderToStaticMarkup } = frontendRequire('react-dom/server');
const sharp = frontendRequire('sharp');
const { dogBreedIds } = loadFrontend('src/lib/dog-breeds.ts');
const catalog = loadFrontend('src/lib/sp-scene-styles.ts');
const sceneNames = ['idle', 'side', 'walk', 'happy', 'sleep', 'wag'];
let checks = 0;
function same(value, expected, label) { assert.deepEqual(value, expected, label); checks++; }
function check(value, label) { assert.ok(value, label); checks++; }
const clone = value => JSON.parse(JSON.stringify(value));
function fixture(style, breed) {
  const key = `${style}/${breed}`;
  return { style, breed, width: 384, height: 384, aseprite: `/downloads/sp-scenes-v1/${key}.aseprite`,
    scenes: Object.fromEntries(sceneNames.map(id => [id, { png: `/images/sp-scenes-v1/${key}/${id}.png`, frames: id === 'walk' ? 8 : id === 'wag' ? 4 : 1, frameMs: 125 }])),
    frameBounds: Object.fromEntries(sceneNames.map(id => [id, Array.from({ length: id === 'walk' ? 8 : id === 'wag' ? 4 : 1 }, (_, n) => ({ x: 45 + n, y: 40 + n % 2, width: 290, height: 300 }))])),
    reactions: { eyes: [{ x: 146, y: 154, rx: 12, ry: 15 }, { x: 218, y: 154, rx: 12, ry: 15 }], paws: [{ x: 148, y: 312, rx: 18, ry: 15 }, { x: 218, y: 312, rx: 18, ry: 15 }] } };
}
const fixtures = ['sp08', 'sp15'].flatMap(style => dogBreedIds.map(breed => fixture(style, breed)));
const full = loadFrontend('src/lib/sp-scene-styles.ts', { './generated/sp-scene-assets.json': fixtures });
same(full.spSceneAssets.length, 60, 'Two complete families contain every persisted breed');
same(full.spSceneStyles.map(style => style.id), ['sp08-scenes', 'sp15-scenes'], 'Two applicable styles keep separate identities');
const partial = loadFrontend('src/lib/sp-scene-styles.ts', { './generated/sp-scene-assets.json': fixtures.slice(1) });
same(partial.spSceneStyles.map(style => style.id), ['sp15-scenes'], 'A missing breed hides only its own incomplete family');
const withoutEyes = clone(fixtures); delete withoutEyes[0].reactions;
same(loadFrontend('src/lib/sp-scene-styles.ts', { './generated/sp-scene-assets.json': withoutEyes }).spSceneStyles.map(style => style.id), ['sp15-scenes'], 'A style waits for real eye and paw coordinates before global application');
same(catalog.parseSpSceneAssets([...fixtures, fixtures[0]]).length, 60, 'Duplicate family/breed does not count toward readiness');
for (const change of [entry => entry.scenes.wag.frames = 1, entry => delete entry.scenes.sleep, entry => entry.style = 'sp16', entry => entry.breed = 'unknown',
  entry => entry.scenes.idle.png = 'https://untrusted.test/dog.png', entry => entry.aseprite = '/downloads/other.aseprite', entry => entry.width = 64,
  entry => entry.scenes.walk.frameMs = 0, entry => entry.scenes.walk.frames = 4]) {
  const bad = clone(fixtures[0]); change(bad); same(catalog.parseSpSceneAssets([bad]), [], 'Invalid or reduced-resolution asset record rejected');
}
const badAnchors = clone(fixtures[0]); badAnchors.reactions.eyes[0].x = 0;
same(catalog.parseSpSceneAssets([badAnchors])[0].reactions, undefined, 'Out-of-bounds eye patches never erase or move unrelated source pixels');
const { SpScenePixelDog } = loadFrontend('src/components/sp-scene-pixel-dog.tsx', { '../lib/sp-scene-styles': full });
const render = props => renderToStaticMarkup(React.createElement(SpScenePixelDog, { styleId: 'sp08-scenes', breed: 'pomeranian', mood: 'idle', ...props }));
for (const asset of fixtures) {
  const props = { styleId: `${asset.style}-scenes`, breed: asset.breed };
  for (const scene of sceneNames) {
    const markup = render({ ...props, scene, accessory: 'ribbon' });
    check(markup.includes(`data-dog-style="${props.styleId}"`) && markup.includes(`data-dog-breed="${asset.breed}"`), 'Exact selected family and breed retained');
    check(markup.includes(`data-dog-scene="${scene}"`) && markup.includes(asset.scenes[scene].png), 'Each scene uses its actual native source sheet');
    same((markup.match(/data-cosmetic="ribbon"/g) || []).length, asset.scenes[scene].frames, 'Accessories are attached to every frame, not one stationary position');
  }
  check(render({ ...props, mood: 'love' }).includes('data-dog-scene="wag"'), 'Affection activates real tail-wag sheet');
  check(render({ ...props, mood: 'play' }).includes('data-dog-scene="happy"'), 'Play retains happy pose');
  check(render({ ...props, mood: 'walk', paused: true }).includes('data-dog-scene="idle"'), 'Stopping motion returns to front-facing sitting');
  check(render({ ...props, scene: 'wag', paused: true, frame: 3 }).includes('x="-1152"'), 'Paused preview can inspect the last wag frame');
  const gaze = render({ ...props, look: 1, lookY: -1 });
  same((gaze.match(/data-gaze-offset="3,-3"/g) || []).length, 2, 'Both native eyes follow the pointer within their sockets');
  check(!render({ ...props, look: 1, paused: true }).includes('data-gaze-offset'), 'Paused dog does not track the pointer');
  const typing = render({ ...props, mood: 'typing' });
  check(typing.includes('data-dog-keyboard="front"') && typing.includes('data-dog-scene="idle"'), 'Typing uses the front sitting pose and keyboard');
  same((typing.match(/data-typing-paw=/g) || []).length, 2, 'Typing lifts two original source paws');
  check(render({ ...props, mood: 'belly' }).includes('data-dog-reaction="belly"'), 'Rapid-click belly reaction remains available');
}

(async () => {
  if (!process.argv.includes('--contract-only')) {
    same(catalog.spSceneAssets.length, 60, 'All 60 delivered breed/style masters are present');
    check(catalog.spScenesReady('sp08') && catalog.spScenesReady('sp15'), 'Both families are ready for global application');
    const idleHashes = new Set();
    const attachments = JSON.parse(fs.readFileSync(path.join(root, 'frontend/src/lib/generated/sp-scene-accessory-anchors.json'), 'utf8'));
    for (const asset of catalog.spSceneAssets) {
      const placement = attachments[`${asset.style}/${asset.breed}`];
      same([placement?.width, placement?.height], [asset.width, asset.height], 'Accessory coordinates match the reviewed native master dimensions');
      check(fs.existsSync(path.join(root, 'local-assets/site', asset.aseprite)), `${asset.style}/${asset.breed}: editable Aseprite master exists`);
      for (const scene of sceneNames) {
        const sheet = asset.scenes[scene], bytes = fs.readFileSync(path.join(root, 'local-assets/site', sheet.png));
        same(placement.scenes[scene].length, sheet.frames, 'Every actual animation frame has its own attachment coordinates');
        for (const pose of placement.scenes[scene]) {
          check(['headX', 'eyeY', 'top', 'neckX', 'neckY', 'ribbonX', 'ribbonY'].every(key => Number.isFinite(pose[key]) && pose[key] >= 0 && pose[key] <= 64), 'Reviewed accessory attachments stay within the visible native dog canvas');
          if (scene !== 'sleep') same(pose.eyes.length, scene === 'side' || scene === 'walk' ? 1 : 2, 'Glasses follow the actual side eye or front eye pair');
        }
        const metadata = await sharp(bytes).metadata();
        same([metadata.width, metadata.height, metadata.hasAlpha], [asset.width * sheet.frames, asset.height, true], `${sheet.png}: native transparent sheet dimensions`);
        if (scene === 'idle') idleHashes.add(createHash('sha256').update(bytes).digest('hex'));
        if (sheet.frames > 1) {
          const hashes = new Set();
          for (let frame = 0; frame < sheet.frames; frame++) {
            const pixels = await sharp(bytes).extract({ left: frame * asset.width, top: 0, width: asset.width, height: asset.height }).raw().toBuffer();
            hashes.add(createHash('sha256').update(pixels).digest('hex'));
          }
          check(hashes.size >= (scene === 'walk' ? 4 : 3), `${sheet.png}: actual independently drawn motion frames`);
        }
      }
    }
    same(idleHashes.size, 60, 'No duplicated dog masquerades as another breed or style');
  }
  console.log(`PASS: ${checks} SP scene ${process.argv.includes('--contract-only') ? 'contract/render' : 'contract/render/asset'} checks.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
