const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');

const root = path.resolve(__dirname, '..');
const requireFrontend = createRequire(path.join(root, 'frontend/package.json'));
const sharp = requireFrontend('sharp');
const catalog = require('../frontend/src/lib/generated/ruby-round-scene-assets.json');
const { loadFrontend } = require('../scripts/frontend-loader.cjs');
const { dogBreeds } = loadFrontend('src/lib/dog-breeds.ts');
// Keep the shipping resources in a dedicated directory. The old exporter
// produced thousands of legacy sprites in build/assets; using a separate,
// exact directory prevents a stale file from silently entering PuppyRuby.exe.
const output = path.join(root, 'local-assets/desktop/build/ruby-assets');
const sourceRoot = path.join(root, 'local-assets/site');
const scenes = ['idle', 'side', 'walk', 'happy', 'sleep'];

fs.mkdirSync(output, { recursive: true });

function sourceFile(publicPath) {
  assert.match(publicPath, /^\/images\/ruby-round-v1\/[a-z]+\/[a-z]+-desktop\.png$/);
  return path.join(sourceRoot, publicPath.replace(/^\/+/, ''));
}

async function main() {
  const breedIds = dogBreeds.map(({ id }) => id);
  assert.equal(catalog.length, 30, 'Ruby Dot release must contain all 30 breeds');
  assert.deepEqual(catalog.map(({ breed }) => breed), breedIds, 'Ruby Dot breed order must match the persisted desktop catalog');

  const bundled = { version: 1, styleId: 'ruby-round-scenes', styleName: '루비 도트 · 다섯 동작', breeds: [] };
  const expected = new Set();
  for (const asset of catalog) {
    assert.ok(Number.isInteger(asset.width) && asset.width > 0 && Number.isInteger(asset.height) && asset.height > 0, `${asset.breed}: invalid canvas`);
    const reactionEyes = asset.scenes?.idle?.eyes?.[0]?.map(anchor => ({ ...anchor }));
    assert.equal(reactionEyes?.length, 2, `${asset.breed}: idle reaction eyes are required`);
    const breed = { breed: asset.breed, width: asset.width, height: asset.height, reactionEyes, scenes: {} };
    for (const name of scenes) {
      const spec = asset.scenes?.[name];
      assert.ok(spec, `${asset.breed}: missing ${name}`);
      const frames = spec.desktopFrames;
      assert.ok(Number.isInteger(frames) && frames >= 1 && frames <= 8, `${asset.breed}/${name}: invalid desktop frame count`);
      assert.ok(Number.isInteger(spec.frameMs) && spec.frameMs >= 50 && spec.frameMs <= 2000, `${asset.breed}/${name}: invalid timing`);
      const source = sourceFile(spec.desktopPng);
      assert.ok(fs.existsSync(source), `${asset.breed}/${name}: missing ${source}`);
      const metadata = await sharp(source).metadata();
      assert.equal(metadata.format, 'png', `${asset.breed}/${name}: must be PNG`);
      assert.equal(metadata.width, asset.width * frames, `${asset.breed}/${name}: invalid sheet width`);
      assert.equal(metadata.height, asset.height, `${asset.breed}/${name}: invalid sheet height`);
      assert.ok(metadata.hasAlpha, `${asset.breed}/${name}: transparent canvas is required`);
      const resource = `ruby-default-${asset.breed}-${name}.rubypng`;
      fs.copyFileSync(source, path.join(output, resource));
      expected.add(resource);
      breed.scenes[name] = { resource, frames, frameMs: spec.frameMs };
    }
    bundled.breeds.push(breed);
  }

  for (const file of fs.readdirSync(output)) {
    if (/^ruby-default-[a-z]+-(?:idle|side|walk|happy|sleep)\.rubypng$/.test(file) && !expected.has(file)) {
      fs.unlinkSync(path.join(output, file));
    }
  }
  fs.writeFileSync(path.join(output, 'ruby-default-manifest.json'), JSON.stringify(bundled));
  fs.writeFileSync(path.join(output, 'breed-catalog.json'), JSON.stringify({
    version: 1,
    ids: breedIds,
    names: dogBreeds.map(({ name }) => name),
  }));

  // Match the tray/installer icon to the default standalone Ruby (Pomeranian).
  const defaultAsset = catalog.find(({ breed }) => breed === 'pomeranian');
  const iconPng = await sharp(sourceFile(defaultAsset.scenes.idle.desktopPng))
    .resize(64, 64, { fit: 'contain', kernel: 'nearest', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png().toBuffer();
  const header = Buffer.alloc(22);
  header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
  header[6] = 64; header[7] = 64;
  header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12);
  header.writeUInt32LE(iconPng.length, 14); header.writeUInt32LE(22, 18);
  fs.writeFileSync(path.join(output, 'puppy.ico'), Buffer.concat([header, iconPng]));

  console.log(`Bundled Ruby Dot defaults: ${bundled.breeds.length} breeds x ${scenes.length} scenes (${expected.size} exact desktop assets).`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
