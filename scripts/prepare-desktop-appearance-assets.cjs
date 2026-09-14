'use strict';
// Fingerprint the exact public PNG bytes; the Windows client validates these before replacing its last valid look.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { loadFrontend } = require('./frontend-loader.cjs');
const root = path.resolve(__dirname, '..');
const { art16SceneAssets } = loadFrontend('src/lib/art16-scene-styles.ts');
const { originalArtDogAssets } = loadFrontend('src/lib/original-art-dog-styles.ts');
const { premiumDogAssets } = loadFrontend('src/lib/premium-dog-styles.ts');
const { spSceneAssets, spScenesReady } = loadFrontend('src/lib/sp-scene-styles.ts');
const { rubyRoundAssets, rubyRoundReady, rubyRoundScenes } = loadFrontend('src/lib/ruby-round-scene-styles.ts');
const readySpAssets = spSceneAssets.filter(asset => spScenesReady(asset.style));
const readyRubyAssets = rubyRoundReady ? rubyRoundAssets : [];
const images = [
  ...originalArtDogAssets.map(asset => ({ png: asset.png, width: asset.width, height: asset.height })),
  ...premiumDogAssets.map(asset => ({ png: asset.png, width: asset.width, height: asset.height })),
  ...art16SceneAssets.flatMap(asset => Object.values(asset.scenes).map(scene => ({ png: scene.png, width: asset.width * scene.frames, height: asset.height }))),
  ...readySpAssets.flatMap(asset => Object.values(asset.scenes).map(scene => ({ png: scene.png, width: asset.width * scene.frames, height: asset.height }))),
  ...readyRubyAssets.flatMap(asset => rubyRoundScenes.map(({ id }) => {
    const scene = asset.scenes[id];
    assert.ok(scene.desktopPng && scene.desktopFrames, 'Ruby Round requires eye-composited desktop assets.');
    return { png: scene.desktopPng, width: asset.width * scene.desktopFrames, height: asset.height };
  })),
];
assert.equal(images.length, 192 + readySpAssets.length * 6 + readyRubyAssets.length * 5, 'Require all existing images and each completed scene family.');
const entries = {};
for (const image of images) {
  const bytes = fs.readFileSync(path.join(root, 'local-assets/site', image.png));
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', image.png + ': PNG signature');
  assert.equal(bytes.readUInt32BE(16), image.width, image.png + ': original width');
  assert.equal(bytes.readUInt32BE(20), image.height, image.png + ': original height');
  assert.equal(bytes[24], 8, image.png + ': 8 bits per channel');
  assert.equal(bytes[25], 6, image.png + ': full RGBA');
  assert.ok(!entries[image.png], 'Unique asset paths');
  entries[image.png] = { sha256: createHash('sha256').update(bytes).digest('hex'), width: image.width, height: image.height, bytes: bytes.length };
}
const target = path.join(root, 'frontend/src/lib/generated/desktop-appearance-assets.json');
const output = JSON.stringify(entries, null, 2) + '\n';
if (process.argv.includes('--check')) assert.equal(fs.readFileSync(target, 'utf8'), output, 'Desktop appearance fingerprints must match deployed source PNGs.');
else fs.writeFileSync(target, output);
console.log(`PASS: ${images.length} full-resolution RGBA PNG fingerprints ${process.argv.includes('--check') ? 'verified' : 'prepared'}.`);
