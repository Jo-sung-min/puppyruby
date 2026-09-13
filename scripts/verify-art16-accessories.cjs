'use strict';
// Exercise the real renderer with the shipped PNGs embedded, so an empty image
// element or an off-screen decoration cannot pass as a visible accessory.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const { loadFrontend } = require('./frontend-loader.cjs');
const root = path.resolve(__dirname, '..');
const frontend = createRequire(path.join(root, 'frontend/package.json'));
const React = frontend('react');
const { renderToStaticMarkup } = frontend('react-dom/server');
const sharp = frontend('sharp');
const { PixelDog } = loadFrontend('src/components/pixel-dog.tsx');
const { Art16DogAccessories } = loadFrontend('src/components/art16-dog-accessories.tsx');
const { art16SceneAssets, art16SceneStyleId } = loadFrontend('src/lib/art16-scene-styles.ts');
const { accessories } = loadFrontend('src/lib/game.ts');
const { paidAccessories } = loadFrontend('src/lib/cosmetics.ts');
const items = [...accessories.filter(item => item.id !== 'none'), ...paidAccessories];
const imageCache = new Map();
const out = path.join(root, 'local-assets/work/accessory-audit');
assert.ok(process.argv.slice(2).every(arg => arg === '--scene=walk'), 'Supported option: --scene=walk');
const walkOnly = process.argv.includes('--scene=walk');
const sceneIds = walkOnly ? ['walk'] : ['idle', 'side', 'happy', 'sleep', 'walk'];
const outputName = `art16-accessories${walkOnly ? '-walk' : ''}`;
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const digest = data => crypto.createHash('sha256').update(data).digest('hex');

function embedImages(markup) {
  return markup.replace(/href="([^"]+\.png)"/g, (_, uri) => {
    const index = uri.indexOf('/images/art16-scenes-v1/');
    check(index >= 0, 'Every embedded artwork comes from the shipped art16 scene collection');
    const relative = uri.slice(index);
    if (!imageCache.has(relative)) {
      const filename = path.resolve(root, 'local-assets/site', `.${relative}`);
      assert.ok(filename.startsWith(path.join(root, 'local-assets/site/images/art16-scenes-v1') + path.sep));
      imageCache.set(relative, `data:image/png;base64,${fs.readFileSync(filename).toString('base64')}`);
    }
    return `href="${imageCache.get(relative)}"`;
  });
}

function markup(asset, scene, frame, accessory) {
  return renderToStaticMarkup(React.createElement(PixelDog, {
    breed: asset.breed, styleId: art16SceneStyleId, scene, frame,
    mood: 'idle', paused: true, decorative: true, groundShadow: false,
    ...(accessory === undefined ? {} : { accessory }),
  }));
}

async function pixels(svg, asset) {
  const native = embedImages(svg).replace('<svg ', `<svg xmlns="http://www.w3.org/2000/svg" width="${asset.width}" height="${asset.height}" `);
  return sharp(Buffer.from(native)).ensureAlpha().raw().toBuffer();
}

