#!/usr/bin/env node
'use strict';

// Read-only component preview. This never imports the production exporter,
// writes code assets, or changes local-assets/desktop/build/assets or its sprite manifest.
//   node scripts/preview-puppy-sprites.cjs          galleries + overlay diagnostic
//   node scripts/preview-puppy-sprites.cjs --quick  galleries only for design iteration
//   node scripts/preview-puppy-sprites.cjs --publish-preview
// The last option is an explicit publication step; use only after reviewing it.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { resolveFrontendDependency } = require('./frontend-loader.cjs');
const { createRequire } = Module;
const { createHash } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const args = new Set(process.argv.slice(2));
const supported = new Set(['--quick', '--publish-preview', '--strict', '--help']);
for (const arg of args) if (!supported.has(arg)) throw new Error(`Unknown option: ${arg}`);
if (args.has('--help')) {
  console.log('Preview actual PuppySprite + PixelDog at native64,192,256px, plus a compact Korean gallery.\n--quick skips the read-only shared-overlay diagnostic.\n--strict exits with error on overlay differences.\n--publish-preview copies the compact rounded-puppies.png into local-assets/site/images.');
  process.exit(0);
}
const requireFrontend = createRequire(path.join(root, 'frontend/package.json'));
const swc = requireFrontend('next/dist/build/swc');
const React = requireFrontend('react');
const { renderToStaticMarkup } = requireFrontend('react-dom/server');
const sharp = requireFrontend('sharp');

function loadComponent(relative, overrides = {}) {
  const filename = path.join(root, 'frontend', relative);
  const compiled = swc.transformSync(fs.readFileSync(filename, 'utf8'), {
    filename,
    jsc: { parser: { syntax: 'typescript', tsx: filename.endsWith('.tsx') }, transform: { react: { runtime: 'automatic' } }, target: 'es2020' },
    module: { type: 'commonjs' },
  }).code;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const fallback = loaded.require.bind(loaded);
  loaded.require = name => Object.hasOwn(overrides, name) ? overrides[name] : resolveFrontendDependency(filename, name, fallback);
  loaded._compile(compiled, filename);
  return loaded.exports;
}

const animatedDog = loadComponent('src/components/animated-dog.tsx', {
  './animated-dog.module.css': new Proxy({}, { get: (_, key) => String(key) }),
});
const dogModule = loadComponent('src/components/pixel-dog.tsx', { './animated-dog': animatedDog });
const game = loadComponent('src/lib/game.ts');
const { PuppySprite } = loadComponent('src/components/puppy-sprite.tsx', {
  '../lib/cosmetics': loadComponent('src/lib/cosmetics.ts'), '@/lib/game': game, './styled-pixel-dog': dogModule,
});
const { PixelDog } = dogModule;
const breeds = ['shiba', 'samoyed', 'poodle', 'corgi', 'maltese', 'beagle', 'pomeranian'];
const breedNames = ['Shiba', 'Samoyed', 'Toy poodle', 'Corgi', 'Maltese', 'Beagle', 'Pomeranian'];
const koreanBreedNames = ['시바견', '사모예드', '토이푸들', '웰시코기', '말티즈', '비글', '포메라니안'];
const webBreeds = ['pomeranian', 'poodle', 'maltese', 'shiba', 'corgi', 'beagle'];
const moods = ['idle', 'love', 'eat', 'play', 'sleep', 'typing', 'excited', 'scroll', 'drag', 'walk'];
const looks = [
  { title: '01 / THEIR OWN COATS', note: 'Default breed palettes · original eyes · no accessory', fur: 'original', eyes: 'original', accessory: 'none' },
  { title: '02 / ROSE & RIBBON', note: 'Actual web rose palette · blue eyes · ribbon', fur: 'rose', eyes: 'blue', accessory: 'ribbon' },
  { title: '03 / SILVER & CROWN', note: 'Actual web silver palette · green eyes · crown', fur: 'silver', eyes: 'green', accessory: 'crown' },
];
const sourceHash = createHash('sha256')
  .update(fs.readFileSync(path.join(root, 'frontend/src/components/pixel-dog.tsx')))
  .update(fs.readFileSync(path.join(root, 'frontend/src/components/puppy-sprite.tsx')))
  .digest('hex').slice(0, 12);
