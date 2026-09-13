'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { createHash } = require('node:crypto'), { createRequire } = require('node:module');
const { loadFrontend } = require('./frontend-loader.cjs');
const root = path.resolve(__dirname, '..'), requireFrontend = createRequire(path.join(root, 'frontend/package.json'));
const { desktopAppearance, attachDesktopAppearance } = loadFrontend('src/lib/desktop-appearance.ts');
const { defaultAppearance } = loadFrontend('src/lib/dog-styles.ts');
const { dogBreedIds } = loadFrontend('src/lib/dog-breeds.ts');
const { originalArtDogAssets } = loadFrontend('src/lib/original-art-dog-styles.ts');
const { premiumDogAssets } = loadFrontend('src/lib/premium-dog-styles.ts');
const { spSceneAssets, spScenesReady } = loadFrontend('src/lib/sp-scene-styles.ts');
const fingerprints = require('../frontend/src/lib/generated/desktop-appearance-assets.json');
const state = { puppy: { id: 'test-puppy', name: '루비', breed: 0, accessory: 'ribbon', fur: 'chocolate' }, coins: 42, obedience: 3, promotionXp: 900, syncedAt: 123 };
const config = style => ({ ...defaultAppearance, defaultStyle: style });
let checks = 0;
function check(value, label) { assert.ok(value, label); checks++; }
function same(value, expected, label) { assert.deepEqual(value, expected, label); checks++; }
const originalBase = process.env.NEXT_PUBLIC_ASSET_BASE_URL;
process.env.NEXT_PUBLIC_ASSET_BASE_URL = 'https://cdn.example.test/site-assets/test-release';

