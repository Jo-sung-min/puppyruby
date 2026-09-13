'use strict';
// Renderer and manifest checks against actual PNGs. --partial permits a pilot without registering unfinished assets.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), { createHash } = require('node:crypto');
const { createRequire } = require('node:module'), { loadFrontend } = require('./frontend-loader.cjs');
const root = path.resolve(__dirname, '..'), req = createRequire(path.join(root, 'frontend/package.json'));
const React = req('react'), { renderToStaticMarkup } = req('react-dom/server'), sharp = req('sharp');
const library = loadFrontend('src/lib/art16-scene-styles.ts');
const { assetUrl } = loadFrontend('src/lib/asset-url.ts');
const { dogBreedIds } = loadFrontend('src/lib/dog-breeds.ts');
const { dogStyles, defaultAppearance, resolveDogStyle } = loadFrontend('src/lib/dog-styles.ts');
const { art16SceneStyleId, art16Scenes, parseArt16SceneAssets, art16SceneForMood, art16FrameIndex } = library;
const partial = process.argv.includes('--partial');
let checks = 0;
function check(value, message) { assert.ok(value, message); checks++; }
const digest = data => createHash('sha256').update(data).digest('hex');
function fixture(breed) { return { breed, width: 362, height: 362, aseprite: `/downloads/art16-scenes-v1/${breed}.aseprite`,
  scenes: Object.fromEntries(art16Scenes.map(({ id }) => [id, { png: `/images/art16-scenes-v1/${breed}/${id}.png`, frames: id === 'walk' ? 8 : 1, frameMs: 125 }])) }; }

