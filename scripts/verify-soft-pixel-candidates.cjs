'use strict';
// Read-only artwork checks: generated body, replaceable eyes and the editable file
// must describe the same 192px character without changing the active dog style.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
const sharp = createRequire(path.join(root, 'frontend/package.json'))('sharp');
const publicRoot = path.join(root, 'local-assets/site');
const manifestFile = path.join(root, 'frontend/src/lib/generated/soft-pixel-candidates.json');
const eyeNames = ['dot', 'bean', 'sparkle', 'sleep'];
const layers = ['body', ...eyeNames.map(eye => `eyes-${eye}`), 'preview'];
const partial = process.argv.includes('--partial');
let checks = 0;
const check = (value, label) => { assert.ok(value, label); checks++; };
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase();
const samePixels = (a, b) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 4) {
    if (a[i+3] !== b[i+3]) return false;
    if (a[i+3] && (a[i] !== b[i] || a[i+1] !== b[i+1] || a[i+2] !== b[i+2])) return false;
  }
  return true;
};
function composite(destination, source) {
  const result = Buffer.from(destination);
  for (let i = 0; i < source.length; i += 4) {
    if (!source[i+3]) continue;
    check(source[i+3] === 255, 'Eye layers use crisp opaque pixels');
    source.copy(result, i, i, i + 4);
  }
  return result;
}

