'use strict';
// Local-only checks of original RGBA rendering and appearance drafts; never save server settings.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..'), req = createRequire(path.join(root, 'frontend/package.json'));
const React = req('react'), { renderToStaticMarkup } = req('react-dom/server'), sharp = req('sharp');
const { loadFrontend } = require('./frontend-loader.cjs');
const { premiumDogCatalog, premiumDogAssets, premiumDogStyles, parsePremiumDogAssets } = loadFrontend('src/lib/premium-dog-styles.ts');
const { originalArtDogStyles } = loadFrontend('src/lib/original-art-dog-styles.ts');
const { art16SceneStyles } = loadFrontend('src/lib/art16-scene-styles.ts');
const { PixelDog } = loadFrontend('src/components/pixel-dog.tsx');
const { dogStyles, pixelDogStyles, styleBreedIds, activeDogStyles, defaultAppearance, resolveDogStyle } = loadFrontend('src/lib/dog-styles.ts');
const { spSceneStyles, isSpSceneStyleId, spScenesReady, spSceneFamily } = loadFrontend('src/lib/sp-scene-styles.ts');
const { parseAppearance } = loadFrontend('src/lib/dog-appearance.ts');
let checks = 0;
function check(value, message) { assert.ok(value, message); checks++; }
const markup = props => renderToStaticMarkup(React.createElement(PixelDog, { groundShadow: false, ...props }));
const artwork = svg => svg.match(/<image\b[^>]*data-original-art="true"[^>]*>/)?.[0];