const rawCache = new Map();
function appearance(breed, fur, eyes, accessory) {
  // Resolve colors through the real wrapper. UI swatches are not necessarily
  // the rendering colors. Samoyed is desktop-only, so use the wrapper's palette
  // resolution, then select the real Samoyed PixelDog silhouette.
  const wrapper = PuppySprite({ puppy: { breed: Math.max(0, webBreeds.indexOf(breed)), fur, eyes, accessory }, decorative: true });
  const element = wrapper.props.children;
  if (!React.isValidElement(element) || element.type !== PixelDog) throw new Error('PuppySprite structure changed; update the preview wrapper adapter.');
  return { ...element.props, breed };
}
function rawSprite(breed, mood = 'idle', frame = 0, fur = 'original', eyes = 'original', accessory = 'none', shadow = false) {
  const key = [breed, mood, frame, fur, eyes, accessory, shadow].join('|');
  if (!rawCache.has(key)) rawCache.set(key, (async () => {
    let svg = renderToStaticMarkup(React.createElement(PixelDog, {
      ...appearance(breed, fur, eyes, accessory), mood, frame, look: 0, groundShadow: shadow,
    }));
    svg = svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" ');
    const { data, info } = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (info.width !== 64 || info.height !== 64 || info.channels !== 4) throw new Error('Expected a native64 RGBA sprite.');
    return data;
  })());
  return rawCache.get(key);
}
async function spritePng(props, size) {
  const raw = await rawSprite(...props);
  return sharp(raw, { raw: { width: 64, height: 64, channels: 4 } })
    .resize(size, size, { kernel: 'nearest' }).png().toBuffer();
}
function escapeXml(text) { return String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char])); }

async function renderCompactGallery(out) {
  const width = 928, height = 540, cellWidth = 220, spriteSize = 192;
  const overlays = [];
  // Give Pango an actual Korean font file so the shareable preview keeps its
  // labels even when the export process has no system font cache configured.
  const fontCandidates = [
    process.env.PUPPY_PREVIEW_FONT,
    path.join(process.env.WINDIR || 'C:/Windows', 'Fonts/malgun.ttf'),
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
    '/usr/share/fonts/truetype/nanum/NanumGothic.ttf',
    '/System/Library/Fonts/AppleSDGothicNeo.ttc',
  ].filter(Boolean);
  const fontfile = fontCandidates.find(candidate => fs.existsSync(candidate));
  for (const [index, breed] of breeds.entries()) {
    const row = index < 4 ? 0 : 1;
    const columns = row === 0 ? 4 : 3;
    const column = row === 0 ? index : index - 4;
    const center = (width - columns * cellWidth) / 2 + column * cellWidth + cellWidth / 2;
    const top = 24 + row * 262;
    overlays.push({
      input: await spritePng([breed, 'idle', 0, 'original', 'original', 'none', true], spriteSize),
      left: Math.round(center - spriteSize / 2), top,
    });
    const label = await sharp({ text: {
      text: `<span foreground="#796449">${escapeXml(koreanBreedNames[index])}</span>`,
      font: 'Malgun Gothic, Noto Sans CJK KR, NanumGothic, sans-serif 22',
      ...(fontfile ? { fontfile } : {}), dpi: 72, rgba: true,
    } }).png().toBuffer({ resolveWithObject: true });
    overlays.push({ input: label.data, left: Math.round(center - label.info.width / 2), top: top + spriteSize + 14 });
  }
  const output = path.join(out, 'rounded-puppies.png');
  await sharp({ create: { width, height, channels: 4, background: '#f7f1e6' } })
    .composite(overlays).png().toFile(output);
  return { output, width, height };
}

