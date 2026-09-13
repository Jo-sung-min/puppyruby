'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { createRequire } = require('node:module'), { loadFrontend } = require('./frontend-loader.cjs');
const root = path.resolve(__dirname, '..'), req = createRequire(path.join(root, 'frontend/package.json'));
const React = req('react'), { renderToStaticMarkup } = req('react-dom/server'), sharp = req('sharp');
const { art16ReactionAnchors, art16GazeOffset } = loadFrontend('src/lib/art16-reactions.ts');
const { art16SceneAssets, art16SceneForMood, art16SceneStyleId } = loadFrontend('src/lib/art16-scene-styles.ts');
const { PixelDog } = loadFrontend('src/components/pixel-dog.tsx');
const { publicAssetBaseUrl } = loadFrontend('src/lib/asset-url.ts');
const shared = JSON.parse(fs.readFileSync(path.join(root, 'shared/art16-reaction-anchors.json'), 'utf8'));
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };
const markup = props => renderToStaticMarkup(React.createElement(PixelDog, { styleId: art16SceneStyleId, mood: 'idle', groundShadow: false, ...props }));

async function pixels(svg, asset) {
  const native = svg.replace('<svg ', `<svg xmlns="http://www.w3.org/2000/svg" width="${asset.width}" height="${asset.height}" `)
    .replace(/href="([^"]+\.png)"/g, (_, uri) => {
      const base = publicAssetBaseUrl();
      const logicalPath = base && uri.startsWith(`${base}/images/`) ? uri.slice(base.length) : uri;
      assert.ok(/^\/images\/art16-scenes-v1\/[a-z]+\/[a-z]+\.png$/.test(logicalPath), 'Raster checks embed only the delivered art16 scene image');
      const filename = path.join(root, 'local-assets/site', logicalPath);
      return `href="data:image/png;base64,${fs.readFileSync(filename).toString('base64')}"`;
    });
  return sharp(Buffer.from(native)).ensureAlpha().raw().toBuffer();
}

function differences(a, b, asset, allowed) {
  let changed = 0, outside = 0;
  for (let y = 0; y < asset.height; y++) for (let x = 0; x < asset.width; x++) {
    const p = (y * asset.width + x) * 4;
    if (a[p] !== b[p] || a[p + 1] !== b[p + 1] || a[p + 2] !== b[p + 2] || a[p + 3] !== b[p + 3]) {
      changed++; if (!allowed(x, y)) outside++;
    }
  }
  return { changed, outside };
}

