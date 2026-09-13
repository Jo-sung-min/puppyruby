'use strict';
// Local-only checks: no server requests or changes to the administrator's saved appearance.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..'), req = createRequire(path.join(root, 'frontend/package.json'));
const React = req('react'), { renderToStaticMarkup } = req('react-dom/server'), sharp = req('sharp');
const { loadFrontend } = require('./frontend-loader.cjs');
const { originalArtDogStyleIds, originalArtDogCatalog, originalArtDogAssets, originalArtDogStyles, isOriginalArtDogStyleId, parseOriginalArtDogAssets } = loadFrontend('src/lib/original-art-dog-styles.ts');
const { pixelArtCandidates } = loadFrontend('src/lib/pixel-art-candidates.ts');
const { art16SceneStyleId, art16SceneStyles, art16ScenesReady } = loadFrontend('src/lib/art16-scene-styles.ts');
const { PixelDog } = loadFrontend('src/components/pixel-dog.tsx');
const { dogStyles, pixelDogStyles, styleBreedIds, activeDogStyles, defaultAppearance, resolveDogStyle } = loadFrontend('src/lib/dog-styles.ts');
const { spSceneStyles, isSpSceneStyleId, spScenesReady, spSceneFamily } = loadFrontend('src/lib/sp-scene-styles.ts');
const { parseAppearance } = loadFrontend('src/lib/dog-appearance.ts');
let checks = 0;
function check(value, message) { assert.ok(value, message); checks++; }
const markup = props => renderToStaticMarkup(React.createElement(PixelDog, { groundShadow: false, ...props }));
const artwork = svg => svg.match(/<image\b[^>]*data-original-art="true"[^>]*>/)?.[0];
const native = (svg, buffer, asset) => svg.replace('<svg ', `<svg xmlns="http://www.w3.org/2000/svg" width="${asset.width}" height="${asset.height}" `)
  .replace(/href="[^"]+"/, `href="data:image/png;base64,${buffer.toString('base64')}"`);