(async () => {
  check(premiumDogCatalog.length === 12, 'Twelve distinct named premium directions');
  check(premiumDogStyles.length > 0, 'At least one real completed asset is present');
  if (!process.argv.includes('--partial')) check(premiumDogStyles.length === 12, 'All twelve PNG/Aseprite pairs are complete');
  check(pixelDogStyles.length === 67 + premiumDogStyles.length + originalArtDogStyles.length + art16SceneStyles.length + spSceneStyles.length && dogStyles.length === pixelDogStyles.length + 1, 'Original catalog stays intact');
  check(premiumDogStyles.every(style => activeDogStyles(defaultAppearance).some(choice => choice.id === style.id)), 'All premium styles remain in the unified administrator choices');
  check(activeDogStyles(defaultAppearance).some(style => style.id === 'cozy-chubby'), 'Existing face/body choices remain available alongside premium art');
  for (const bad of [null, {}, [{ id: 'premium-marshmallow', width: 64, height: 64 }], [{ id: 'unknown', width: 1024, height: 1024 }]]) check(parsePremiumDogAssets(bad).length === 0, 'Invalid or undersized records never create broken choices');
  const deleted = ['round', 'plush', 'cozy-slim'];
  const preserved = parseAppearance({ ...defaultAppearance, deletedStyles: deleted });
  check(JSON.stringify(preserved.deletedStyles) === JSON.stringify(deleted), 'User deletions are retained when new art is installed');

  for (const style of premiumDogStyles) {
    const asset = premiumDogAssets.find(item => item.id === style.id), pngPath = path.join(root, 'local-assets/site', asset.png);
    const buffer = fs.readFileSync(pngPath), source = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    check(source.info.width === asset.width && source.info.height === asset.height && asset.width >= 256, `${style.id} UI metadata uses real master dimensions`);
    const aseprite = fs.readFileSync(path.join(root, 'local-assets/site', asset.aseprite));
    check(aseprite.readUInt16LE(4) === 0xa5e0 && aseprite.readUInt16LE(8) === asset.width && aseprite.readUInt16LE(10) === asset.height && aseprite.readUInt16LE(12) === 32, `${style.id} editable file keeps full RGBA resolution`);
    const plain = markup({ styleId: style.id }), original = artwork(plain);
    check(original && original.includes(asset.png) && original.includes('image-rendering:pixelated'), `${style.id} actual renderer loads the master directly`);
    check(!/NaN|Infinity|<filter\b/.test(plain), `${style.id} no invalid coordinates or color filters`);
    // Embed the same PNG bytes for the offline SVG rasterizer. Browser href is checked above.
    const standalone = plain.replace('<svg ', `<svg xmlns="http://www.w3.org/2000/svg" width="${asset.width}" height="${asset.height}" `)
      .replace(/href="[^"]+"/, `href="data:image/png;base64,${buffer.toString('base64')}"`);
    const rendered = await sharp(Buffer.from(standalone)).ensureAlpha().raw().toBuffer();
    let changedAlpha = 0, changedOpaque = 0, changedTranslucent = 0;
    for (let i = 0; i < source.data.length; i += 4) {
      const alpha = source.data[i + 3];
      if (rendered[i + 3] !== alpha) changedAlpha++;
      for (let channel = 0; channel < 3; channel++) {
        const delta = Math.abs(rendered[i + channel] - source.data[i + channel]);
        if (alpha === 255 && delta !== 0) changedOpaque++;
        // SVG's premultiplied-alpha rasterizer can round a translucent RGB channel by one level.
        if (alpha > 0 && alpha < 255 && delta > 1) changedTranslucent++;
      }
    }
    check(changedAlpha === 0 && changedOpaque === 0 && changedTranslucent === 0, `${style.id} native render preserves master alpha/opaque RGB exactly and translucent RGB within compositor rounding`);
    for (const breed of styleBreedIds) check(markup({ styleId: style.id, breed, fur: '#ff00ff', eyes: '#00ff00', variant: { shape: 'fox', pattern: 'patches', coatColor: '#11aa99', patternColor: '#000000' } }) === plain, `${style.id}/${breed} automatic palette, eyes, shape and markings cannot overwrite art`);
    for (const mood of ['idle', 'love', 'eat', 'play', 'sleep', 'typing', 'excited', 'scroll', 'drag', 'walk']) {
      const pose = markup({ styleId: style.id, mood, frame: 1, look: 1 });
      check(pose.includes(`pixel-${mood}`) && artwork(pose) === original, `${style.id}/${mood} reaction keeps original artwork`);
    }
    for (const accessory of ['ribbon', 'scarf', 'crown', 'bow-blue', 'bow-lilac', 'party-hat', 'flower', 'glasses', 'halo', 'angel-wings']) {
      const decorated = markup({ styleId: style.id, accessory });
      check(decorated.includes(`data-cosmetic="${accessory}"`) && artwork(decorated) === original, `${style.id}/${accessory} optional cosmetic is a separate overlay`);
      if (style.id === 'premium-marshmallow') {
        const decoratedStandalone = decorated.replace('<svg ', `<svg xmlns="http://www.w3.org/2000/svg" width="${asset.width}" height="${asset.height}" `)
          .replace(/href="[^"]+"/, `href="data:image/png;base64,${buffer.toString('base64')}"`);
        const decoratedPixels = await sharp(Buffer.from(decoratedStandalone)).ensureAlpha().raw().toBuffer();
        check(!decoratedPixels.equals(rendered), `${accessory} actually adds visible pixels beside or over the master`);
      }
    }
    check(markup({ styleId: style.id, mood: 'walk', frame: 0 }) !== markup({ styleId: style.id, mood: 'walk', frame: 1 }), `${style.id} walk frames move the full artwork`);
    check(markup({ styleId: style.id, look: 0 }) !== markup({ styleId: style.id, look: 1 }), `${style.id} pointer response moves the full artwork`);
    const varietyId = '53e76db0-b99a-4fc3-a37b-7bdde239eb66';
    const draft = parseAppearance({ ...defaultAppearance, defaultStyle: style.id, deletedStyles: deleted, breedStyles: { poodle: style.id },
      varieties: [{ id: varietyId, breed: 'shiba', name: '내가 고른 원본', style: style.id, shape: 'original', pattern: 'solid', coatColor: null, patternColor: '#FFFFFF' }], breedVarieties: { shiba: varietyId } });
    for (const breed of ['pomeranian', 'poodle', 'shiba']) check(resolveDogStyle(draft, breed) === style.id, `${style.id} global/breed/variety drafts resolve`);
    check(!activeDogStyles(parseAppearance({ ...preserved, deletedStyles: [...deleted, style.id] })).some(item => item.id === style.id), `${style.id} administrator can remove the new choice`);
  }
  console.log(`PASS ${checks} premium checks: ${premiumDogStyles.length} full-resolution RGBA masters, original colors, 30 breeds, reactions, cosmetics, draft selection and deletion.`);
})().catch(error => { console.error(error.stack); process.exitCode = 1; });