(async () => {
  verifyLiveInput();
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'frontend/src/lib/generated/art16-reaction-anchors.json'), 'utf8')), shared);
  checks++;
  check(art16SceneAssets.length === 30, 'Every registered breed is available for reaction checks');
  check(art16SceneForMood('typing') === 'idle' && art16SceneForMood('excited') === 'idle', 'Ordinary and fast typing use front sitting');
  check(!art16ReactionAnchors('unknown', 369, 384), 'Unknown breeds cannot use mismatched eye anchors');
  for (const asset of art16SceneAssets) {
    const a = art16ReactionAnchors(asset.breed, asset.width, asset.height);
    check(!!a && a.eyes.length === 2 && a.paws.length === 2, `${asset.breed} has two native eye and paw anchors`);
    check(!art16ReactionAnchors(asset.breed, asset.width - 1, asset.height), `${asset.breed} rejects resized anchor metadata`);
    for (const eye of a.eyes) for (const x of [-100, -1, 0, 1, 100, NaN, Infinity]) for (const y of [-100, -1, 0, 1, 100, NaN, Infinity]) {
      const offset = art16GazeOffset(eye, x, y);
      check(Number.isInteger(offset.x) && Number.isInteger(offset.y) && Math.abs(offset.x) <= 4 && Math.abs(offset.y) <= 3, `${asset.breed} pupils remain inside a bounded integer pixel shift`);
      const paused = art16GazeOffset(eye, x, y, true);
      check(paused.x === 0 && paused.y === 0, `${asset.breed} pause cancels cursor offsets`);
    }
    const idle = markup({ breed: asset.breed }), left = markup({ breed: asset.breed, look: -1 }), right = markup({ breed: asset.breed, look: 1 });
    const neutralPixels = await pixels(idle, asset), leftPixels = await pixels(left, asset), rightPixels = await pixels(right, asset);
    const eyeRegion = (x, y) => a.eyes.some(eye => Math.abs(x - eye.x) <= eye.rx + 2 && Math.abs(y - eye.y) <= eye.ry + 2);
    const leftDiff = differences(neutralPixels, leftPixels, asset, eyeRegion), rightDiff = differences(neutralPixels, rightPixels, asset, eyeRegion);
    check(leftDiff.changed > 0 && rightDiff.changed > 0, `${asset.breed} actually moves its pupils in rendered pixels`);
    check(leftDiff.outside === 0 && rightDiff.outside === 0, `${asset.breed} gaze preserves every rendered pixel outside its eyes`);
    check(!leftPixels.equals(rightPixels), `${asset.breed} left and right look distinct`);
    for (const mood of ['typing', 'excited']) {
      const typing = markup({ breed: asset.breed, mood, look: 1, lookY: -1 });
      check(typing.includes('data-dog-scene="idle"') && typing.includes('data-dog-keyboard="front"'), `${asset.breed} ${mood} shows a front keyboard`);
      check(typing.includes('data-typing-paw="left"') && typing.includes('data-typing-paw="right"'), `${asset.breed} ${mood} includes both independently animated paws`);
      check(!typing.includes('data-gaze-offset='), `${asset.breed} ${mood} keeps its eyes facing the keyboard`);
      const paused = markup({ breed: asset.breed, mood, paused: true, look: -1 });
      check(!paused.includes('data-dog-keyboard=') && !paused.includes('data-gaze-offset='), `${asset.breed} pause stops live typing and gaze`);
    }
    const typingPixels = await pixels(markup({ breed: asset.breed, mood: 'typing' }), asset);
    const typingDiff = differences(neutralPixels, typingPixels, asset, (_, y) => y >= asset.height * 2 / 3);
    check(typingDiff.changed > 0 && typingDiff.outside === 0, `${asset.breed} keyboard reaction preserves the original face and upper body`);
    for (const scene of ['idle', 'sleep']) {
      const preview = markup({ breed: asset.breed, mood: 'typing', scene, paused: true, look: 1, lookY: 1 });
      check(!preview.includes('data-dog-keyboard=') && !preview.includes('data-gaze-offset=') && !preview.includes('class="sleepSigns"'), `${asset.breed} explicit ${scene} preview retains original artwork without input overlays`);
    }
  }
  const css = fs.readFileSync(path.join(root, 'frontend/src/components/art16-scene-pixel-dog.module.css'), 'utf8');
  check(/\.pawRight\s*\{[^}]*animation-delay:\s*calc\(var\(--art16-paw-speed\)\s*\*\s*-\.5\)/.test(css), 'Right paw is half a typing cycle behind the left paw');
  check(css.includes('prefers-reduced-motion: reduce') && css.includes('.dog[data-paused]'), 'Reduced-motion and pause disable reaction animation');
  console.log(`PASS ${checks} web reaction checks for ${art16SceneAssets.length} breeds; native eye-only pixel changes and front typing verified.`);
})().catch(error => { console.error(error.stack); process.exitCode = 1; });

