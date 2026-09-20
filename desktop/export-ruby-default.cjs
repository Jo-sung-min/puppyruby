const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { createHash } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const requireFrontend = createRequire(path.join(root, 'frontend/package.json'));
const sharp = requireFrontend('sharp');
const catalog = require('../frontend/src/lib/generated/ruby-round-scene-assets.json');
const fingerprints = require('../frontend/src/lib/generated/desktop-appearance-assets.json');
const { loadFrontend } = require('../scripts/frontend-loader.cjs');
const { dogBreeds } = loadFrontend('src/lib/dog-breeds.ts');
// Keep the shipping resources in a dedicated directory. The old exporter
// produced thousands of legacy sprites in build/assets; using a separate,
// exact directory prevents a stale file from silently entering PuppyRuby.exe.
const output = path.join(root, 'local-assets/desktop/build/ruby-assets');
const sourceRoot = path.join(root, 'local-assets/site');
const scenes = ['idle', 'side', 'walk', 'happy', 'sleep'];
const actions = ['idle', 'side', 'walk', 'happy', 'sleep', 'typing', 'petting', 'eat', 'belly', 'stretch', 'wag', 'scratch', 'walk-left', 'walk-right', 'walk-up', 'walk-down'];
const nativeActions = actions.slice(5);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

fs.mkdirSync(output, { recursive: true });

function sourceFile(publicPath) {
  assert.match(publicPath, /^\/images\/ruby-round-v1\/(?:eyes\/eye-01|[a-z]+\/(?:actions\/)?[a-z]+(?:-[a-z]+)*(?:-desktop)?)\.png$/);
  return path.join(sourceRoot, publicPath.replace(/^\/+/, ''));
}