async function inspectSharedOverlays() {
  const samples = [
    { fur: 'rose', eyes: 'blue', accessory: 'ribbon' },
    { fur: 'silver', eyes: 'green', accessory: 'crown' },
    { fur: 'cream', eyes: 'amber', accessory: 'scarf' },
  ];
  const summary = { checked: 0, mismatches: 0, nonOpaqueOverlayPixels: 0, examples: [] };
  function overlay(before, after) {
    const layer = Buffer.alloc(before.length);
    for (let offset = 0; offset < before.length; offset += 4) {
      if (before.subarray(offset, offset + 4).equals(after.subarray(offset, offset + 4))) continue;
      if (after[offset + 3] !== 255) summary.nonOpaqueOverlayPixels++;
      after.copy(layer, offset, offset, offset + 4);
    }
    return layer;
  }
  for (const mood of moods) for (const frame of [0, 1]) {
    const reference = await rawSprite('shiba', mood, frame);
    for (const sample of samples) {
      const eyeLayer = overlay(reference, await rawSprite('shiba', mood, frame, 'original', sample.eyes));
      const accessoryLayer = overlay(reference, await rawSprite('shiba', mood, frame, 'original', 'original', sample.accessory));
      for (const breed of breeds) {
        const body = await rawSprite(breed, mood, frame, sample.fur);
        const composed = Buffer.from(body);
        for (const layer of [eyeLayer, accessoryLayer]) for (let offset = 0; offset < composed.length; offset += 4)
          if (layer[offset + 3]) layer.copy(composed, offset, offset, offset + 4);
        const expected = await rawSprite(breed, mood, frame, sample.fur, sample.eyes, sample.accessory);
        summary.checked++;
        if (!composed.equals(expected)) {
          summary.mismatches++;
          if (summary.examples.length < 12) {
            const pixels = [];
            for (let offset = 0; offset < composed.length && pixels.length < 8; offset += 4)
              if (!composed.subarray(offset, offset + 4).equals(expected.subarray(offset, offset + 4))) pixels.push({
                x: (offset / 4) % 64, y: Math.floor(offset / 256), actual: [...composed.subarray(offset, offset + 4)], expected: [...expected.subarray(offset, offset + 4)],
              });
            summary.examples.push({ breed, mood, frame, ...sample, pixels });
          }
        }
      }
    }
  }
  return summary;
}