function difference(plain, dressed, asset) {
  let changed = 0, changedDog = 0, dog = 0;
  let left = asset.width, right = -1, top = asset.height, bottom = -1;
  for (let y = 0; y < asset.height; y++) for (let x = 0; x < asset.width; x++) {
    const p = (y * asset.width + x) * 4;
    const onDog = plain[p + 3] > 200;
    if (onDog) dog++;
    // RGB under completely transparent pixels is not visible.
    if ((!plain[p + 3] && !dressed[p + 3]) || (plain[p] === dressed[p] && plain[p + 1] === dressed[p + 1] && plain[p + 2] === dressed[p + 2] && plain[p + 3] === dressed[p + 3])) continue;
    changed++; if (onDog) changedDog++;
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  return { changed, changedDog, retainedDogFraction: dog ? (dog - changedDog) / dog : 0, bounds: { left, top, right, bottom } };
}

function bareScene(asset, scene, frame) {
  const sheet = asset.scenes[scene];
  return `<svg viewBox="0 0 ${asset.width} ${asset.height}"><image href="${sheet.png}" x="${-frame * asset.width}" y="0" width="${asset.width * sheet.frames}" height="${asset.height}" preserveAspectRatio="none" /></svg>`;
}

function isolatedWingsFrame(asset, frame) {
  const sheet = asset.scenes.walk;
  return renderToStaticMarkup(React.createElement('svg', { viewBox: `0 0 ${asset.width} ${asset.height}` },
    React.createElement(Art16DogAccessories, { id: 'angel-wings', breed: asset.breed, scene: 'walk', width: asset.width, height: asset.height, frame, behind: true }),
    React.createElement('image', { href: sheet.png, x: -frame * asset.width, y: 0,
      width: asset.width * sheet.frames, height: asset.height, preserveAspectRatio: 'none' }),
  ));
}

const previewRows = [
  ['pomeranian', 'idle', 0], ['beagle', 'happy', 0], ['dachshund', 'side', 0],
  ['poodle', 'sleep', 0], ['samoyed', 'walk', 4],
].filter(([, scene]) => sceneIds.includes(scene));
const previewCells = new Map();
const results = [];

async function saveGallery() {
  const cellW = 154, cellH = 184, top = 44;
  const width = cellW * (items.length + 1), height = top + cellH * previewRows.length;
  const composites = [];
  let labels = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="#171b23"/><text x="15" y="27" fill="#fff" font-family="Arial" font-size="18">Art16 accessories · native artwork · every scene/frame tested</text>`;
  for (let row = 0; row < previewRows.length; row++) {
    const [breed, scene] = previewRows[row];
    for (let column = 0; column <= items.length; column++) {
      const item = column ? items[column - 1].id : 'none';
      const key = `${breed}/${scene}/${item}`;
      assert.ok(previewCells.has(key), `Missing visual audit cell ${key}`);
      composites.push({ input: previewCells.get(key), left: column * cellW + 9, top: top + row * cellH });
      labels += `<text x="${column * cellW + cellW / 2}" y="${top + row * cellH + 152}" text-anchor="middle" fill="#f2f2f4" font-family="Arial" font-size="11">${item}</text>`;
      labels += `<text x="${column * cellW + cellW / 2}" y="${top + row * cellH + 170}" text-anchor="middle" fill="#b9c0cf" font-family="Arial" font-size="10">${breed} · ${scene}</text>`;
    }
  }
  labels += '</svg>';
  await sharp(Buffer.from(labels)).composite(composites).png().toFile(path.join(out, `${outputName}.png`));
}

(async () => {
  check(art16SceneAssets.length === 30, 'All 30 registered breeds have scene assets');
  check(items.length === 10 && new Set(items.map(item => item.id)).size === 10, 'Three base and seven paid accessories are exercised');
  fs.mkdirSync(out, { recursive: true });
  for (const [breedIndex, asset] of art16SceneAssets.entries()) {
    for (const scene of sceneIds) {
      check(asset.scenes[scene].frames === (scene === 'walk' ? 8 : 1), `${asset.breed}/${scene} includes every expected frame`);
      for (let frame = 0; frame < asset.scenes[scene].frames; frame++) {
        const label = `${asset.breed}/${scene}/${frame}`;
        const none = markup(asset, scene, frame, 'none');
        check(!none.includes('data-cosmetic='), `${label} none creates no cosmetic shapes`);
        check(none === markup(asset, scene, frame), `${label} omitted accessory behaves exactly like none`);
        const plain = await pixels(none, asset);
        const original = await pixels(bareScene(asset, scene, frame), asset);
        check(difference(original, plain, asset).changed === 0, `${label} none preserves the original artwork frame exactly`);
        check(plain.some((value, i) => i % 4 === 3 && value > 200), `${label} embeds a visible original dog`);
        const isPreview = previewRows.some(([breed, pose, index]) => breed === asset.breed && pose === scene && index === frame);
        if (isPreview) previewCells.set(`${asset.breed}/${scene}/none`, await sharp(plain, { raw: { width: asset.width, height: asset.height, channels: 4 } }).resize(136, 136, { fit: 'contain', background: '#00000000', kernel: 'nearest' }).png().toBuffer());
        const hashes = new Set([digest(plain)]);
        for (const item of items) {
          const dressedMarkup = markup(asset, scene, frame, item.id);
          check(dressedMarkup.includes(`data-cosmetic="${item.id}"`), `${label}/${item.id} emits its actual decoration`);
          const dressed = await pixels(dressedMarkup, asset);
          const diff = difference(plain, dressed, asset);
          check(diff.changed >= 64, `${label}/${item.id} must visibly change at least 64 native pixels (actual ${diff.changed})`);
          check(diff.retainedDogFraction >= .45, `${label}/${item.id} preserves the recognizable dog artwork`);
          const hash = digest(dressed);
          check(!hashes.has(hash), `${label}/${item.id} has a unique rendered appearance`); hashes.add(hash);
          if (scene === 'walk' && item.id === 'angel-wings') {
            const isolated = await pixels(isolatedWingsFrame(asset, frame), asset);
            check(difference(isolated, dressed, asset).changed === 0, `${label} walking wings must match one isolated frame without neighboring-frame decoration leakage`);
          }
          results.push({ breed: asset.breed, scene, frame, accessory: item.id, ...diff });
          if (isPreview) previewCells.set(`${asset.breed}/${scene}/${item.id}`, await sharp(dressed, { raw: { width: asset.width, height: asset.height, channels: 4 } }).resize(136, 136, { fit: 'contain', background: '#00000000', kernel: 'nearest' }).png().toBuffer());
        }
      }
    }
    if ((breedIndex + 1) % 5 === 0) console.log(`Verified ${breedIndex + 1}/30 breeds, including every walk frame.`);
  }
  await saveGallery();
  const summary = { checks, breeds: art16SceneAssets.length, scenesPerBreed: sceneIds.length, walkFrames: 8, accessories: items.length, rasterComparisons: results.length,
    smallestVisibleChange: Math.min(...results.map(row => row.changed)), minimumOriginalDogRetained: Math.min(...results.map(row => row.retainedDogFraction)) };
  fs.writeFileSync(path.join(out, `${outputName}.json`), JSON.stringify({ ...summary, results }, null, 2) + '\n');
  console.log(`PASS ${checks} art16 accessory checks: 30 breeds, ${sceneIds.length} scenes, all eight walk frames, ten accessories; ${results.length} visible raster comparisons.`);
  console.log(`Visual audit: ${path.join(out, `${outputName}.png`)}`);
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