(async () => {
  for (const [image, meta] of Object.entries(fingerprints)) {
    const bytes = fs.readFileSync(path.join(root, 'local-assets/site', image));
    same(createHash('sha256').update(bytes).digest('hex'), meta.sha256, `${image}: fingerprint matches exact file bytes`);
    same([bytes.readUInt32BE(16), bytes.readUInt32BE(20), bytes[25]], [meta.width, meta.height, 6], `${image}: native width/height/RGBA retained`);
  }
  for (let breed = 0; breed < dogBreedIds.length; breed++) {
    const appearance = desktopAppearance(config('art-16-scenes'), breed, 'http://localhost:3000');
    same(appearance.breedId, dogBreedIds[breed], 'Persisted numeric breed IDs map to the matching scene assets');
    same(appearance.version, 1, 'Versioned client contract');
    check(/^[a-f0-9]{64}$/.test(appearance.key), 'Stable SHA-256 appearance identity');
    same(Object.keys(appearance.scenes), ['idle', 'side', 'walk', 'happy', 'sleep'], 'Five complete scenes');
    for (const [scene, image] of Object.entries(appearance.scenes)) {
      same(image.url, `https://cdn.example.test/site-assets/test-release/images/art16-scenes-v1/${dogBreedIds[breed]}/${scene}.png`, 'Exact release CDN URL');
      same(image.frames, scene === 'walk' ? 8 : 1, 'Real walking sheet has eight frames; still scenes stay single frames');
      const meta = fingerprints[`/images/art16-scenes-v1/${dogBreedIds[breed]}/${scene}.png`];
      same([image.sha256, appearance.width * image.frames, appearance.height], [meta.sha256, meta.width, meta.height], 'Client can verify native sheet dimensions and exact bytes');
    }
  }
  for (const asset of [...originalArtDogAssets, ...premiumDogAssets]) {
    const appearance = desktopAppearance(config(asset.id), 0, 'http://localhost:3000');
    same([appearance.width, appearance.height], [asset.width, asset.height], 'Original artwork is never reduced to embedded 64-pixel sprites');
    for (const scene of Object.values(appearance.scenes)) {
      same(scene.frames, 1, 'Single master artwork does not invent animated frames');
      same(scene.url, 'https://cdn.example.test/site-assets/test-release' + asset.png, 'The web-selected master artwork is used directly');
    }
  }
  for (const asset of spSceneAssets.filter(asset => spScenesReady(asset.style))) {
    const appearance = desktopAppearance(config(`${asset.style}-scenes`), dogBreedIds.indexOf(asset.breed), 'http://localhost:3000');
    same([appearance.styleId, appearance.breedId, appearance.width, appearance.height], [`${asset.style}-scenes`, asset.breed, asset.width, asset.height], 'SP desktop appearance keeps the selected family, breed and native dimensions');
    same(Object.keys(appearance.scenes), ['idle', 'side', 'walk', 'happy', 'sleep'], 'Installed version 1 desktop receives its exact five-scene contract; web wag cannot invalidate all artwork');
    for (const [scene, image] of Object.entries(appearance.scenes)) {
      same(image.url, `https://cdn.example.test/site-assets/test-release${asset.scenes[scene].png}`, 'SP desktop fetches the same release artwork as the web');
      same([image.frames, image.frameMs], [asset.scenes[scene].frames, asset.scenes[scene].frameMs], 'SP desktop retains actual animation frames and timing');
      same(image.sha256, fingerprints[asset.scenes[scene].png].sha256, 'SP desktop validates exact source bytes');
    }
  }
  const selected = { ...config('art-01'), breedStyles: { pomeranian: 'art-16' }, varieties: [{ id: 'c497341a-39fb-4204-9758-0a347445b6c9', breed: 'pomeranian', name: '복슬이', style: 'art-16-scenes', shape: 'original', pattern: 'solid', coatColor: null, patternColor: '#FFFFFF' }], breedVarieties: { pomeranian: 'c497341a-39fb-4204-9758-0a347445b6c9' } };
  same(desktopAppearance(selected, 0, 'http://localhost:3000').styleId, 'art-16-scenes', 'Selected variety override takes priority over breed/global settings');
  same(desktopAppearance({ ...selected, breedVarieties: {} }, 0, 'http://localhost:3000').styleId, 'art-16', 'Breed override takes priority over global settings');
  same(desktopAppearance(selected, 1, 'http://localhost:3000').styleId, 'art-01', 'Another breed retains its own global artwork');
  same(desktopAppearance(defaultAppearance, 0, 'http://localhost:3000'), null, 'Classic uses the existing native sprite without an error');
  same(desktopAppearance(config('art-16'), 0, 'http://localhost:3000').key, desktopAppearance({ ...config('art-16'), revision: 999 }, 0, 'http://localhost:3000').key, 'Unrelated settings revisions do not redownload unchanged PNGs');
  check(desktopAppearance(config('art-16'), 0, 'http://localhost:3000').key !== desktopAppearance(config('art-17'), 0, 'http://localhost:3000').key, 'A style change invalidates cached appearance');
  process.env.NEXT_PUBLIC_ASSET_BASE_URL = '';
  same(desktopAppearance(config('art-16'), 0, 'http://127.0.0.1:3000').scenes.idle.url, require('../frontend/src/lib/generated/public-media-release.json').images.baseUrl + '/images/pixel-art-dogs-v1/art-16.png', 'Desktop uses the committed CDN release when no image override is configured');
  process.env.NEXT_PUBLIC_ASSET_BASE_URL = 'https://cdn.example.test/site-assets/test-release';

  for (const action of ['pair', 'state', 'action']) {
    const input = action === 'state' ? state : { state, token: 'test-token-not-issued', success: true, message: '돌봄 완료' };
    let calls = 0;
    const fetcher = async (url, options) => { calls++; same(url, 'http://127.0.0.1:8080/api/v1/appearance', 'Only public appearance settings are fetched'); check(!options.headers && !options.body && options.cache === 'no-store' && options.redirect === 'error', 'No player identity, token or stale settings are sent to appearance'); return Response.json(selected); };
    const result = await attachDesktopAppearance(input, action, 'http://localhost:3000', 'http://127.0.0.1:8080/api/v1', fetcher);
    const enriched = action === 'state' ? result : result.state;
    same(enriched.appearance.styleId, 'art-16-scenes', `${action}: appearance reaches the DesktopGameState`);
    same(enriched.appearanceError, null, 'Successful appearance clears earlier cosmetic error');
    same(enriched.puppy, state.puppy, 'Cosmetic delivery does not modify game or wardrobe data');
    same(calls, 1, 'One public read per device response');
    if (action !== 'state') same([result.token, result.success, result.message], [input.token, input.success, input.message], 'Pairing token and action receipt preserved');
    const failed = await attachDesktopAppearance(input, action, 'http://localhost:3000', 'http://localhost:8080/api/v1', async () => { throw Error('Do not leak internal URL or credentials'); });
    const failedState = action === 'state' ? failed : failed.state;
    same(failedState.appearance, null, 'No partial appearance is emitted after an asset metadata failure');
    check(failedState.appearanceError.includes('마지막') && !failedState.appearanceError.includes('credentials'), 'Recoverable error preserves last valid appearance without leaking internals');
    same(failedState.coins, state.coins, 'Game state remains successful even when appearance retrieval fails');
    same(input, action === 'state' ? state : { state, token: 'test-token-not-issued', success: true, message: '돌봄 완료' }, 'Input response is not mutated');
  }
  const unsupported = await attachDesktopAppearance(state, 'state', 'http://localhost:3000', 'http://localhost:8080/api/v1', async () => Response.json(config('round')));
  check(unsupported.appearance === null && unsupported.appearanceError.includes('아직 PC 앱'), 'Unsupported styles are explicit and do not claim a matching appearance');
  const classic = await attachDesktopAppearance(state, 'state', 'http://localhost:3000', 'http://localhost:8080/api/v1', async () => Response.json(defaultAppearance));
  same([classic.appearance, classic.appearanceError], [null, null], 'Classic retains the intentional embedded fallback');
  const browser = { devices: [] };
  same(await attachDesktopAppearance(browser, 'links', 'http://localhost:3000', '', async () => { throw Error('Must not fetch'); }), browser, 'Browser link management is unchanged');
  await verifyProxyRoute();
  console.log(`PASS ${checks} desktop appearance checks: ${Object.keys(fingerprints).length} exact RGBA assets, all 30 breeds, original/premium/SP looks, CDN URLs, selected-variety priority, pairing/state/action delivery, and isolated cosmetic failures.`);
})().finally(() => { if (originalBase === undefined) delete process.env.NEXT_PUBLIC_ASSET_BASE_URL; else process.env.NEXT_PUBLIC_ASSET_BASE_URL = originalBase; }).catch(error => { console.error(error); process.exitCode = 1; });