(async () => {
  check(originalArtDogCatalog.length === 30 && originalArtDogStyles.length === 30 && originalArtDogAssets.length === 30, 'All 30 completed artwork/editable pairs are applicable');
  check(pixelDogStyles.length === 109 + art16SceneStyles.length + spSceneStyles.length && dogStyles.length === 110 + art16SceneStyles.length + spSceneStyles.length, 'All prior styles remain registered alongside completed breed scenes');
  check(new Set(dogStyles.map(style => style.id)).size === dogStyles.length, 'Style IDs remain unique');
  check(JSON.stringify(originalArtDogStyles.map(style => style.id)) === JSON.stringify(originalArtDogStyleIds), 'Original candidate numbering remains stable');
  const backend = fs.readFileSync(path.join(root, 'backend/src/main/java/com/puppyruby/appearance/AppearanceService.java'), 'utf8');
  const javaList = [...backend.match(/public static final List<String> STYLES = List\.of\(([\s\S]*?)\);/)[1].matchAll(/"([^"\\]+)"/g)].map(match => match[1]);
  check(JSON.stringify(dogStyles.map(style => style.id)) === JSON.stringify(javaList.filter(id => (art16ScenesReady || id !== art16SceneStyleId) && (!isSpSceneStyleId(id) || spScenesReady(spSceneFamily(id))))), 'Frontend and backend retain ordered style IDs; unfinished scenes stay unavailable');
  for (const bad of [null, 1, {}, '', 'art-00', 'art-31', 'art-1', 'ART-01', 'art-01 ', '__proto__']) check(!isOriginalArtDogStyleId(bad), 'Only the finite 30 original IDs are accepted');
  const first = originalArtDogAssets[0];
  for (const bad of [null, {}, [{ ...first, id: 'art-31' }], [{ ...first, width: 64 }], [{ ...first, height: Infinity }], [{ ...first, width: 1024.5 }], [{ ...first, png: '/images/other.png' }], [{ ...first, aseprite: 'https://other.invalid/file' }]]) check(parseOriginalArtDogAssets(bad).length === 0, 'Malformed or mismatched assets cannot create an applicable choice');
  check(parseOriginalArtDogAssets([first, first]).length === 1, 'Duplicate asset records cannot create duplicate cards');
  const available = activeDogStyles(defaultAppearance);
  check(originalArtDogStyleIds.every(id => available.some(style => style.id === id)), 'All 30 original-art styles appear in the unified choices');
  check(available.some(style => style.id === 'classic') && available.some(style => style.id === 'animated-2d'), 'Procedural and animated choices share the same list');
  const deleted = ['round', 'plush', 'cozy-slim', 'premium-milkbean'];
  const before = { ...defaultAppearance, defaultStyle: 'soft', breedStyles: { poodle: 'mini' }, deletedStyles: deleted, revision: 7, updatedAt: 123 };
  check(JSON.stringify(parseAppearance(before)) === JSON.stringify(before), 'Installing art preserves saved choices, deletions, revision and timestamp');

  for (const style of originalArtDogStyles) {
    const candidate = pixelArtCandidates.find(item => item.id === style.id), asset = originalArtDogAssets.find(item => item.id === style.id);
    check(style.name === candidate.name && style.description === candidate.direction, `${style.id} preserves the familiar candidate identity`);
    const buffer = fs.readFileSync(path.join(root, 'local-assets/site', asset.png));
    const source = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    check(source.info.width === asset.width && source.info.height === asset.height && asset.width === candidate.width && asset.height === candidate.height, `${style.id} uses the original unscaled resolution`);
    let transparent = 0, opaque = 0;
    for (let i = 3; i < source.data.length; i += 4) { if (source.data[i] === 0) transparent++; else if (source.data[i] === 255) opaque++; }
    check(transparent > 0 && opaque > 0, `${style.id} contains visible artwork and an actual transparent background`);
    const aseprite = fs.readFileSync(path.join(root, 'local-assets/site', asset.aseprite));
    check(aseprite.readUInt16LE(4) === 0xa5e0 && aseprite.readUInt16LE(8) === asset.width && aseprite.readUInt16LE(10) === asset.height && aseprite.readUInt16LE(12) === 32, `${style.id} editable Aseprite has matching full RGBA dimensions`);
    const plain = markup({ styleId: style.id }), original = artwork(plain);
    check(original?.includes(asset.png) && original.includes('image-rendering:pixelated'), `${style.id} actual pet renderer directly loads the full PNG`);
    check(!/NaN|Infinity|<filter\b/.test(plain), `${style.id} no color filter or invalid transform is introduced`);
    const rendered = await sharp(Buffer.from(native(plain, buffer, asset))).ensureAlpha().raw().toBuffer();
    let changed = 0;
    for (let i = 0; i < source.data.length; i += 4) {
      const alpha = source.data[i + 3];
      if (rendered[i + 3] !== alpha) changed++;
      for (let channel = 0; channel < 3; channel++) {
        const delta = Math.abs(rendered[i + channel] - source.data[i + channel]);
        if ((alpha === 255 && delta !== 0) || (alpha > 0 && alpha < 255 && delta > 1)) changed++;
      }
    }
    check(changed === 0, `${style.id} native-size display preserves master alpha and opaque RGB exactly, with only compositor rounding for translucent pixels`);
    for (const breed of ['pomeranian', 'poodle', 'dalmatian']) check(markup({ styleId: style.id, breed, fur: '#ff00ff', eyes: '#00ff00', variant: { shape: 'fox', pattern: 'patches', coatColor: '#11aa99', patternColor: '#000000' } }) === plain, `${style.id}/${breed} breed and wardrobe palettes do not recolor the master`);
    for (const mood of ['idle', 'love', 'eat', 'play', 'sleep', 'typing', 'excited', 'scroll', 'drag', 'walk']) {
      const pose = markup({ styleId: style.id, mood, frame: 1, look: -1 });
      check(pose.includes(`pixel-${mood}`) && artwork(pose) === original, `${style.id}/${mood} reaction retains the master image`);
    }
    for (const accessory of ['ribbon', 'scarf', 'crown', 'bow-blue', 'bow-lilac', 'party-hat', 'flower', 'glasses', 'halo', 'angel-wings']) {
      const decorated = markup({ styleId: style.id, accessory });
      check(decorated.includes(`data-cosmetic="${accessory}"`) && artwork(decorated) === original, `${style.id}/${accessory} is a separate cosmetic layer`);
      if (style.id === 'art-01') check(!(await sharp(Buffer.from(native(decorated, buffer, asset))).ensureAlpha().raw().toBuffer()).equals(rendered), `${accessory} adds visible pixels`);
    }
    check(markup({ styleId: style.id, mood: 'walk', frame: 0 }) !== markup({ styleId: style.id, mood: 'walk', frame: 1 }), `${style.id} walking frame still moves the artwork`);
    check(markup({ styleId: style.id, look: 0 }) !== markup({ styleId: style.id, look: 1 }), `${style.id} pointer reaction still moves the artwork`);
    const varietyId = '53e76db0-b99a-4fc3-a37b-7bdde239eb66';
    const draft = parseAppearance({ ...defaultAppearance, defaultStyle: style.id, deletedStyles: deleted, breedStyles: { poodle: style.id },
      varieties: [{ id: varietyId, breed: 'shiba', name: '원본 선택', style: style.id, shape: 'original', pattern: 'solid', coatColor: null, patternColor: '#FFFFFF' }], breedVarieties: { shiba: varietyId } });
    for (const breed of styleBreedIds) check(resolveDogStyle(draft, breed) === style.id, `${style.id}/${breed} global, breed and variety selections resolve`);
    const removed = parseAppearance({ ...before, deletedStyles: [...deleted, style.id] });
    check(!activeDogStyles(removed).some(item => item.id === style.id), `${style.id} administrator deletion excludes the style from unified application choices`);
    assert.throws(() => parseAppearance({ ...removed, defaultStyle: style.id })); checks++;
    assert.throws(() => parseAppearance({ ...removed, breedStyles: { poodle: style.id } })); checks++;
    assert.throws(() => parseAppearance({ ...draft, defaultStyle: 'classic', breedStyles: {}, deletedStyles: [...deleted, style.id] })); checks++;
  }
  console.log(`PASS ${checks} original-art checks: 30 applicable full-resolution PNG/Aseprite pairs; original RGBA, reactions, cosmetics, unified choices, backend parity and local selection/deletion drafts.`);
})().catch(error => { console.error(error.stack); process.exitCode = 1; });