// Parse only the simple, one-frame RGBA layer/cel subset emitted by Aseprite.
// Comparing its decoded cels catches a flattened or misaligned editable master.
function readAseprite(bytes, id) {
  check(bytes.readUInt16LE(4) === 0xa5e0 && bytes.readUInt16LE(6) === 1, `${id}: one valid editable frame`);
  check(bytes.readUInt16LE(8) === 192 && bytes.readUInt16LE(10) === 192 && bytes.readUInt16LE(12) === 32, `${id}: editable native RGBA canvas`);
  check(bytes.readUInt32LE(0) === bytes.length, `${id}: complete editable file`);
  let frameOffset = 128;
  check(bytes.readUInt16LE(frameOffset + 4) === 0xf1fa, `${id}: editable frame signature`);
  let count = bytes.readUInt16LE(frameOffset + 6);
  if (count === 0xffff) count = bytes.readUInt32LE(frameOffset + 12);
  const frameEnd = frameOffset + bytes.readUInt32LE(frameOffset), parsedLayers = [], cels = [];
  let offset = frameOffset + 16;
  for (let index = 0; index < count; index++) {
    const length = bytes.readUInt32LE(offset), type = bytes.readUInt16LE(offset + 4), body = offset + 6;
    check(length >= 6 && offset + length <= frameEnd, `${id}: bounded editable chunk`);
    if (type === 0x2004) {
      const nameLength = bytes.readUInt16LE(body + 16);
      parsedLayers.push({visible: !!(bytes.readUInt16LE(body) & 1), type: bytes.readUInt16LE(body+2), depth: bytes.readUInt16LE(body+4), opacity: bytes[body+12], blend: bytes.readUInt16LE(body+10), name: bytes.toString('utf8', body+18, body+18+nameLength)});
    } else if (type === 0x2005) {
      const layer = bytes.readUInt16LE(body), x = bytes.readInt16LE(body+2), y = bytes.readInt16LE(body+4), opacity = bytes[body+6], celType = bytes.readUInt16LE(body+7);
      check(celType === 0 || celType === 2, `${id}: independent image cels (not linked or flattened)`);
      const width = bytes.readUInt16LE(body+16), height = bytes.readUInt16LE(body+18);
      const payload = bytes.subarray(body+20, offset+length);
      const data = celType === 2 ? zlib.inflateSync(payload) : payload;
      check(data.length === width * height * 4 && x >= 0 && y >= 0 && x+width <= 192 && y+height <= 192 && opacity === 255, `${id}: aligned RGBA cel`);
      const canvas = Buffer.alloc(192*192*4);
      for (let row = 0; row < height; row++) data.copy(canvas, ((y+row)*192+x)*4, row*width*4, (row+1)*width*4);
      cels.push({layer, data:canvas});
    }
    offset += length;
  }
  check(offset === frameEnd, `${id}: complete editable frame chunks`);
  check(parsedLayers.length === 17, `${id}: body plus 4 groups of 3 editable eye layers`);
  check(parsedLayers[0].name === 'Body - supplied artwork (eyes separate)' && parsedLayers[0].visible && parsedLayers[0].depth === 0, `${id}: original body is separate and visible`);
  const groups = parsedLayers.filter(layer => layer.type === 1);
  check(groups.length === 4 && groups.every(layer => layer.depth === 0), `${id}: four top-level eye presets`);
  check(groups.filter(layer => layer.visible).map(layer => layer.name).join() === 'Eyes - bean', `${id}: only the default eye group is visible`);
  const pixelsByLayer = new Map(cels.map(cel => [cel.layer, cel.data]));
  const body = pixelsByLayer.get(0);
  check(body, `${id}: editable body pixels exist`);
  const eyeGroups = {};
  for (const eye of eyeNames) {
    const groupIndex = parsedLayers.findIndex(layer => layer.name === `Eyes - ${eye}` && layer.type === 1);
    check(groupIndex > 0, `${id}: ${eye} editable group exists`);
    const children = parsedLayers.slice(groupIndex+1, groupIndex+4);
    check(children.map(layer => layer.name).join('|') === 'Eye left|Eye right|Highlights' && children.every(layer => layer.depth === 1 && layer.type === 0 && layer.visible && layer.opacity === 255 && layer.blend === 0), `${id}: ${eye} pupils and highlights are independently editable`);
    let canvas = Buffer.alloc(192*192*4);
    for (let child = 1; child <= 3; child++) {
      const pixels = pixelsByLayer.get(groupIndex+child);
      if (pixels) canvas = composite(canvas, pixels); // Empty highlights need no cel.
    }
    eyeGroups[eye] = canvas;
  }
  return {body, eyeGroups};
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  check(Array.isArray(manifest) && (partial || manifest.length === 15), 'Exactly 15 review candidates');
  const ids = new Set(), bodyHashes = new Set(), sourceHashes = new Set(), results = [];
  for (const item of manifest) {
    check(/^sp-(0[1-9]|1[0-5])$/.test(item.id) && !ids.has(item.id), 'Known unique candidate ID'); ids.add(item.id);
    check(item.width === 192 && item.height === 192 && item.defaultEyes === 'bean', `${item.id}: native canvas and default expression`);
    check(item.code && item.name && item.description, `${item.id}: recognizable candidate label`);
    const proofPath = path.join(root, 'local-assets/work/soft-pixel-v1/processed', item.id, 'conversion.json');
    if (partial && !fs.existsSync(proofPath)) continue;
    const proof = JSON.parse(fs.readFileSync(proofPath, 'utf8'));
    check(proof.exactExportRgba && proof.sourcePreserved && !proof.bodyArtworkGeneratedByCode && !proof.quantized && !proof.recolored, `${item.id}: generated source preserved; no procedural replacement dog`);
    check(proof.width === 192 && proof.height === 192 && proof.defaultEyes === 'bean' && proof.editableEyeGroups === 4 && proof.editableEyeLayers === 12, `${item.id}: finished Aseprite export`);
    const original = fs.readFileSync(path.join(root, 'local-assets/work/soft-pixel-v1/originals', `${item.id}.png`));
    check(sha(original) === proof.sourceSha256, `${item.id}: original image retained byte for byte`); sourceHashes.add(sha(original));
    const source = await sharp(original).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const inputConfigBytes = fs.readFileSync(path.join(root, 'local-assets/work/soft-pixel-v1/processed', item.id, 'input-config.json'));
    const inputConfig = JSON.parse(inputConfigBytes.toString('utf8'));
    check(sha(inputConfigBytes) === proof.configSha256 && inputConfig.background === 'transparent', `${item.id}: verified import keeps genuine source transparency`);
    check(proof.alphaNoiseThreshold >= 0 && proof.alphaNoiseThreshold <= 2 && source.info.width === proof.sourceWidth && source.info.height === proof.sourceHeight, `${item.id}: only invisible alpha noise may be removed`);
    const prefix = `/images/soft-pixel-v1/${item.id}/`;
    check(item.body === prefix+'body.png' && item.png === prefix+'preview.png' && eyeNames.every(eye => item.eyes[eye] === prefix+`eyes-${eye}.png`), `${item.id}: six finite local image paths`);
    check(Array.isArray(item.eyeAnchors) && item.eyeAnchors.length === 2 && item.eyeAnchors.every(a => ['x','y','rx','ry'].every(k => Number.isFinite(a[k]) && a[k] > 0 && a[k] < 192)), `${item.id}: movable eye anchors are valid`);
    const proofAnchors = [proof.eyeLeft, proof.eyeRight];
    check(item.eyeAnchors.every((a, i) => a.x === proofAnchors[i].x && a.y === proofAnchors[i].y), `${item.id}: runtime and editable eye centers agree`);
    const pixels = {};
    for (const layer of layers) {
      const filename = path.join(publicRoot, prefix, `${layer}.png`), bytes = fs.readFileSync(filename);
      check(bytes[24] === 8 && bytes[25] === 6 && sha(bytes) === proof.pngSha256[layer], `${item.id}/${layer}: published RGBA bytes match export`);
      const decoded = await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
      check(decoded.info.width === 192 && decoded.info.height === 192, `${item.id}/${layer}: unchanged canvas alignment`);
      pixels[layer] = decoded.data;
    }
    bodyHashes.add(sha(pixels.body));
    const resizedWidth = Math.max(1, Math.round(source.info.width * 192 / Math.max(source.info.width, source.info.height)));
    const resizedHeight = Math.max(1, Math.round(source.info.height * 192 / Math.max(source.info.width, source.info.height)));
    const offsetX = Math.floor((192-resizedWidth)/2), offsetY = Math.floor((192-resizedHeight)/2);
    let sourceDifferences = 0, alphaNoise = 0;
    for (let p = 0; p < source.data.length; p += 4) if (source.data[p+3] > 0 && source.data[p+3] <= proof.alphaNoiseThreshold) alphaNoise++;
    for (let y = 0; y < 192; y++) for (let x = 0; x < 192; x++) {
      const p = (y*192+x)*4;
      if (x < offsetX || x >= offsetX+resizedWidth || y < offsetY || y >= offsetY+resizedHeight) {
        if (pixels.body[p+3]) sourceDifferences++;
        continue;
      }
      const sx = Math.floor((x-offsetX)*source.info.width/resizedWidth), sy = Math.floor((y-offsetY)*source.info.height/resizedHeight);
      const originalPixel = (sy*source.info.width+sx)*4;
      if (source.data[originalPixel+3] <= proof.alphaNoiseThreshold) {
        if (pixels.body[p+3]) sourceDifferences++;
      } else if (!source.data.subarray(originalPixel, originalPixel+4).equals(pixels.body.subarray(p, p+4))) sourceDifferences++;
    }
    check(alphaNoise === proof.removedAlphaNoisePixels && sourceDifferences === 0, `${item.id}: every visible body RGBA pixel is an exact nearest source sample; only alpha <= 2 is discarded`);
    let bodyVisible = 0, bodyTransparent = 0, bodyEdge = 0;
    for (let p = 0; p < pixels.body.length; p += 4) {
      const x = (p/4)%192, y = Math.floor(p/4/192), a = pixels.body[p+3];
      if (a) { bodyVisible++; if (x === 0 || y === 0 || x === 191 || y === 191) bodyEdge++; } else bodyTransparent++;
    }
    check(bodyVisible > 192*192*.08 && bodyTransparent > 192*192*.1 && bodyEdge === 0, `${item.id}: isolated dog with transparent margins`);
    const eyeHashes = new Set();
    for (const eye of eyeNames) {
      const data = pixels[`eyes-${eye}`]; eyeHashes.add(sha(data));
      let black = 0, white = 0, invalid = 0, offFace = 0, outsideAnchors = 0;
      for (let p = 0; p < data.length; p += 4) {
        if (!data[p+3]) continue;
        if (data[p+3] !== 255) invalid++;
        if (data[p] === 0 && data[p+1] === 0 && data[p+2] === 0) black++;
        else if (data[p] === 255 && data[p+1] === 255 && data[p+2] === 255) white++;
        else invalid++;
        // The image generator can emit nearly opaque fur (alpha 253/254).
        // Preserve that original alpha; only reject eyes placed on transparent margins.
        if (pixels.body[p+3] < 250) offFace++;
        const x = (p/4)%192, y = Math.floor(p/4/192);
        if (!item.eyeAnchors.some(a => Math.abs(x-a.x) <= Math.max(a.rx*2, 12) && Math.abs(y-a.y) <= Math.max(a.ry*2, 12))) outsideAnchors++;
      }
      check(black > 12 && invalid === 0 && offFace === 0 && outsideAnchors === 0, `${item.id}/${eye}: crisp black replaceable pupils sit entirely on the face`);
      check((eye === 'bean' || eye === 'sparkle') ? white > 0 : white === 0, `${item.id}/${eye}: intentional highlight preset`);
    }
    check(eyeHashes.size === 4, `${item.id}: four visibly different eye masks`);
    for (const a of item.eyeAnchors) {
      let bakedBlack = 0;
      for (let y = Math.round(a.y)-2; y <= Math.round(a.y)+2; y++) for (let x = Math.round(a.x)-2; x <= Math.round(a.x)+2; x++) {
        const p = (y*192+x)*4;
        if (pixels.body[p+3] && Math.max(pixels.body[p],pixels.body[p+1],pixels.body[p+2]) < 32) bakedBlack++;
      }
      check(bakedBlack === 0, `${item.id}: bare face has no old pupil baked under replaceable eyes`);
    }
    check(samePixels(composite(pixels.body, pixels['eyes-bean']), pixels.preview), `${item.id}: preview is exactly body plus default eyes`);
    check(item.aseprite === `/downloads/soft-pixel-v1/${item.id}.aseprite`, `${item.id}: editable download is scoped to candidate`);
    const ase = fs.readFileSync(path.join(publicRoot, item.aseprite));
    check(sha(ase) === proof.asepriteSha256, `${item.id}: published editable bytes match export`);
    const editable = readAseprite(ase, item.id);
    check(samePixels(editable.body, pixels.body), `${item.id}: editable body equals published body exactly`);
    for (const eye of eyeNames) check(samePixels(editable.eyeGroups[eye], pixels[`eyes-${eye}`]), `${item.id}: editable ${eye} pupils and highlights equal exported PNG`);
    results.push({id:item.id,bodyVisiblePixels:bodyVisible,eyePresets:4,editableEyeLayers:12,nativeCanvas:192});
  }
  check(results.length > 0 && (partial || results.length === 15), 'All requested candidate files finished');
  check(bodyHashes.size === results.length && sourceHashes.size === results.length, 'All 15 bodies derive from different original artwork');
  const report = {checks,partial,candidates:results.length,imageFiles:results.length*6,editableFiles:results.length,results};
  const reportDirectory = path.join(root, 'local-assets/work/soft-pixel-v1'); fs.mkdirSync(reportDirectory, {recursive:true});
  fs.writeFileSync(path.join(reportDirectory, partial ? 'verification-partial.json' : 'verification.json'), JSON.stringify(report,null,2));
  console.log(JSON.stringify({checks,partial,candidates:results.length,imageFiles:results.length*6,editableFiles:results.length}));
}
module.exports = {readAseprite};
if (require.main === module) main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