function verifyLiveInput() {
  let cursor = 0, values = [], references = [], effect, tick, now = 1000;
  const listeners = new Map(), documentListeners = new Map();
  const hooks = { ...React, useState(initial) {
    const index = cursor++; if (!(index in values)) values[index] = initial;
    return [values[index], next => { values[index] = typeof next === 'function' ? next(values[index]) : next; }];
  }, useRef(initial) { const ref = { current: initial }; references.push(ref); return ref; }, useCallback: callback => callback, useEffect(callback) { effect = callback; } };
  const { usePuppyInput } = loadFrontend('src/components/use-puppy-input.ts', { react: hooks });
  const previous = Object.fromEntries(['window', 'document', 'performance', 'setInterval', 'clearInterval', 'Element'].map(name => [name, global[name]]));
  const puppy = { getBoundingClientRect: () => ({ left: 100, top: 100, width: 200, height: 200 }) };
  const stage = { current: { querySelector: () => puppy, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1600, height: 900 }) } };
  try {
    global.window = { addEventListener: (name, handler) => listeners.set(name, handler), removeEventListener: name => listeners.delete(name) };
    global.document = { hidden: false, addEventListener: (name, handler) => documentListeners.set(name, handler), removeEventListener: name => documentListeners.delete(name) };
    global.Element = class { constructor(control) { this.control = control; } closest(selector) { return /room-puppy|garden-dog/.test(selector) ? null : this.control; } };
    global.performance = { now: () => now };
    global.setInterval = callback => { tick = callback; return 77; }; global.clearInterval = () => {};
    usePuppyInput(stage, false); const cleanup = effect();
    check(['keydown', 'pointermove', 'pointerdown', 'wheel', 'blur'].every(name => listeners.has(name)) && documentListeners.has('visibilitychange'), 'Live page attaches mouse, keyboard and focus event handlers');
    listeners.get('pointermove')({ clientX: 0, clientY: 0 });
    check(values[1] === -1 && values[2] === -1, 'Pointer above and left moves both gaze axes relative to the puppy');
    now += 100; listeners.get('pointermove')({ clientX: 310, clientY: 310 });
    check(values[1] === 1 && values[2] === 1, 'Pointer below and right uses puppy bounds rather than whole-page bounds');
    const keyEvent = Object.defineProperties({}, { key: { get() { throw Error('Key identities must not be read'); } }, code: { get() { throw Error('Key codes must not be read'); } } });
    listeners.get('keydown')(keyEvent);
    check(values[0].mood === 'typing', 'Keyboard observation requires no key identities');
    now += 100; listeners.get('pointermove')({ clientX: 200, clientY: 180 });
    check(values[0].mood === 'typing' && values[1] === 0 && values[2] === 0, 'Mouse movement preserves active typing while centering the gaze');
    for (let i = 0; i < 1000; i++) { now += 1; listeners.get('keydown')(keyEvent); }
    check(values[0].mood === 'excited', 'Sustained fast typing reaches the fast keyboard reaction');
    check(references[0].current.length <= 64 && references[0].current.every(value => typeof value === 'number'), 'Typing stores at most 64 recent event timestamps and no text');
    now += 1000; tick();
    check(values[0] === null, 'Last keystroke expires and does not leave a permanent keyboard pose');
    now += 300;
    listeners.get('keydown')(keyEvent);
    check(values[0].mood === 'typing', 'A new typing session does not retain an expired burst');
    listeners.get('pointerdown')({ button: 0, target: new global.Element(true) });
    check(values[0].mood === 'typing', 'Clicking an explicit control does not override its own action with a global jump');
    listeners.get('pointerdown')({ button: 0, target: new global.Element(false) });
    check(values[0].mood === 'play', 'An ordinary page click starts the jump reaction');
    now += 200; listeners.get('wheel')();
    check(values[0].mood === 'scroll', 'Page scrolling keeps its scroll reaction');
    listeners.get('blur')();
    check(values[0] === null && values[1] === 0 && values[2] === 0 && references[0].current.length === 0, 'Leaving the page clears reaction, both gaze axes and typing history');
    now += 100; listeners.get('keydown')(keyEvent); documentListeners.get('visibilitychange')();
    check(values[0] === null && references[0].current.length === 0, 'Hidden-page transition clears the active keyboard reaction');
    cleanup();
    check(listeners.size === 0 && documentListeners.size === 0, 'Unmount removes all installed handlers');
    cursor = 0; usePuppyInput(stage, true); effect();
    check(values[0] === null && values[1] === 0 && values[2] === 0 && listeners.size === 0, 'Paused view remains still without registering input handlers');
  } finally {
    for (const [name, value] of Object.entries(previous)) { if (value === undefined) delete global[name]; else global[name] = value; }
  }
}
