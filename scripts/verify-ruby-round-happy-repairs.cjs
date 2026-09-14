'use strict';
// Independent decoded-pixel audit: the repair can only replace greeting cells 2-4.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { createRequire } = require('node:module'), { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..'), req = createRequire(path.join(root, 'frontend/package.json'));
const sharp = req('sharp'), work = path.join(root, 'local-assets/work/ruby-round-v1');
const requested = process.argv.find(value => value.startsWith('--breed='))?.slice(8);
const breeds = require('../frontend/src/lib/generated/ruby-round-scene-assets.json').map(asset => asset.breed);
const hash = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
async function read(file) { const bytes = fs.readFileSync(file); return { bytes, ...(await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })) }; }
(async () => {
  assert(!requested || breeds.includes(requested));
  let repaired = 0, preserved = 0;
  for (const breed of requested ? [requested] : breeds) {
    const audit = JSON.parse(fs.readFileSync(path.join(work, 'paw-fix/merged', breed + '.json'), 'utf8'));
    const before = await read(path.join(work, 'paw-fix/baseline', breed, 'original.png'));
    const edited = await read(path.join(work, 'paw-fix/generated', breed + '.png'));
    const after = await read(path.join(work, 'originals', breed + '.png'));
    assert.equal(hash(before.bytes), audit.sourceSha256); assert.equal(hash(edited.bytes), audit.editedSha256); assert.equal(hash(after.bytes), audit.mergedSha256);
    assert.equal(before.info.width, after.info.width); assert.equal(before.info.height, after.info.height);
    assert.equal(edited.info.width, after.info.width); assert.equal(edited.info.height, after.info.height);
    const oldProof = JSON.parse(fs.readFileSync(path.join(work, 'paw-fix/baseline', breed, 'conversion.json'), 'utf8'));
    assert.equal(audit.top, oldProof.gridBoundaries.y[3]); assert.equal(audit.bottom, oldProof.gridBoundaries.y[4] - 1);
    assert.equal(audit.left, oldProof.gridBoundaries.xByRow[3][1]); assert.equal(audit.right, oldProof.gridBoundaries.xByRow[3][4] - 1);
    for (let y = 0; y < after.info.height; y++) for (let x = 0; x < after.info.width; x++) {
      const index = (y * after.info.width + x) * 4;
      const inRepair = x >= audit.left && x <= audit.right && y >= audit.top && y <= audit.bottom;
      const expected = inRepair ? edited.data : before.data;
      for (let channel = 0; channel < 4; channel++) assert.equal(after.data[index + channel], expected[index + channel], `${breed}: unexpected pixel at ${x},${y}`);
      if (!inRepair) preserved++;
    }
    repaired++;
  }
  console.log(`PASS: ${repaired} greeting repairs; ${preserved} unrelated source pixels exactly preserved. Anatomy requires the separate visual review.`);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