async function verifyProxyRoute() {
  const { NextRequest } = requireFrontend('next/server');
  const route = loadFrontend('src/app/api/desktop/[[...path]]/route.ts', { '@/lib/server-session': {
    apiBase: () => 'http://backend.test/api/v1', browserIdentity: async () => ({ headers: { 'X-Player-Id': 'fixture-owner' }, fresh: false }),
    clearSession: () => {}, isSameOrigin: () => true, saveGuest: () => {},
  } });
  const oldFetch = global.fetch;
  try {
    for (const action of ['pair', 'state', 'action']) {
      let appearanceReads = 0;
      global.fetch = async url => {
        if (url.endsWith('/appearance')) { appearanceReads++; return Response.json(config('art-16')); }
        return Response.json(action === 'state' ? state : { state, success: true, token: 'fixture-token' });
      };
      const method = action === 'state' ? 'GET' : 'POST';
      const req = new NextRequest(`http://localhost:3000/api/desktop/${action}`, { method, headers: { Authorization: 'Bearer ' + 'A'.repeat(43), 'Content-Type': 'application/json' }, ...(method === 'POST' ? { body: '{}' } : {}) });
      const response = await route[method](req, { params: Promise.resolve({ path: [action] }) });
      const data = await response.json(), dataState = action === 'state' ? data : data.state;
      same(response.status, 200, 'Native BFF succeeds');
      same(dataState.appearance.styleId, 'art-16', 'Actual BFF route emits the selected original art');
      check(response.headers.get('cache-control').includes('no-store') && response.headers.get('vary').includes('Authorization'), 'Private pairing and state responses cannot be cached');
      same(appearanceReads, 1, 'Successful device response resolves public appearance exactly once');
    }
    let reads = 0;
    global.fetch = async () => { reads++; return Response.json({ message: 'expired' }, { status: 401 }); };
    const expired = await route.GET(new NextRequest('http://localhost:3000/api/desktop/state', { headers: { Authorization: 'Bearer ' + 'A'.repeat(43) } }), { params: Promise.resolve({ path: ['state'] }) });
    same(expired.status, 401, 'Expired token remains unauthorized');
    same(reads, 1, 'Unauthorized response does not perform an appearance read');
  } finally { global.fetch = oldFetch; }
}
