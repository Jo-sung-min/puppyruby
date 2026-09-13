'use strict';
// Read-only native-art contact sheets for reviewing eyes, paws, and accessory attachment points.
const fs = require('node:fs'), path = require('node:path'), { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..'), frontendRequire = createRequire(path.join(root, 'frontend/package.json'));
const sharp = frontendRequire('sharp');
const assets = JSON.parse(fs.readFileSync(path.join(root, 'frontend/src/lib/generated/sp-scene-assets.json'), 'utf8'));
const anchorPath = path.join(root, 'local-assets/work/sp-scenes-v1/reaction-anchors.json');
const anchors = fs.existsSync(anchorPath) ? JSON.parse(fs.readFileSync(anchorPath, 'utf8')) : {};
const out = path.join(root, 'local-assets/work/sp-scenes-v1/anchor-review'); fs.mkdirSync(out, { recursive: true });

(async () => {
  const filter = process.argv[2];
  for (const style of ['sp08', 'sp15']) {
    const selected = assets.filter(asset => asset.style === style && (!filter || asset.breed === filter));
    if (!selected.length) continue;
    const composite = [], cell = 300, row = 325;
    for (let n = 0; n < selected.length; n++) {
      const asset = selected[n], key = `${style}/${asset.breed}`, a = anchors[key];
      const svg = `<svg width="${asset.width}" height="${asset.height}" xmlns="http://www.w3.org/2000/svg">${a ? [...a.eyes, ...a.paws].map((point, index) => `<ellipse cx="${point.x}" cy="${point.y}" rx="${point.rx}" ry="${point.ry}" fill="none" stroke="${index < 2 ? '#00eeaa' : '#00baff'}" stroke-width="1"/><text x="${point.x + point.rx}" y="${point.y}" fill="#ffffff" font-size="10">${point.x},${point.y}</text>`).join('') : ''}</svg>`;
      const marked = await sharp(path.join(root, 'local-assets/site', asset.scenes.idle.png)).composite([{ input: Buffer.from(svg) }]).png().toBuffer();
      const image = await sharp(marked).resize({ width: 280, height: 290, fit: 'inside', kernel: 'nearest' }).png().toBuffer({ resolveWithObject: true });
      const left = n % 5 * cell, top = Math.floor(n / 5) * row;
      const label = Buffer.from(`<svg width="300" height="28" xmlns="http://www.w3.org/2000/svg"><text x="6" y="20" fill="#ffffff" font-size="14" font-family="Arial">${n + 1}. ${asset.breed} ${asset.width}x${asset.height}</text></svg>`);
      composite.push({ input: label, left, top }, { input: image.data, left: left + Math.floor((cell - image.info.width) / 2), top: top + 30 });
    }
    const file = path.join(out, `${style}-${filter || 'all'}-idle.png`);
    await sharp({ create: { width: 5 * cell, height: Math.ceil(selected.length / 5) * row, channels: 4, background: '#202229' } }).composite(composite).png().toFile(file);
    console.log(file);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