(async () => {
  const valid = fixture('pomeranian'), fixtures = dogBreedIds.map(fixture);
  check(parseArt16SceneAssets(fixtures).length === 30, 'All registered breed IDs can have five verified scenes');
  check(parseArt16SceneAssets([valid, valid]).length === 1, 'Duplicate breed entries do not create duplicate assets');
  for (const invalid of [null, {}, [{ ...valid, breed: 'unknown' }], [{ ...valid, width: 64 }], [{ ...valid, height: Infinity }],
    [{ ...valid, width: 362.5 }], [{ ...valid, aseprite: '/downloads/wrong.aseprite' }], [{ ...valid, scenes: null }]])
    check(parseArt16SceneAssets(invalid).length === 0, 'Invalid/downsized/mismatched manifest entries are rejected');
  for (const { id } of art16Scenes) {
    const missing = structuredClone(valid); delete missing.scenes[id];
    check(parseArt16SceneAssets([missing]).length === 0, `Incomplete ${id} scenes cannot be applied`);
    for (const field of ['png', 'frames', 'frameMs']) {
      const invalid = structuredClone(valid); invalid.scenes[id][field] = field === 'png' ? '/images/wrong.png' : 0;
      check(parseArt16SceneAssets([invalid]).length === 0, `Invalid ${id}/${field} is rejected`);
    }
  }
  const expectedMoods = { idle: 'idle', sleep: 'sleep', walk: 'walk', drag: 'side', scroll: 'side', love: 'happy', play: 'happy', excited: 'idle', eat: 'idle', typing: 'idle' };
  for (const [mood, scene] of Object.entries(expectedMoods)) check(art16SceneForMood(mood) === scene, `${mood} selects its real scene`);
  for (const [frame, index] of [[0, 0], [7, 7], [8, 0], [-1, 7], [2.8, 2], [Infinity, 0], [NaN, 0]]) check(art16FrameIndex(frame, 8) === index, 'Static frame selection is finite and cyclic');
  check(dogStyles.some(style => style.id === art16SceneStyleId) === library.art16ScenesReady, 'Style becomes applicable only when all breeds are complete');
  if (!partial) check(library.art16ScenesReady && library.art16SceneAssets.length === 30, 'All 30 breeds and 150 scene sheets must be ready');
  let assets = library.art16SceneAssets;
  if (partial && !assets.length) assets = parseArt16SceneAssets(dogBreedIds.flatMap(breed => {
    const report = path.join(root, 'local-assets/work/art16-scenes-v1/processed', breed, 'conversion.json');
    return fs.existsSync(report) ? [JSON.parse(fs.readFileSync(report, 'utf8').replace(/^\uFEFF/, ''))] : [];
  }));
  check(assets.length > 0, 'At least one real generated breed is required for renderer verification');
  const rendererLib = { ...library, art16SceneAsset: breed => assets.find(asset => asset.breed === breed) };
  const renderer = loadFrontend('src/components/art16-scene-pixel-dog.tsx', { '../lib/art16-scene-styles': rendererLib });
  const { PixelDog } = loadFrontend('src/components/pixel-dog.tsx', { './art16-scene-pixel-dog': renderer });
  const { PuppySprite } = loadFrontend('src/components/puppy-sprite.tsx', { './styled-pixel-dog': { PixelDog } });
  const puppy = { breed: 0, fur: 'chocolate', eyes: 'green', accessory: 'ribbon', aura: 'none' };
  const idleSprite = PuppySprite({ puppy }).props.children.props;
  check(idleSprite.mood === 'idle' && idleSprite.breed === 'pomeranian', 'Game thumbnails and non-interacting puppies default to front-seated idle');
  const walkingSprite = PuppySprite({ puppy, mood: 'walk', scene: 'side', paused: true }).props.children.props;
  check(walkingSprite.mood === 'walk' && walkingSprite.scene === 'side' && walkingSprite.paused === true, 'Shared game sprite forwards live movement, explicit scene and pause controls');
  check(walkingSprite.accessory === 'ribbon' && walkingSprite.fur === idleSprite.fur && walkingSprite.eyes === idleSprite.eyes, 'Motion forwarding retains existing cosmetics');
  await verifyHomeReactions();
  verifyQuietInput();
  const markup = props => renderToStaticMarkup(React.createElement(PixelDog, { styleId: art16SceneStyleId, groundShadow: false, ...props }));
  const drawings = new Set();
  for (const asset of assets) {
    const editable = fs.readFileSync(path.join(root, 'local-assets/site', asset.aseprite));
    check(editable.readUInt16LE(4) === 0xa5e0 && editable.readUInt16LE(6) === 12 && editable.readUInt16LE(8) === asset.width
      && editable.readUInt16LE(10) === asset.height && editable.readUInt16LE(12) === 32, `${asset.breed} editable master preserves 12 RGBA frames at native dimensions`);
    for (const { id } of art16Scenes) {
      const sheet = asset.scenes[id], buffer = fs.readFileSync(path.join(root, 'local-assets/site', sheet.png));
      const pixels = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      check(pixels.info.width === asset.width * sheet.frames && pixels.info.height === asset.height, `${asset.breed}/${id} has exact native sheet dimensions`);
      check(buffer[25] === 6, `${asset.breed}/${id} uses RGBA instead of indexed/recolored pixels`);
      const hashes = new Set();
      for (let frame = 0; frame < sheet.frames; frame++) {
        const original = await sharp(buffer).extract({ left: frame * asset.width, top: 0, width: asset.width, height: asset.height }).ensureAlpha().raw().toBuffer();
        const hash = digest(original); hashes.add(hash);
        let opaque = 0, transparent = 0;
        for (let i = 3; i < original.length; i += 4) { if (original[i] === 255) opaque++; if (original[i] === 0) transparent++; }
        check(opaque > 1000 && transparent > 1000, `${asset.breed}/${id}/${frame} contains actual art on transparency`);
        const svg = markup({ breed: asset.breed, scene: id, paused: true, frame });
        check(svg.includes(`data-dog-scene="${id}"`) && svg.includes(`href="${assetUrl(sheet.png)}"`) && svg.includes(`x="${-frame * asset.width}"`), `${asset.breed}/${id}/${frame} selects its real image region`);
        check(!/NaN|Infinity|<filter\b/.test(svg), 'No fake recoloring or invalid transforms');
        const native = svg.replace('<svg ', `<svg xmlns="http://www.w3.org/2000/svg" width="${asset.width}" height="${asset.height}" `)
          .replace(/href="[^"]+"/, `href="data:image/png;base64,${buffer.toString('base64')}"`);
        const rendered = await sharp(Buffer.from(native)).ensureAlpha().raw().toBuffer();
        let changed = 0;
        for (let p = 0; p < original.length; p += 4) {
          const alpha = original[p + 3];
          if (rendered[p + 3] !== alpha) changed++;
          for (let c = 0; c < 3; c++) if (alpha === 255 && rendered[p + c] !== original[p + c] || alpha > 0 && alpha < 255 && Math.abs(rendered[p + c] - original[p + c]) > 1) changed++;
        }
        check(changed === 0, `${asset.breed}/${id}/${frame} renderer preserves native RGBA pixels`);
      }
      check(hashes.size === sheet.frames, `${asset.breed}/${id} uses distinct drawn frames`);
      const sceneHash = digest(buffer); check(!drawings.has(sceneHash), `${asset.breed}/${id} is not a repeated scene from another breed`); drawings.add(sceneHash);
    }
    const idle = markup({ breed: asset.breed });
    check(idle.includes('data-dog-scene="idle"'), `${asset.breed} faces front and sits without interaction`);
    check(markup({ breed: asset.breed, scene: 'walk' }).includes('playing'), `${asset.breed} walking animates independent of user-input frame counters`);
    check(!markup({ breed: asset.breed, scene: 'walk', paused: true }).includes(' playing'), `${asset.breed} pause stops the frame strip`);
    check(markup({ breed: asset.breed, fur: '#123456', eyes: '#abcdef', variant: { shape: 'fox', pattern: 'patches', coatColor: '#aabbcc', patternColor: '#ffffff' } }) === idle,
      `${asset.breed} retains its original breed details and colors`);
    for (const [mood, scene] of Object.entries(expectedMoods)) check(markup({ breed: asset.breed, mood }).includes(`data-dog-scene="${scene}"`), 'Live mood routing reaches real artwork');
    if (library.art16ScenesReady) check(resolveDogStyle({ ...defaultAppearance, defaultStyle: art16SceneStyleId }, asset.breed) === art16SceneStyleId, 'Completed art can be assigned across breeds');
  }
  const css = fs.readFileSync(path.join(root, 'frontend/src/components/art16-scene-pixel-dog.module.css'), 'utf8');
  check(css.includes('steps(var(--art16-frames), end)') && css.includes('prefers-reduced-motion: reduce'), 'Walking uses discrete frames and respects reduced motion');
  console.log(`PASS: ${checks} renderer checks; ${assets.length} breeds / ${assets.length * 5} scenes / ${assets.length * 12} native frames; ${partial ? 'PILOT ONLY — incomplete collection remains unavailable' : 'full collection applicable'}.`);
})().catch(error => { console.error(error.stack); process.exitCode = 1; });

