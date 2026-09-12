const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const Module = require('node:module');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const requireFrontend = createRequire(path.join(root, 'frontend/package.json'));
const swc = requireFrontend('next/dist/build/swc');
const React = requireFrontend('react');
const { renderToStaticMarkup } = requireFrontend('react-dom/server');
const sharp = requireFrontend('sharp');
const sourcePath = path.join(root, 'frontend/src/components/pixel-dog.tsx');
const compiled = swc.transformSync(fs.readFileSync(sourcePath, 'utf8'), {
  filename: sourcePath,
  jsc: { parser: { syntax: 'typescript', tsx: true }, transform: { react: { runtime: 'automatic' } }, target: 'es2020' },
  module: { type: 'commonjs' },
}).code;
const component = new Module(sourcePath, module);
component.filename = sourcePath;
component.paths = Module._nodeModulePaths(path.dirname(sourcePath));
component._compile(compiled, sourcePath);
const { PixelDog } = component.exports;
function loadFrontend(relativePath, overrides = {}) {
  const filename = path.join(root, 'frontend', relativePath);
  const code = swc.transformSync(fs.readFileSync(filename, 'utf8'), {
    filename, jsc: { parser: { syntax: 'typescript', tsx: filename.endsWith('.tsx') }, transform: { react: { runtime: 'automatic' } }, target: 'es2020' },
    module: { type: 'commonjs' },
  }).code;
  const loaded = new Module(filename, module);
  loaded.filename = filename; loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const fallback = loaded.require.bind(loaded);
  loaded.require = name => overrides[name] || fallback(name);
  loaded._compile(code, filename);
  return loaded.exports;
}
const game = loadFrontend('src/lib/game.ts');
// Native exports use the pure default renderer. Runtime web settings are not embedded here.
const { PuppySprite } = loadFrontend('src/components/puppy-sprite.tsx', { '../lib/cosmetics': loadFrontend('src/lib/cosmetics.ts'), '@/lib/game': game, './styled-pixel-dog': component.exports });
const out = path.join(__dirname, 'build/assets');
fs.mkdirSync(out, { recursive: true });

const webBreeds = ['pomeranian', 'poodle', 'maltese', 'shiba', 'corgi', 'beagle'];
function appearance(breed, fur, eyes, accessory) {
  // Let the real web wrapper resolve its coat colors and eye palette; its UI swatch colors differ.
  const element = PuppySprite({ puppy: { breed: Math.max(0, webBreeds.indexOf(breed)), fur, eyes, accessory }, decorative: true });
  return { ...element.props.children.props, breed };
}
function svgFor(props) {
  return renderToStaticMarkup(React.createElement(PixelDog, { ...props, groundShadow: false }))
    .replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" ');
}
async function rawSprite(breed, mood, look, frame, fur, eyes = 'original', accessory = 'none') {
  const { data, info } = await sharp(Buffer.from(svgFor({ ...appearance(breed, fur, eyes, accessory), mood, look, frame })))
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 64); assert.equal(info.height, 64); assert.equal(info.channels, 4);
  return data;
}
function difference(before, after) {
  const overlay = Buffer.alloc(before.length);
  for (let pixel = 0; pixel < before.length; pixel += 4) {
    if (before.subarray(pixel, pixel + 4).equals(after.subarray(pixel, pixel + 4))) continue;
    // PixelDog accessories/eyes are opaque integer-grid pixels, so sparse replacement is exact.
    assert.equal(after[pixel + 3], 255, 'Changed overlay pixels must be opaque');
    after.copy(overlay, pixel, pixel, pixel + 4);
  }
  return overlay;
}
function compose(body, ...overlays) {
  const result = Buffer.from(body);
  for (const overlay of overlays) if (overlay) {
    for (let pixel = 0; pixel < result.length; pixel += 4) if (overlay[pixel + 3]) overlay.copy(result, pixel, pixel, pixel + 4);
  }
  return result;
}

