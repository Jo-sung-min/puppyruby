'use strict';
// Read-only native pixel comparisons against the original generated atlases.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
const sharp = createRequire(path.join(root, 'frontend/package.json'))('sharp');
const catalog = fs.readFileSync(path.join(root, 'frontend/src/lib/dog-breeds.ts'), 'utf8');
const breeds = [...catalog.matchAll(/id: "([a-z]+)"/g)].map(match => match[1]);
const partial = process.argv.includes('--partial');
const sceneIndexes = { idle: [0], side: [1], walk: [4,5,6,7,8,9,10,11], happy: [2], sleep: [3] };
const sha = data => crypto.createHash('sha256').update(data).digest('hex').toUpperCase();
let checks = 0;
function check(condition, label) { assert.ok(condition, label); checks++; }

(async () => {
  const results = [];
  for (const breed of breeds) {
    const directory = path.join(root, 'local-assets/work/art16-scenes-v1/processed', breed);
    const proofFile = path.join(directory, 'conversion.json');
    if (partial && !fs.existsSync(proofFile)) continue;
    check(fs.existsSync(proofFile), `${breed}: conversion completed`);
    const proof = JSON.parse(fs.readFileSync(proofFile, 'utf8'));
    check(proof.breed === breed && proof.frames === 12 && proof.uniqueWalkFrames === 8 && proof.groundAligned, `${breed}: five real scenes and registered gait`);
    check(proof.exactVisibleRgba && !proof.resized && !proof.quantized && !proof.recolored && !proof.fabricatedFrames, `${breed}: no lossy source conversion`);
    const sourceFile = path.join(directory, 'source-input.png');
    const sourceBytes = fs.readFileSync(sourceFile);
    check(sha(sourceBytes) === proof.sourceSha256, `${breed}: original source bytes unchanged`);
    const source = await sharp(sourceBytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const ase = fs.readFileSync(path.join(root, 'local-assets/site', proof.aseprite));
    check(sha(ase) === proof.asepriteSha256 && ase.readUInt16LE(4) === 0xa5e0 && ase.readUInt16LE(6) === 12 && ase.readUInt16LE(8) === proof.width && ase.readUInt16LE(10) === proof.height && ase.readUInt16LE(12) === 32, `${breed}: full native RGBA editable file`);
    let retained = 0, chromakeyPixels = 0;
    const walkHashes = [], gaitMasks = [];
    for (const [scene, indexes] of Object.entries(sceneIndexes)) {
      const spec = proof.scenes[scene];
      const png = fs.readFileSync(path.join(root, 'local-assets/site', spec.png));
      check(sha(png) === proof.pngSha256[scene] && spec.frames === indexes.length, `${breed}/${scene}: published bytes match verified export`);
      const exported = await sharp(png).ensureAlpha().raw().toBuffer({resolveWithObject:true});
      check(exported.info.width === proof.width * indexes.length && exported.info.height === proof.height, `${breed}/${scene}: native horizontal frames`);
      for (let frame = 0; frame < indexes.length; frame++) {
        const rect = proof.cellRectangles[indexes[frame]], normalized = Buffer.alloc(proof.width * proof.height * 4), mask = Buffer.alloc(proof.width * proof.height);
        let visible = 0, edge = 0, changed = 0, bottom = -1, invalidCoordinates = 0;
        for (let y = 0; y < proof.height; y++) for (let x = 0; x < proof.width; x++) {
          const p = (y * exported.info.width + frame * proof.width + x) * 4;
          const target = (y * proof.width + x) * 4;
          if (!exported.data[p+3]) continue;
          visible++; bottom = Math.max(bottom,y);
          if (x === 0 || y === 0 || x === proof.width-1 || y === proof.height-1) edge++;
          const sx = rect.x + x - rect.translation.x, sy = rect.y + y - rect.translation.y;
          if (!(sx >= rect.x && sy >= rect.y && sx < rect.x+rect.width && sy < rect.y+rect.height)) { invalidCoordinates++; continue; }
          const original = (sy * source.info.width + sx) * 4;
          for (let c = 0; c < 4; c++) { if (exported.data[p+c] !== source.data[original+c]) changed++; normalized[target+c] = exported.data[p+c]; }
          mask[y * proof.width + x] = exported.data[p+3];
          const r=exported.data[p],g=exported.data[p+1],b=exported.data[p+2];
          if (r>=180 && b>=180 && g<=100 && r-g>=100 && b-g>=100) chromakeyPixels++;
        }
        check(invalidCoordinates === 0 && changed === 0 && visible === rect.retainedVisiblePixels, `${breed}/${scene}/${frame}: every retained source RGBA pixel survives exactly`);
        if (proof.backgroundMode === 'border-magenta') {
          let missingNonKey = 0;
          for (let sy=rect.y;sy<rect.y+rect.height;sy++) for (let sx=rect.x;sx<rect.x+rect.width;sx++) {
            const i=(sy*source.info.width+sx)*4,r=source.data[i],g=source.data[i+1],b=source.data[i+2],a=source.data[i+3];
            if (!a || (r>=180 && b>=180 && g<=100 && r-g>=100 && b-g>=100)) continue;
            const x=sx-rect.x+rect.translation.x,y=sy-rect.y+rect.translation.y;
            if (x<0 || y<0 || x>=proof.width || y>=proof.height) { missingNonKey++;continue; }
            const p=(y*exported.info.width+frame*proof.width+x)*4;
            for(let c=0;c<4;c++) if (source.data[i+c]!==exported.data[p+c]) missingNonKey++;
          }
          check(missingNonKey === 0, `${breed}/${scene}/${frame}: all original non-key pixels retained`);
        }
        check(edge === 0 && bottom === proof.height-1-Math.max(8,Math.floor(proof.height*0.04)), `${breed}/${scene}/${frame}: transparent margins and stable floor`);
        retained += visible;
        if (scene === 'walk') { walkHashes.push(sha(normalized)); gaitMasks.push(sha(mask)); }
      }
    }
    check(new Set(walkHashes).size === 8 && new Set(gaitMasks).size === 8, `${breed}: eight independently shaped gait frames`);
    if (proof.backgroundMode === 'border-magenta') check(chromakeyPixels === 0, `${breed}: no explicit chromakey background remains`);
    results.push({breed,width:proof.width,height:proof.height,scenes:5,frames:12,retainedRgbaPixels:retained,remainingStrongMagentaPixels:chromakeyPixels});
  }
  check(results.length > 0 && (partial || results.length === breeds.length), 'Requested breed set is complete');
  const report = {checks,breeds:results.length,scenes:results.length*5,frames:results.length*12,partial,allRetainedRgbaExact:true,results};
  fs.writeFileSync(path.join(root, 'local-assets/work/art16-scenes-v1', partial?'verification-partial.json':'verification.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({checks,breeds:results.length,scenes:results.length*5,frames:results.length*12,partial,
    allRetainedRgbaExact:true,retainedRgbaPixels:results.reduce((sum,item)=>sum+item.retainedRgbaPixels,0),
    remainingStrongMagentaPixels:results.reduce((sum,item)=>sum+item.remainingStrongMagentaPixels,0)}));
})().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