async function verifyHomeReactions() {
  const game = loadFrontend('src/lib/game.ts');
  const pet = { id: 'motion-fixture', name: '루비', breed: 0, grade: 'N', xp: 10, hunger: 70, happiness: 70, energy: 70,
    lastFeed: 0, lastPlay: 0, lastRest: 0, lastTrain: 0, fur: 'original', eyes: 'original', accessory: 'none' };
  const fixture = { puppies: [pet], selectedId: pet.id, grades: [{ id: 'N', obedience: 80 }, { id: 'R', obedience: 85 }], promotionXp: 100, commands: [], coins: 0, giftAvailable: false };
  let cursor = 0, effects = [], values = [], requestSuccess = true, requestCount = 0;
  const liveInput = { reaction: null, look: 1, lookY: -1, frame: 1,
    isBellyActive: () => liveInput.reaction?.mood === 'belly', cancelReaction: () => { liveInput.reaction = null; } };
  const hooks = { ...React, useState(initial) { const index = cursor++; if (!(index in values)) values[index] = index === 0 ? fixture : typeof initial === 'function' ? initial() : initial;
    return [values[index], next => { values[index] = typeof next === 'function' ? next(values[index]) : next; }]; }, useRef: initial => ({ current: initial }),
    useId: () => 'motion-fixture', useCallback: callback => callback, useEffect: (effect, deps) => effects.push({ effect, deps }) };
  const { PuppyHome } = loadFrontend('src/components/puppy-home.tsx', { react: hooks, './theme-provider': { useTheme: () => ({ theme: 'light' }), ThemeToggle: () => null },
    './use-puppy-input': { usePuppyInput: () => liveInput },
    '@/lib/game': { ...game, requestGame: async () => { requestCount++; return { success: requestSuccess, state: fixture, message: '테스트' }; } } });
  const render = () => { cursor = 0; effects = []; return PuppyHome(); };
  function find(node, predicate) {
    if (Array.isArray(node)) { for (const child of node) { const result = find(child, predicate); if (result) return result; } return null; }
    if (!node || typeof node !== 'object' || !node.props) return null;
    return predicate(node) ? node : find(node.props.children, predicate);
  }
  const room = tree => find(tree, node => node.type === 'button' && node.props['aria-label'] === '루비 쓰다듬기');
  const roomMood = tree => room(tree).props.children.props.mood;
  let tree = render(); check(roomMood(tree) === 'idle', 'Actual home page starts with front-seated idle');
  liveInput.reaction = { mood: 'typing', label: 'typing', at: 1 }; tree = render();
  check(roomMood(tree) === 'typing', 'The real home puppy receives its active keyboard reaction');
  check(room(tree).props.children.props.look === 1 && room(tree).props.children.props.lookY === -1, 'The real home puppy receives both gaze axes');
  room(tree).props.onClick(); tree = render(); check(roomMood(tree) === 'love', 'Petting home puppy reaches the happy artwork');
  check(roomMood(tree) !== liveInput.reaction.mood, 'Intentional petting wins over an active keyboard reaction');
  liveInput.reaction = null;
  const requestsBefore = requestCount;
  for (const [action, mood] of [['feed', 'eat'], ['play', 'play'], ['rest', 'sleep']]) {
    const section = find(tree, node => node.props.className === 'care-actions');
    const button = find(section, node => node.type === 'button' && node.key === action);
    check(!!button, `${action} action is present in home UI`);
    await button.props.onClick(); tree = render();
    check(roomMood(tree) === mood, `${action} changes the real home puppy scene`);
  }
  check(requestCount === requestsBefore + 3, 'Scene reactions reuse existing care actions without extra server writes');
  const reactionEffect = effects.find(item => item.deps?.length === 1 && item.deps[0]?.mood === 'sleep');
  check(!!reactionEffect, 'Home reaction has a cleanup timer');
  const originalTimeout = global.setTimeout; let finish, duration;
  try { global.setTimeout = (callback, delay) => { finish = callback; duration = delay; return 0; }; reactionEffect.effect(); }
  finally { global.setTimeout = originalTimeout; }
  check(duration === 5000, 'Rest pose stays briefly visible'); finish(); tree = render();
  check(roomMood(tree) === 'idle', 'With no new interaction the home puppy returns to front-seated idle');
  requestSuccess = false;
  const section = find(tree, node => node.props.className === 'care-actions');
  await find(section, node => node.type === 'button' && node.key === 'rest').props.onClick();
  check(roomMood(render()) === 'idle', 'Unsuccessful care requests do not falsely start a successful pose');
}

