'use strict';
const fs = require('node:fs'), path = require('node:path'), { createRequire } = require('node:module');
const { loadFrontend } = require('./frontend-loader.cjs');
const root = path.resolve(__dirname, '..'), requireFrontend = createRequire(path.join(root, 'frontend/package.json'));
const sharp = requireFrontend('sharp'), React = requireFrontend('react'), { renderToStaticMarkup } = requireFrontend('react-dom/server');
const catalog = loadFrontend('src/lib/sp-scene-styles.ts');
const anchorsPath = path.join(root, 'local-assets/work/sp-scenes-v1/reaction-anchors.json');
const anchors = fs.existsSync(anchorsPath) ? JSON.parse(fs.readFileSync(anchorsPath, 'utf8')) : {};
const enhanced = { ...catalog, spSceneAsset: (style, breed) => {
  const asset = catalog.spSceneAsset(style, breed); if (!asset) return;
  const points = anchors[`${asset.style}/${breed}`];
  return { ...asset, reactions: points && points.width === asset.width && points.height === asset.height ? { eyes: points.eyes, paws: points.paws } : asset.reactions };
} };
const { SpScenePixelDog } = loadFrontend('src/components/sp-scene-pixel-dog.tsx', { '../lib/sp-scene-styles': enhanced });
const out = path.join(root, 'local-assets/work/sp-scenes-v1/anchor-review'); fs.mkdirSync(out, { recursive: true });
const scenes = ['idle', 'side', 'happy', 'sleep', 'walk', 'wag'];
(async () => {
  for (const family of ['sp08', 'sp15']) {
    const breed = process.argv[2] || 'pomeranian', asset = enhanced.spSceneAsset(`${family}-scenes`, breed);
    if (!asset) continue;
    const composite = [], cell = 240, rowHeight = 270;
    for (let row = 0; row < 3; row++) for (let column = 0; column < 6; column++) {
      const accessory = ['ribbon', 'scarf', 'crown'][row], scene = scenes[column];
      let svg = renderToStaticMarkup(React.createElement(SpScenePixelDog, { styleId: `${family}-scenes`, breed, mood: 'idle', scene, accessory, paused: true, groundShadow: false }));
      svg = svg.replace(/href="([^"]*\/images\/[^"?]+\.png)"/g, (_, url) => {
        const imagePath = url.slice(url.indexOf('/images/'));
        return `href="data:image/png;base64,${fs.readFileSync(path.join(root, 'local-assets/site', imagePath)).toString('base64')}"`;
      }).replace('<svg ', `<svg width="${asset.width}" height="${asset.height}" `);
      const image = await sharp(Buffer.from(svg)).resize({ width: 232, height: 238, fit: 'inside', kernel: 'nearest' }).png().toBuffer({ resolveWithObject: true });
      const label = Buffer.from(`<svg width="240" height="28" xmlns="http://www.w3.org/2000/svg"><text x="6" y="20" fill="#ffffff" font-size="14" font-family="Arial">${scene} / ${accessory}</text></svg>`);
      composite.push({ input: label, left: column * cell, top: row * rowHeight }, { input: image.data, left: column * cell + Math.floor((cell - image.info.width) / 2), top: row * rowHeight + 30 });
    }
    const file = path.join(out, `${family}-${breed}-accessories.png`);
    await sharp({ create: { width: cell * 6, height: rowHeight * 3, channels: 4, background: '#202229' } }).composite(composite).png().toFile(file);
    console.log(file);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