async function main() {
  const breedIds = dogBreeds.map(({ id }) => id);
  assert.equal(catalog.length, 30, 'Ruby Dot release must contain all 30 breeds');
  assert.deepEqual(catalog.map(({ breed }) => breed), breedIds, 'Ruby Dot breed order must match the persisted desktop catalog');

  const isNative = asset => asset.actions && actions.every(id => asset.actions[id]?.kind === 'redrawn' && asset.actions[id]?.eyeModeByFrame?.length === 4);
  const includeNative = catalog.every(isNative);
  const hasRedrawn = catalog.some(asset => asset.assetVersion === 3 || Object.values(asset.actions ?? {}).some(sheet => sheet.kind === 'redrawn'));
  assert.ok(includeNative || !hasRedrawn, 'The offline release requires all sixteen complete redrawn actions for every breed');
  const bundled = { version: 1, styleId: 'ruby-round-scenes', styleName: includeNative ? '루비 도트 · 열여섯 동작' : '루비 도트 · 다섯 동작', breeds: [] };
  const expected = new Set();
  const resources = new Map(), inputs = new Map();
  async function prepareResource(publicPath, resource, width, height) {
    const file = sourceFile(publicPath), bytes = fs.readFileSync(file), sha256 = hash(bytes), entry = fingerprints[publicPath];
    assert.ok(entry && entry.width === width && entry.height === height && entry.sha256 === sha256, `${publicPath}: registered native fingerprint is required`);
    const metadata = await sharp(bytes).metadata();
    assert.equal(metadata.format, 'png', `${publicPath}: must be PNG`);
    assert.deepEqual([metadata.width, metadata.height, metadata.hasAlpha], [width, height, true], `${publicPath}: native RGBA dimensions`);
    assert.ok(!expected.has(resource), `${resource}: unique resource identity`);
    expected.add(resource); resources.set(resource, bytes); inputs.set(file, sha256);
    return sha256;
  }
  const eyeResource = 'ruby-eye-01.rubypng';
  const eyeSha256 = includeNative ? await prepareResource('/images/ruby-round-v1/eyes/eye-01.png', eyeResource, 32, 16) : undefined;
  for (const asset of catalog) {
    assert.ok(Number.isInteger(asset.width) && asset.width > 0 && Number.isInteger(asset.height) && asset.height > 0, `${asset.breed}: invalid canvas`);
    const reactionEyes = asset.scenes?.idle?.eyes?.[0]?.map(anchor => ({ ...anchor }));
    assert.equal(reactionEyes?.length, 2, `${asset.breed}: idle reaction eyes are required`);
    const breed = { breed: asset.breed, width: asset.width, height: asset.height, reactionEyes, scenes: {}, ...(includeNative ? {nativeActions: {}} : {}) };
    for (const name of scenes) {
      const spec = asset.scenes?.[name];
      assert.ok(spec, `${asset.breed}: missing ${name}`);
      const frames = spec.desktopFrames;
      assert.ok(Number.isInteger(frames) && frames >= 1 && frames <= 8, `${asset.breed}/${name}: invalid desktop frame count`);
      assert.ok(Number.isInteger(spec.frameMs) && spec.frameMs >= 50 && spec.frameMs <= 2000, `${asset.breed}/${name}: invalid timing`);
      assert.equal(spec.desktopPng, `/images/ruby-round-v1/${asset.breed}/${name}-desktop.png`, 'exact compatibility source path');
      const resource = `ruby-default-${asset.breed}-${name}.rubypng`;
      const sha256 = await prepareResource(spec.desktopPng, resource, asset.width * frames, asset.height);
      breed.scenes[name] = { resource, sha256, frames, frameMs: spec.frameMs };
    }
    if (includeNative) for (const name of actions) {
      const spec = asset.actions[name];
      assert.equal(spec.frames, 4, `${asset.breed}/${name}: all four native source frames`);
      assert.ok(Number.isInteger(spec.frameMs) && spec.frameMs >= 50 && spec.frameMs <= 2000, 'native action timing');
      assert.equal(spec.png, `/images/ruby-round-v1/${asset.breed}/${nativeActions.includes(name) ? 'actions/' : ''}${name}.png`, 'exact native source path');
      assert.equal(spec.eyes.length, 4, 'four native eye layouts');
      spec.eyeModeByFrame.forEach((mode, frame) => {
        const anchors = spec.eyes[frame];
        assert.ok(['shared', 'baked-closed', 'hidden'].includes(mode) && Array.isArray(anchors)
          && (mode === 'shared' ? anchors.length >= 1 && anchors.length <= 2 : anchors.length === 0), 'native eye mode/anchors agree');
        for (const eye of anchors) assert.ok([eye.x, eye.y, eye.width, eye.height].every(Number.isInteger)
          && eye.x >= 0 && eye.y >= 0 && eye.width > 0 && eye.height > 0 && eye.x + eye.width <= asset.width && eye.y + eye.height <= asset.height, 'native eye bounds');
      });
      const bodyResource = `ruby-body-${asset.breed}-${name}.rubypng`;
      const bodySha256 = await prepareResource(spec.png, bodyResource, asset.width * spec.frames, asset.height);
      const layered = { bodyResource, bodySha256, bodyFrames: spec.frames, eyeResource, eyeSha256, eyeStyle: 'ruby-eye-01',
        eyeAnchors: spec.eyes, eyeModeByFrame: spec.eyeModeByFrame };
      if (scenes.includes(name)) Object.assign(breed.scenes[name], layered);
      else breed.nativeActions[name] = { resource: bodyResource, sha256: bodySha256, frames: spec.frames, frameMs: spec.frameMs, ...layered };
    }
    bundled.breeds.push(breed);
  }

  assert.equal(expected.size, includeNative ? 631 : 150, 'finite complete offline resource inventory');
  for (const [file, sha256] of inputs) assert.equal(hash(fs.readFileSync(file)), sha256, 'offline source stayed unchanged during export');
  for (const [resource, bytes] of resources) fs.writeFileSync(path.join(output, resource), bytes);
  for (const file of fs.readdirSync(output)) {
    if (/^(?:ruby-default-[a-z]+-(?:idle|side|walk|happy|sleep)|ruby-body-[a-z]+-[a-z]+(?:-[a-z]+)*|ruby-eye-01)\.rubypng$/.test(file) && !expected.has(file)) {
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
  const iconPng = await sharp(resources.get(`ruby-default-${defaultAsset.breed}-idle.rubypng`))
    .resize(64, 64, { fit: 'contain', kernel: 'nearest', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png().toBuffer();
  const header = Buffer.alloc(22);
  header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
  header[6] = 64; header[7] = 64;
  header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12);
  header.writeUInt32LE(iconPng.length, 14); header.writeUInt32LE(22, 18);
  fs.writeFileSync(path.join(output, 'puppy.ico'), Buffer.concat([header, iconPng]));

  console.log(`Bundled Ruby Dot defaults: ${bundled.breeds.length} breeds x ${includeNative ? actions.length : scenes.length} actions (${expected.size} exact desktop PNG resources, ${includeNative ? 1920 : 240} frames).`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
