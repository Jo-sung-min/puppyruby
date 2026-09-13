'use strict';
// Position existing item artwork using native source-eye components and alpha bounds.
// Contact sheets are produced by inspect-sp-scene-accessories.cjs for visual review.
const fs = require('node:fs'), path = require('node:path'), { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
const sharp = createRequire(path.join(root, 'frontend/package.json'))('sharp');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'frontend/src/lib/generated/sp-scene-assets.json'), 'utf8'));
const result = {}, diagnostics = [];
const indices = { idle: [0], side: [1], happy: [2], sleep: [3], walk: [4, 5, 6, 7, 8, 9, 10, 11], wag: [12, 13, 14, 15] };
for (const asset of manifest) {
  const key = `${asset.style}/${asset.breed}`;
  const proofPath = path.join(root, 'local-assets/work/sp-scenes-v1', asset.style, 'processed', asset.breed, 'conversion.json');
  if (!fs.existsSync(proofPath)) { diagnostics.push(`${key}: processing in progress`); continue; }
  const proof = JSON.parse(fs.readFileSync(proofPath, 'utf8'));
  if (proof.width !== asset.width || proof.height !== asset.height) throw Error(`${key}: native coordinates changed`);
  const scenes = {};
  for (const [scene, frames] of Object.entries(indices)) scenes[scene] = frames.map((index, n) => {
    const bounds = asset.frameBounds[scene][n], detection = proof.eyeDetection?.[index];
    const top = bounds.y + bounds.height * .08;
    const side = scene === 'side' || scene === 'walk';
    let eyes = side ? undefined : detection?.eyes;
    const candidates = Array.isArray(detection?.candidates) ? detection.candidates : detection?.candidates ? [detection.candidates] : [];
    if (!eyes && scene !== 'sleep') {
      const sorted = candidates.filter(item => item.cy < bounds.y + bounds.height * .68
        && item.cy > bounds.y + bounds.height * .18 && item.area / (item.width * item.height) >= .4
        && item.width < item.height * 1.3 && (!side || item.cx < bounds.x + bounds.width * .55)).sort((a, b) => a.cx - b.cx);
      if (side && sorted.length) {
        const item = [...sorted].sort((a, b) => b.area - a.area)[0]; eyes = [{ x: item.cx, y: item.cy, rx: Math.ceil(item.width / 2) + 3, ry: Math.ceil(item.height / 2) + 3 }];
      } else if (sorted.length === 2 && Math.abs(sorted[0].cy - sorted[1].cy) < bounds.height * .12) {
        eyes = sorted.map(item => ({ x: item.cx, y: item.cy, rx: Math.ceil(item.width / 2) + 3, ry: Math.ceil(item.height / 2) + 3 }));
      }
    }
    const eyeY = eyes?.length ? eyes.reduce((sum, eye) => sum + eye.y, 0) / eyes.length : bounds.y + bounds.height * (scene === 'sleep' ? .68 : .4);
    const eyeX = eyes?.length ? eyes.reduce((sum, eye) => sum + eye.x, 0) / eyes.length : bounds.x + bounds.width * .4;
    const foreheadToEye = Math.max(bounds.height * .18, eyeY - top);
    const headX = scene === 'sleep' ? bounds.x + bounds.width * .3 : side && eyes?.length === 1 ? eyeX + foreheadToEye * .35 : eyeX;
    const headHalf = foreheadToEye * (side ? .65 : 1.05);
    const neckX = scene === 'sleep' ? bounds.x + bounds.width * .67 : side ? headX + foreheadToEye * .25 : headX;
    const neckY = scene === 'sleep' ? bounds.y + bounds.height * .68 : eyeY + foreheadToEye * (side ? .43 : .75);
    if (!eyes && scene !== 'sleep') diagnostics.push(`${key}/${scene}/${n}: eye review needed`);
    const sx = 64 / asset.width, sy = 64 / asset.height, round = value => Math.round(value * 100) / 100;
    return { headX: round(headX * sx), eyeY: round(eyeY * sy), top: round(top * sy), neckX: round(neckX * sx), neckY: round(neckY * sy),
      neckAngle: scene === 'sleep' ? 100 : 0, neckScale: scene === 'sleep' ? .8 : 1,
      ribbonX: round((headX + (scene === 'sleep' ? bounds.width * .21 : headHalf * .7)) * sx), ribbonY: round((top + foreheadToEye * .27) * sy),
      ...(eyes?.length ? { eyes: eyes.map(eye => ({ x: round(eye.x * sx), y: round(eye.y * sy), rx: round(eye.rx * sx), ry: round(eye.ry * sy) })) } : {}) };
  });
  result[key] = { width: asset.width, height: asset.height, scenes };
}
(async () => {
  // A partial processing proof must never overwrite the last reviewed placements.
  if (diagnostics.length) throw Error(`${diagnostics.length} accessory placements need eye review; existing metadata retained. First: ${diagnostics[0]}`);
  // Tall ears are not the forehead: sample the actual alpha silhouette above each face.
  for (const asset of manifest) {
    const entry = result[`${asset.style}/${asset.breed}`]; if (!entry) continue;
    for (const [scene, placements] of Object.entries(entry.scenes)) {
      const sheet = await sharp(path.join(root, 'local-assets/site', asset.scenes[scene].png)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      placements.forEach((placement, frame) => {
        const x = Math.round(placement.headX / 64 * asset.width), radius = Math.max(2, Math.round(asset.width * .012));
        const stop = Math.floor(placement.eyeY / 64 * asset.height);
        for (let y = 0; y < stop; y++) {
          let visible = 0;
          for (let dx = -radius; dx <= radius; dx++) {
            const px = x + dx; if (px < 0 || px >= asset.width) continue;
            if (sheet.data[(y * sheet.info.width + frame * asset.width + px) * 4 + 3] > 200) visible++;
          }
          if (visible >= radius + 1) { placement.top = Math.round(y / asset.height * 6400) / 100; break; }
        }
      });
    }
  }
  const target = path.join(root, 'frontend/src/lib/generated/sp-scene-accessory-anchors.json');
  fs.writeFileSync(target + '.tmp', JSON.stringify(result, null, 2) + '\n'); fs.renameSync(target + '.tmp', target);
  fs.writeFileSync(path.join(root, 'local-assets/work/sp-scenes-v1/accessory-anchor-review.json'), JSON.stringify({ sets: Object.keys(result).length, diagnostics }, null, 2) + '\n');
  console.log(JSON.stringify({ sets: Object.keys(result).length, diagnostics }));
})().catch(error => { console.error(error); process.exitCode = 1; });