async function main() {
  const started = Date.now();
  const out = path.join(root, 'local-assets/desktop/build');
  fs.mkdirSync(out, { recursive: true });
  const diagnostic = args.has('--quick') ? null : await inspectSharedOverlays();
  const width = 1720, margin = 40, cardWidth = 224, gap = 12;
  const overlays = [];
  const labels = [];
  function text(x, y, value, size = 14, color = '#86745c', weight = 400, anchor = 'start') {
    labels.push(`<text x="${x}" y="${y}" fill="${color}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}">${escapeXml(value)}</text>`);
  }
  function card(x, y, w, h) { labels.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="13" fill="#fffcf5" stroke="#e8ddc9"/>`); }
  text(margin, 42, 'PUPPYRUBY / PIXEL PUPPY STYLE PROOF', 27, '#514530', 700);
  text(margin, 72, 'Actual web components · native pixel geometry · seven breeds · customizable coats and accessories', 15);
  text(width - margin, 42, `SOURCE ${sourceHash}`, 12, '#aa9576', 500, 'end');
  text(width - margin, 68, 'No production sprites changed', 12, '#aa9576', 400, 'end');
  let y = 105;
  for (const look of looks) {
    text(margin, y + 18, look.title, 15, '#785f40', 700);
    text(margin + 320, y + 18, look.note, 13);
    const cardY = y + 35;
    for (const [index, breed] of breeds.entries()) {
      const left = margin + index * (cardWidth + gap);
      card(left, cardY, cardWidth, 243);
      overlays.push({ input: await spritePng([breed, 'idle', 0, look.fur, look.eyes, look.accessory, true], 192), left: left + 16, top: cardY + 10 });
      text(left + cardWidth / 2, cardY + 223, breedNames[index], 15, '#765f43', 600, 'middle');
    }
    y += 292;
  }

  text(margin, y + 15, '04 / TEN LITTLE REACTIONS', 15, '#785f40', 700);
  text(margin + 320, y + 15, 'Shiba · frame 0 and frame 1 at native64 · shared mood geometry', 13);
  const moodY = y + 32, moodWidth = 156;
  for (const [index, mood] of moods.entries()) {
    const left = margin + index * (moodWidth + 8);
    card(left, moodY, moodWidth, 144);
    text(left + moodWidth / 2, moodY + 25, mood, 14, '#765f43', 600, 'middle');
    for (const frame of [0, 1]) {
      overlays.push({ input: await spritePng(['shiba', mood, frame, 'original', 'original', 'none', true], 64), left: left + 9 + frame * 74, top: moodY + 41 });
      text(left + 41 + frame * 74, moodY + 127, `frame ${frame}`, 10, '#a38f73', 400, 'middle');
    }
  }
  y += 208;

  text(margin, y + 16, '05 / CRISP AT EVERY SIZE', 15, '#785f40', 700);
  text(margin + 320, y + 16, 'Same64px source · nearest-neighbor scaling · no smoothing', 13);
  const scaleY = y + 32;
  for (const [index, size] of [64, 192, 256].entries()) {
    const left = margin + index * 310;
    card(left, scaleY, 294, 311);
    overlays.push({ input: await spritePng(['shiba', 'idle', 0, 'original', 'original', 'none', true], size), left: left + Math.round((294 - size) / 2), top: scaleY + 12 + Math.round((256 - size) / 2) });
    text(left + 147, scaleY + 288, `${size}px / ${size === 64 ? 'native' : `${size / 64}x nearest`}`, 14, '#765f43', 600, 'middle');
  }
  const infoLeft = margin + 930, infoWidth = width - infoLeft - margin;
  card(infoLeft, scaleY, infoWidth, 311);
  text(infoLeft + 26, scaleY + 38, 'RENDERING CHECKS', 14, '#785f40', 700);
  const lines = [
    'Real PuppySprite palette resolution',
    'Real PixelDog silhouette and face geometry',
    '7 breeds · 3 appearances · 10 moods · 2 frames',
    'Samoyed uses its desktop-only silhouette',
    diagnostic ? `Shared overlays: ${diagnostic.checked - diagnostic.mismatches}/${diagnostic.checked} comparisons match` : 'Shared overlay diagnostic skipped (--quick)',
    diagnostic ? `Non-opaque overlay pixels: ${diagnostic.nonOpaqueOverlayPixels}` : 'Run without --quick before the final export',
    'Details: local-assets/desktop/build/rounded-preview.json',
    'Production exports and manifests untouched',
  ];
  lines.forEach((line, index) => text(infoLeft + 26, scaleY + 77 + index * 27, line, 13, index === 4 && diagnostic?.mismatches ? '#ba6451' : '#8b785b'));
  const height = scaleY + 335;
  const background = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#f6f1e6"/><g font-family="Arial, sans-serif">${labels.join('')}</g></svg>`;
  const output = path.join(out, 'rounded-preview.png');
  await sharp(Buffer.from(background)).composite(overlays).png().toFile(output);
  const compact = await renderCompactGallery(out);
  const manifest = {
    sourceHash, source: ['frontend/src/components/pixel-dog.tsx', 'frontend/src/components/puppy-sprite.tsx'],
    breeds, moods, appearances: looks, sizes: [64, 192, 256], width, height,
    overlays: diagnostic, elapsedMs: Date.now() - started,
    compact: { file: 'rounded-puppies.png', width: compact.width, height: compact.height, labels: koreanBreedNames },
    published: args.has('--publish-preview'),
  };
  fs.writeFileSync(path.join(out, 'rounded-preview.json'), JSON.stringify(manifest, null, 2));
  if (args.has('--publish-preview')) {
    const publicPath = path.join(root, 'local-assets/site/images/puppy-style-preview.png');
    fs.mkdirSync(path.dirname(publicPath), { recursive: true });
    fs.copyFileSync(compact.output, publicPath);
    console.log(`Published reviewed preview: ${publicPath}`);
  }
  console.log(`Preview ready: ${output} (${width}×${height}; ${Date.now() - started}ms)`);
  console.log(`Compact preview ready: ${compact.output} (${compact.width}×${compact.height})`);
  if (diagnostic) console.log(`Shared-overlay diagnostic: ${diagnostic.checked - diagnostic.mismatches}/${diagnostic.checked} match; ${diagnostic.nonOpaqueOverlayPixels} non-opaque changed pixels. Details in rounded-preview.json.`);
  if (args.has('--strict') && diagnostic && (diagnostic.mismatches || diagnostic.nonOpaqueOverlayPixels)) process.exitCode = 1;
}

main().catch(error => { console.error(error); process.exitCode = 1; });