async function exportLinked(breeds, moods) {
  const furs = game.furOptions.map(item => item.id), eyes = game.eyeOptions.map(item => item.id), accessories = game.accessories.map(item => item.id);
  const manifest = { version: 1, width: 64, height: 64, breeds, webBreeds, moods, furs, eyes, accessories, bodies: {}, eyeLayers: {}, accessoryLayers: {} };
  const resources = new Map();
  async function resource(data) {
    const name = `linked-${createHash('sha256').update(data).digest('hex')}.png`;
    if (!resources.has(name)) {
      resources.set(name, data);
      await sharp(data, { raw: { width: 64, height: 64, channels: 4 } }).png().toFile(path.join(out, name));
    }
    return name;
  }
  for (const mood of moods) for (const look of [-1, 0, 1]) for (const frame of [0, 1]) {
    const prefix = `${mood}|${look + 1}|${frame}`;
    const standard = await rawSprite('shiba', mood, look, frame, 'original');
    for (const eye of eyes) manifest.eyeLayers[`${prefix}|${eye}`] = eye === 'original' ? null
      : await resource(difference(standard, await rawSprite('shiba', mood, look, frame, 'original', eye)));
    for (const accessory of accessories) manifest.accessoryLayers[`${prefix}|${accessory}`] = accessory === 'none' ? null
      : await resource(difference(standard, await rawSprite('shiba', mood, look, frame, 'original', 'original', accessory)));
    for (const breed of breeds) for (const fur of furs) {
      manifest.bodies[`${breed}|${prefix}|${fur}`] = await resource(await rawSprite(breed, mood, look, frame, fur));
    }
  }
  assert.equal(Object.keys(manifest.bodies).length, breeds.length * moods.length * 6 * furs.length);
  const verifyDir = path.join(__dirname, 'build/linked-verification'); fs.mkdirSync(verifyDir, { recursive: true });
  const examples = [];
  let verified = 0;
  async function verify(breed, mood, look, frame, fur, eye, accessory, save = false) {
    const prefix = `${mood}|${look + 1}|${frame}`;
    const actual = compose(resources.get(manifest.bodies[`${breed}|${prefix}|${fur}`]), resources.get(manifest.eyeLayers[`${prefix}|${eye}`]), resources.get(manifest.accessoryLayers[`${prefix}|${accessory}`]));
    const expected = await rawSprite(breed, mood, look, frame, fur, eye, accessory);
    assert.ok(actual.equals(expected), `Linked pixels differ: ${breed}/${prefix}/${fur}/${eye}/${accessory}`);
    verified++;
    if (save) {
      const filename = `sample-${examples.length}.png`;
      await sharp(expected, { raw: { width: 64, height: 64, channels: 4 } }).png().toFile(path.join(verifyDir, filename));
      examples.push({ breed, mood, look, frame, fur, eyes: eye, accessory, filename });
    }
  }
  // Cover every pose/look/frame/breed, rotating appearances, plus every customization combination.
  for (const [index, breed] of breeds.entries()) for (const [moodIndex, mood] of moods.entries()) for (const look of [-1, 0, 1]) for (const frame of [0, 1]) {
    const pick = index * 7 + moodIndex * 3 + look + 1 + frame;
    await verify(breed, mood, look, frame, furs[pick % furs.length], eyes[pick % eyes.length], accessories[(pick + 1) % accessories.length], look === 0 && frame === 0 && ['idle', 'typing', 'sleep'].includes(mood));
  }
  for (const fur of furs) for (const eye of eyes) for (const accessory of accessories) await verify('pomeranian', 'excited', -1, 1, fur, eye, accessory);
  fs.writeFileSync(path.join(out, 'linked-sprites.json'), JSON.stringify(manifest));
  fs.writeFileSync(path.join(verifyDir, 'samples.json'), JSON.stringify(examples));
  // Remove only obsolete files produced by this content-addressed exporter, preserving legacy assets.
  for (const filename of fs.readdirSync(out)) if (/^linked-[a-f0-9]{64}\.png$/.test(filename) && !resources.has(filename)) fs.unlinkSync(path.join(out, filename));
  const width = 3 * 224, height = breeds.length * 242;
  const tiles = [];
  for (const [index, sample] of examples.entries()) {
    const left = (index % 3) * 224, top = Math.floor(index / 3) * 242;
    tiles.push({ input: await sharp(path.join(verifyDir, sample.filename)).resize(192, 192, { kernel: 'nearest' }).png().toBuffer(), left: left + 16, top });
    const label = `<svg width="224" height="48"><style>text{font:12px sans-serif;fill:#433024}</style><text x="8" y="15">${sample.breed} / ${sample.mood}</text><text x="8" y="34">${sample.fur} / ${sample.eyes} / ${sample.accessory}</text></svg>`;
    tiles.push({ input: Buffer.from(label), left, top: top + 192 });
  }
  await sharp({ create: { width, height, channels: 4, background: '#fff9ed' } }).composite(tiles).png().toFile(path.join(__dirname, 'build/linked-contact-sheet.png'));
  console.log(`Linked sprites: ${Object.keys(manifest.bodies).length} body mappings + ${Object.keys(manifest.eyeLayers).length + Object.keys(manifest.accessoryLayers).length} overlay mappings in ${resources.size} deduplicated PNGs; ${verified} exact RGBA comparisons passed.`);
}

(async () => {
  const breeds = ['shiba', 'samoyed', 'poodle', 'corgi', 'maltese', 'beagle', 'pomeranian'];
  const moods = ['idle', 'love', 'eat', 'play', 'sleep', 'typing', 'excited', 'scroll', 'drag', 'walk'];
  const entries = [];
  for (const breed of breeds) for (const mood of moods) for (const look of [-1, 0, 1]) for (const frame of [0, 1]) {
    let svg = renderToStaticMarkup(React.createElement(PixelDog, { breed, mood, look, frame, decorative: true, groundShadow: false }));
    svg = svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" ');
    const name = `${breed}-${mood}-${look + 1}-${frame}.png`;
    entries.push(sharp(Buffer.from(svg)).png().toFile(path.join(out, name)));
    if (entries.length >= 12) await Promise.all(entries.splice(0));
  }
  await Promise.all(entries);
  const iconPng = await sharp(path.join(out, 'shiba-idle-1-0.png')).resize(64, 64, { kernel: 'nearest' }).png().toBuffer();
  const header = Buffer.alloc(22);
  header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
  header[6] = 64; header[7] = 64;
  header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12);
  header.writeUInt32LE(iconPng.length, 14); header.writeUInt32LE(22, 18);
  fs.writeFileSync(path.join(out, 'puppy.ico'), Buffer.concat([header, iconPng]));
  console.log(`Exported ${breeds.length * moods.length * 6} embedded pixel sprites.`);
  await exportLinked(breeds, moods);
})().catch(error => { console.error(error); process.exitCode = 1; });