function verifyQuietInput() {
  let cursor = 0, values = [], effect, tick, now = 0;
  const listeners = new Map();
  const hooks = { ...React, useState(initial) { const index = cursor++; values[index] = initial;
    return [initial, next => { values[index] = typeof next === 'function' ? next(values[index]) : next; }]; }, useRef: initial => ({ current: initial }), useCallback: callback => callback, useEffect: callback => { effect = callback; } };
  const { usePuppyInput } = loadFrontend('src/components/use-puppy-input.ts', { react: hooks });
  const previous = { window: global.window, document: global.document, performance: global.performance, setInterval: global.setInterval, clearInterval: global.clearInterval };
  try {
    global.window = { addEventListener: (name, handler) => listeners.set(name, handler), removeEventListener: name => listeners.delete(name) };
    global.document = { hidden: false, addEventListener() {}, removeEventListener() {} };
    global.performance = { now: () => now };
    global.setInterval = callback => { tick = callback; return 77; }; global.clearInterval = () => {};
    usePuppyInput({ current: null }, false); const cleanup = effect();
    now = 60_000; tick(); check(values[0] === null, 'A quiet playground stays front-seated instead of automatically sleeping');
    listeners.get('keydown')(); check(values[0]?.mood === 'typing', 'Keyboard input still produces a temporary reaction');
    now += 1000; tick(); check(values[0] === null, 'Expired keyboard interaction returns to front-seated idle');
    cleanup(); check(listeners.size === 0, 'Input handlers are removed after the playground unmounts');
  } finally {
    if (previous.window === undefined) delete global.window; else global.window = previous.window;
    if (previous.document === undefined) delete global.document; else global.document = previous.document;
    global.performance = previous.performance; global.setInterval = previous.setInterval; global.clearInterval = previous.clearInterval;
  }
}
