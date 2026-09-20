'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
const req = createRequire(path.join(root, 'frontend/package.json'));
const sharp = req('sharp');
const verifiedInputs = new Map();
function readVerified(file) {
  const absolute = path.resolve(file), bytes = fs.readFileSync(absolute);
  const hash = crypto.createHash('sha256').update(bytes).digest('hex'), prior = verifiedInputs.get(absolute);
  if (prior && prior !== hash) throw new Error('Verification input changed during inspection: ' + absolute);
  verifiedInputs.set(absolute, hash);
  return bytes;
}
const readJson = file => JSON.parse(readVerified(file).toString('utf8'));
function checkInputsUnchanged() {
  for (const [file, hash] of verifiedInputs) same(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'), hash, 'verified input unchanged: ' + path.relative(root, file));
}
const contract = readJson(path.join(root, 'shared/ruby-round-actions.json'));
const breedsSource = readVerified(path.join(root, 'frontend/src/lib/dog-breeds.ts')).toString('utf8');
const breeds = [...breedsSource.matchAll(/id: "([a-z]+)"/g)].map(match => match[1]);
const digest = file => { readVerified(file); return verifiedInputs.get(path.resolve(file)); };
let checks = 0;
const clipIssues = [];
const check = (value, label) => { assert.ok(value, label); checks++; };
const same = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };

same(contract.schemaVersion, 2, 'Motion schema version');
same(contract.framesPerAction, 4, 'Four frames per action');
same(contract.actions.length, 16, 'Exactly sixteen reviewed actions');
same(new Set(contract.actions.map(action => action.id)).size, 16, 'Stable unique action IDs');
same(contract.actions.filter(action => action.kind === 'legacy').map(action => action.id), ['idle', 'side', 'walk', 'happy', 'sleep'], 'Legacy actions remain first and unchanged');
same(breeds.length, 30, 'Thirty registered breeds');

function asepriteHeader(file) {
  const bytes = readVerified(file).subarray(0, 128);
  check(bytes.length === 128 && bytes.readUInt16LE(4) === 0xa5e0, 'Native Aseprite header');
  return { frames: bytes.readUInt16LE(6), width: bytes.readUInt16LE(8), height: bytes.readUInt16LE(10), depth: bytes.readUInt16LE(12) };
}

async function verifyV2() {
  let bytes = 0;
  for (const breed of breeds) {
    const dir = path.join(root, 'local-assets/work/ruby-round-v2/processed', breed);
    const proofFile = path.join(dir, 'motion-conversion.json');
    check(fs.existsSync(proofFile), `${breed}: motion proof exists`);
    const proof = JSON.parse(fs.readFileSync(proofFile, 'utf8'));
    same([proof.breed, proof.version, proof.frames, proof.framesPerAction, proof.eyeStyles, proof.editableLayers], [breed, 2, 64, 4, 30, 32], `${breed}: proof contract`);
    same(proof.actionOrder, contract.actions.map(action => action.id), `${breed}: action tag order`);
    check(proof.integerMotionOnly && proof.legacyFramesPreserved && !proof.resized && !proof.quantized, `${breed}: native pixel guarantees`);
    const sourceMaster = path.join(root, 'local-assets/work/ruby-round-v1/processed', breed, `${breed}.aseprite`);
    const sourceProof = path.join(root, 'local-assets/work/ruby-round-v1/processed', breed, 'conversion.json');
    same(digest(sourceMaster), proof.sourceAsepriteSha256, `${breed}: source master hash`);
    same(digest(sourceProof), proof.sourceProofSha256, `${breed}: source proof hash`);
    const master = path.join(dir, `${breed}-16-actions.aseprite`);
    same(digest(master), proof.asepriteSha256, `${breed}: extended master hash`);
    same(asepriteHeader(master), { frames: 64, width: proof.width, height: proof.height, depth: 32 }, `${breed}: 64-frame editable master header`);
    bytes += fs.statSync(master).size;
    for (const action of contract.actions) {
      const entry = proof.actions[action.id];
      check(entry && entry.frames === 4 && entry.frameMs === action.frameMs && entry.source === action.source && entry.kind === action.kind && entry.eyeMode === action.eyeMode, `${breed}/${action.id}: action metadata`);
      same(entry.eyes.length, 4, `${breed}/${action.id}: four eye layouts`);
      for (const anchors of entry.eyes) {
        if (['hidden', 'baked'].includes(action.eyeMode)) same(anchors.length, 0, `${breed}/${action.id}: hidden or baked eyes stay out of shared layer`);
        else check(anchors.length >= 1 && anchors.length <= 2 && anchors.every(anchor => Number.isInteger(anchor.x) && Number.isInteger(anchor.y)
          && anchor.width % 16 === 0 && anchor.height % 16 === 0 && anchor.x >= 0 && anchor.y >= 0
          && anchor.x + anchor.width <= proof.width && anchor.y + anchor.height <= proof.height), `${breed}/${action.id}: bounded shared eye anchors`);
      }
      if (action.kind === 'legacy') {
        same(entry.png, `/images/ruby-round-v1/${breed}/${action.id}.png`, `${breed}/${action.id}: legacy sheet URL`);
        continue;
      }
      same(entry.png, `/images/ruby-round-v1/${breed}/actions/${action.id}.png`, `${breed}/${action.id}: action sheet URL`);
      const png = path.join(dir, `${action.id}.png`);
      same(digest(png), proof.pngSha256[action.id], `${breed}/${action.id}: action sheet hash`);
      const image = sharp(png, { limitInputPixels: 100_000_000 });
      const info = await image.metadata();
      same([info.width, info.height, info.format, info.hasAlpha], [proof.width * 4, proof.height, 'png', true], `${breed}/${action.id}: transparent native sheet dimensions`);
      const { data } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const frameBytes = proof.width * proof.height * 4;
      const hashes = new Set();
      for (let frame = 0; frame < 4; frame++) {
        const packed = Buffer.allocUnsafe(frameBytes); let visible = 0;
        const edge = { top: 0, right: 0, bottom: 0, left: 0 };
        for (let y = 0; y < proof.height; y++) {
          const sourceRow = (y * proof.width * 4 * 4) + frame * proof.width * 4;
          data.copy(packed, y * proof.width * 4, sourceRow, sourceRow + proof.width * 4);
          for (let x = 0; x < proof.width; x++) if (data[sourceRow + x * 4 + 3]) {
            visible++;
            if (y === 0) edge.top++;
            if (x === proof.width - 1) edge.right++;
            if (y === proof.height - 1) edge.bottom++;
            if (x === 0) edge.left++;
          }
        }
        // The petting hand intentionally enters from beyond the top of the canvas,
        // matching the supplied storyboard. Every other edge must remain clear.
        const allowedTop = action.id === 'petting';
        const cleanEdges = edge.left === 0 && edge.right === 0 && edge.bottom === 0 && (allowedTop || edge.top === 0);
        if (visible <= 800 || !cleanEdges) clipIssues.push(`${breed}/${action.id}/${frame} visible=${visible} edges=${JSON.stringify(edge)}`);
        else checks++;
        hashes.add(crypto.createHash('sha256').update(packed).digest('hex'));
      }
      check(hashes.size >= 2, `${breed}/${action.id}: animation contains changing frames`);
      bytes += fs.statSync(png).size;
    }
  }
  same(clipIssues, [], `All action artwork stays inside its frame:\n${clipIssues.join('\n')}`);
  check(bytes > 0 && bytes < 1024 ** 3, 'Extended editable pack stays below one GiB');
  console.log(`PASS ${checks} checks: ${breeds.length} breeds, 16 actions, 1,920 frames, editable Aseprite masters and native PNG sheets (${Math.round(bytes / 1024 / 1024)} MiB).`);
}

const hashBytes = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const integer = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
const modes = new Set(['shared', 'baked-closed', 'hidden']);
const visualPanels = ['actions1-4', 'actions5-8', 'actions9-12', 'actions13-16'];
function checkVisualReview(review, breed, masterSha256, sourceSha256, panelHashes) {
  check(review && review.breed === breed && review.reviewComplete === true, breed + ': completed visual inspection required');
  same(review.reviewMethod, 'manual-visual-inspection', breed + ': manual visual inspection method');
  check(typeof review.reviewer === 'string' && review.reviewer.trim().length > 0, breed + ': visual reviewer recorded');
  check(typeof review.reviewedAtUtc === 'string' && Number.isFinite(Date.parse(review.reviewedAtUtc)), breed + ': visual inspection time recorded');
  same(review.reviewedMasterSha256?.toLowerCase(), masterSha256.toLowerCase(), breed + ': visual inspection belongs to current editable master');
  same(review.reviewedSourceSha256?.toLowerCase(), sourceSha256.toLowerCase(), breed + ': visual inspection belongs to current source');
  same(review.sampledPanels, visualPanels, breed + ': all sixteen actions visually inspected');
  same(review.belly?.status, 'pass', breed + ': belly pose passed visual inspection');
  same(review.belly?.frameNumbers, [35, 36], breed + ': both supine source frames inspected');
  same(review.belly?.observedPadsPerFrame, [4, 4], breed + ': four distinct paw pads observed in each supine frame');
  check(typeof review.belly?.note === 'string' && review.belly.note.trim().length > 0
    && typeof review.cyanCleanup === 'string' && review.cyanCleanup.trim().length > 0, breed + ': anatomical and face cleanup observations recorded');
  same(Object.keys(review.reviewedPanelSha256 ?? {}).sort(), [...visualPanels].sort(), breed + ': exact reviewed panel identities');
  for (const panel of visualPanels) same(review.reviewedPanelSha256[panel]?.toLowerCase(), panelHashes[panel], breed + ': reviewed ' + panel + ' bytes unchanged');
}
const rgba = (bytes, index) => bytes.readUInt32LE(index * 4);
const channels = color => [color & 255, (color >>> 8) & 255, (color >>> 16) & 255, color >>> 24];
const cyan = color => { const [r, g, b, a] = channels(color); return a > 0 && Math.min(g, b) - r >= 12; };
function magenta(color, strong) {
  const [r, g, b, a] = channels(color);
  if (!a || b < r * .72 || r < b * .72) return false;
  return strong ? r >= 160 && b >= 160 && g <= 120 && Math.min(r, b) - g >= 90
    : r >= 24 && b >= 24 && g <= 120 && Math.min(r, b) - g >= 20;
}
function samePixels(a, b, label) {
  same(a.length, b.length, label + ': dimensions');
  for (let i = 0; i < a.length; i += 4) {
    if (a[i + 3] !== b[i + 3] || a[i + 3] && a.readUInt32LE(i) !== b.readUInt32LE(i)) throw new Error(label + `: RGBA differs at pixel ${i / 4}`);
  }
  checks++;
}
function checkFrameEyes(entry, width, height, label) {
  check(Array.isArray(entry.eyes) && entry.eyes.length === 4 && Array.isArray(entry.eyeModeByFrame) && entry.eyeModeByFrame.length === 4, label + ': four eye layouts and modes');
  entry.eyes.forEach((anchors, frame) => {
    const mode = entry.eyeModeByFrame[frame];
    check(modes.has(mode) && Array.isArray(anchors) && (mode === 'shared' ? anchors.length >= 1 && anchors.length <= 2 : anchors.length === 0), label + ': eye mode/anchor agreement');
    for (const a of anchors) check(integer(a.x, 0, width) && integer(a.y, 0, height) && integer(a.width, 16, width) && integer(a.height, 16, height)
      && a.width % 16 === 0 && a.height % 16 === 0 && a.x + a.width <= width && a.y + a.height <= height, label + ': native bounded eyes');
  });
}
function checkRedrawnProof(proof, breed, frameCount = 64) {
  same([proof.version, proof.breed, proof.frames, proof.framesPerAction, proof.eyeStyles, proof.editableLayers], [3, breed, frameCount, 4, 30, 31], breed + ': v3 master contract');
  same(proof.sourceKind, 'independently-redrawn-64-frame-atlas', breed + ': source provenance');
  check(/^[a-f0-9]{64}$/i.test(proof.sourceSha256) && proof.sourceInput === 'source-input.png', breed + ': archived source hash');
  for (const flag of ['resized', 'quantized', 'fabricatedFrames', 'derivedFromOldPoses', 'mirroredFrames', 'rotatedFrames']) same(proof[flag], false, breed + ': ' + flag);
  check(proof.retainedArtworkRgbaUnchanged === true && proof.editableRgbaVerified === true && proof.bodyRegistration === 'integer translation only', breed + ': pixel preservation guarantees');
  check(integer(proof.width, 64, 2048) && integer(proof.height, 64, 2048), breed + ': bounded native canvas');
  check(integer(proof.originalWidth, 512, 32768) && integer(proof.originalHeight, 512, 32768), breed + ': source dimensions');
  same(proof.actionOrder, contract.actions.map(action => action.id), breed + ': action order');
  check(['transparent', 'border-magenta', 'transparent-artifacts'].includes(proof.backgroundMode), breed + ': supported explicit cleanup mode');
  if (proof.backgroundMode === 'transparent-artifacts') {
    check(integer(proof.fringeAlphaMax, 1, 48), breed + ': explicitly bounded near-transparent cleanup');
    const review = proof.reviewedFringeCleanup;
    check(review && review.alphaMax === proof.fringeAlphaMax && review.sourceSha256 === proof.sourceSha256 && review.connectivity === 8
      && typeof review.reason === 'string' && review.reason.trim().length > 0, breed + ': cleanup review belongs to this source');
  }
  same(Object.keys(proof.actions).sort(), contract.actions.map(a => a.id).sort(), breed + ': complete action set');
  same(Object.keys(proof.scenes).sort(), contract.actions.slice(0, 5).map(a => a.id).sort(), breed + ': exact compatibility scene set');
  same(Object.keys(proof.pngSha256).sort(), contract.actions.flatMap((a, i) => i < 5 ? [a.id, a.id + '-default', a.id + '-desktop'] : [a.id]).sort(), breed + ': exact output hashes');
  check(Array.isArray(proof.cellRectangles) && proof.cellRectangles.length === 64, breed + ': 64 source cells');
  for (const [i, cell] of proof.cellRectangles.entries()) {
    same([cell.index, cell.action, cell.actionFrame], [i + 1, contract.actions[Math.floor(i / 4)].id, i % 4 + 1], breed + ': source frame identity');
    check(integer(cell.x, 0, proof.originalWidth - 1) && integer(cell.y, 0, proof.originalHeight - 1)
      && integer(cell.width, 64, Math.min(proof.width, proof.originalWidth - cell.x))
      && integer(cell.height, 64, Math.min(proof.height, proof.originalHeight - cell.y))
      && Number.isInteger(cell.translation.x) && Number.isInteger(cell.translation.y), breed + ': bounded native source rectangle');
  }
  if (proof.gridMode === 'reviewed-source-rectangles') {
    check(proof.manualSourceCoverageVerified === true && /^[a-f0-9]{64}$/i.test(proof.eyeAnchorsSha256), breed + ': manual rectangles require source-bound review');
    same(proof.gridBoundaries, {xByRow: [], y: []}, breed + ': reviewed rectangles do not claim detected gutters');
    return;
  }
  check(proof.gridMode === undefined || proof.gridMode === 'detected-gutters', breed + ': supported source layout');
  check(proof.gridBoundaries?.y?.length === 9 && proof.gridBoundaries?.xByRow?.length === 8, breed + ': detected source gutters');
  const yCuts = proof.gridBoundaries.y;
  same([yCuts[0], yCuts[8]], [0, proof.originalHeight], breed + ': source row extent');
  for (let row = 0; row < 8; row++) {
    const xs = proof.gridBoundaries.xByRow[row];
    check(Array.isArray(xs) && xs.length === 9 && yCuts[row + 1] > yCuts[row], breed + ': nonempty source row');
    same([xs[0], xs[8]], [0, proof.originalWidth], breed + ': source column extent');
    for (let col = 0; col < 8; col++) {
      const i = row * 8 + col, cell = proof.cellRectangles[i];
      check(integer(xs[col], 0, proof.originalWidth) && integer(xs[col + 1], xs[col] + 1, proof.originalWidth)
        && integer(yCuts[row], 0, proof.originalHeight) && integer(yCuts[row + 1], yCuts[row] + 1, proof.originalHeight), breed + ': nonoverlapping source grid');
      same([cell.index, cell.action, cell.actionFrame, cell.x, cell.y, cell.width, cell.height],
        [i + 1, contract.actions[Math.floor(i / 4)].id, i % 4 + 1, xs[col], yCuts[row], xs[col + 1] - xs[col], yCuts[row + 1] - yCuts[row]], breed + ': source cell mapping');
      check(cell.width <= proof.width && cell.height <= proof.height && Number.isInteger(cell.translation.x) && Number.isInteger(cell.translation.y), breed + ': padding and integer registration');
    }
  }
}

function checkReviewedRectangles(source, proof, manual) {
  if (proof.gridMode !== 'reviewed-source-rectangles') return;
  check(manual?.sourceSha256 === proof.sourceSha256 && Array.isArray(manual.cells) && manual.cells.length === 64, proof.breed + ': exact source-bound rectangle review');
  const owners = new Uint8Array(source.info.width * source.info.height);
  const visible = color => (color >>> 24) !== 0
    && !(proof.backgroundMode === 'border-magenta' && magenta(color, true))
    && !(proof.backgroundMode === 'transparent-artifacts' && (color >>> 24) <= proof.fringeAlphaMax);
  for (const [i, cell] of proof.cellRectangles.entries()) {
    same(['x', 'y', 'width', 'height'].map(key => cell[key]), ['x', 'y', 'width', 'height'].map(key => manual.cells[i][key]), proof.breed + ': reviewed source rectangle ' + (i + 1));
    for (let y = cell.y; y < cell.y + cell.height; y++) for (let x = cell.x; x < cell.x + cell.width; x++) {
      const index = y * source.info.width + x;
      if (visible(rgba(source.data, index))) { check(owners[index] === 0, proof.breed + ': source artwork cannot occur in two frames'); owners[index] = i + 1; }
    }
  }
  for (let i = 0; i < owners.length; i++) if (visible(rgba(source.data, i))) check(owners[i] !== 0, proof.breed + ': reviewed rectangles cannot omit visible source artwork');
}

// Reconstruct only explicitly permitted cleanup, independently from its audit.
// A proof cannot authorize erasing a limb, painting pads, or moving body parts.
function sourceFrame(source, proof, rect, manual) {
  const { width, height } = proof, cell = Buffer.alloc(width * height * 4);
  for (let y = 0; y < rect.height; y++) for (let x = 0; x < rect.width; x++) {
    const value = rgba(source.data, (rect.y + y) * source.info.width + rect.x + x);
    if ((value >>> 24) && !(proof.backgroundMode === 'border-magenta' && magenta(value, true))) cell.writeUInt32LE(value, (y * width + x) * 4);
  }
  function cleanup(field, candidate, enabled) {
    const expected = new Map(), queue = [], visited = new Uint8Array(width * height);
    const visit = (x, y) => {
      if (x < 0 || y < 0 || x >= width || y >= height) return;
      const index = y * width + x;
      if (visited[index]) return; visited[index] = 1;
      const color = rgba(cell, index);
      if (!(color >>> 24) || candidate(color)) queue.push(index);
    };
    if (enabled) {
      for (let i = 0; i < width * height; i++) if (!(rgba(cell, i) >>> 24)) visit(i % width, Math.floor(i / width));
      for (let head = 0; head < queue.length; head++) {
        const index = queue[head], color = rgba(cell, index), x = index % width, y = Math.floor(index / width);
        if (candidate(color)) { expected.set(index, color); cell.writeUInt32LE(0, index * 4); }
        for (let yy = y - 1; yy <= y + 1; yy++) for (let xx = x - 1; xx <= x + 1; xx++) visit(xx, yy);
      }
    }
    const audit = rect[field] ?? [];
    same(audit.length, expected.size, rect.action + ': complete ' + field + ' audit');
    for (const edit of audit) {
      const index = edit.y * width + edit.x;
      check(expected.get(index) === (edit.before >>> 0), rect.action + ': independently bounded ' + field);
      expected.delete(index);
    }
    same(expected.size, 0, rect.action + ': no missing cleanup pixels');
  }
  cleanup('transparentArtifactEdits', p => (p >>> 24) > 0 && (p >>> 24) <= proof.fringeAlphaMax, proof.backgroundMode === 'transparent-artifacts');
  cleanup('outerMagentaEdits', p => magenta(p, false), proof.backgroundMode === 'border-magenta');
  const changes = rect.markerEdits ?? [], regions = rect.markerRegions ?? [];
  const seen = new Set();
  for (const edit of changes) {
    const index = edit.y * width + edit.x, before = rgba(cell, index);
    check(integer(edit.x, 0, rect.width - 1) && integer(edit.y, 0, rect.height - 1) && !seen.has(index)
      && before === (edit.before >>> 0), rect.action + ': exact audited source pixel');
    seen.add(index);
    const sentinel = regions.find(r => r.kind === 'cyan-eye-sentinel' && edit.x >= r.repair.left && edit.x <= r.repair.right && edit.y >= r.repair.top && edit.y <= r.repair.bottom && (r.fill >>> 0) === (edit.after >>> 0));
    // The importer repairs sentinels before optional closed-eye fringe regions.
    // A reviewed rectangle can overlap that repair; its existence cannot turn
    // an earlier fur replacement into a claimed grayscale neutralization.
    const neutral = !sentinel && regions.find(r => r.kind === 'reviewed-closed-eye-neutralization' && edit.x >= r.repair.left && edit.x <= r.repair.right && edit.y >= r.repair.top && edit.y <= r.repair.bottom);
    if (neutral) {
      const box = neutral.repair, authorized = manual?.frames?.[rect.index]?.cyanNeutralizeRegions?.some(region => ['left', 'top', 'right', 'bottom'].every(key => region[key] === box[key]));
      check(authorized && neutral.sourceSha256 === proof.sourceSha256 && box.right - box.left <= 32 && box.bottom - box.top <= 32
        && box.left >= 0 && box.top >= 0 && box.right < rect.width && box.bottom < rect.height && cyan(before), rect.action + ': source-bound reviewed closed-eye cleanup');
      const [r, g, b, a] = channels(before), gray = Math.floor(r * .2126 + g * .7152 + b * .0722 + .5);
      same(channels(edit.after >>> 0), [gray, gray, gray, a], rect.action + ': preserve closed-eye luminance and alpha');
      continue;
    }
    const region = sentinel;
    check(!!region && region.kind === 'cyan-eye-sentinel'
      && region.repair.left >= Math.max(0, region.core.left - 4) && region.repair.right <= region.core.right + 4
      && region.repair.top >= Math.max(0, region.core.top - 4) && region.repair.bottom <= region.core.bottom + 4,
    rect.action + ': cyan repair stays around the recorded sentinel');
    const inCore = edit.x >= region.core.left && edit.x <= region.core.right && edit.y >= region.core.top && edit.y <= region.core.bottom;
    check(cyan(before) || inCore && region.coreIncludesEnclosedInk === true, rect.action + ': non-cyan ink is confined to the sentinel core');
    const [r, g, b, a] = channels(edit.after >>> 0);
    check(a >= 240 && Math.min(g, b) - r < 12 && !magenta(edit.after >>> 0, false), rect.action + ': clean near-opaque replacement fur');
    let observedFill = false, coreFound = false;
    const box = region.repair;
    for (let yy = Math.max(0, box.top - 3); yy <= Math.min(rect.height - 1, box.bottom + 3); yy++) for (let xx = Math.max(0, box.left - 3); xx <= Math.min(rect.width - 1, box.right + 3); xx++) {
      const p = rgba(cell, yy * width + xx);
      if ((xx < box.left || xx > box.right || yy < box.top || yy > box.bottom) && p === (edit.after >>> 0)) observedFill = true;
      const [cr, cg, cb, ca] = channels(p);
      if (xx >= region.core.left && xx <= region.core.right && yy >= region.core.top && yy <= region.core.bottom && ca >= 128 && cg >= 150 && cb >= 150 && cr <= 110 && Math.min(cg, cb) - cr >= 90) coreFound = true;
    }
    // All marker edits are checked against the untouched cleanup result below.
    check(observedFill && coreFound, rect.action + ': sentinel and sampled fur exist in source');
  }
  for (const edit of changes) cell.writeUInt32LE(edit.after >>> 0, (edit.y * width + edit.x) * 4);
  const registered = Buffer.alloc(cell.length); let visible = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const color = rgba(cell, y * width + x); if (!(color >>> 24)) continue;
    const xx = x + rect.translation.x, yy = y + rect.translation.y;
    check(integer(xx, 0, width - 1) && integer(yy, 0, height - 1), rect.action + ': retained source cannot be clipped');
    registered.writeUInt32LE(color, (yy * width + xx) * 4); visible++;
  }
  same(visible, rect.retainedVisiblePixels, rect.action + ': retained pixel count');
  check(visible > 200, rect.action + ': nonempty native pose');
  return registered;
}

function inspectMaster(file, proof, count, expectedFrames, eyes) {
  const bytes = readVerified(file), header = asepriteHeader(file);
  same(header, { frames: count, width: proof.width, height: proof.height, depth: 32 }, 'native Aseprite master');
  same(bytes.readUInt32LE(0), bytes.length, 'complete Aseprite file length');
  let offset = 128, layerCount = 0; const frames = [], tags = [];
  for (let frame = 0; frame < count; frame++) {
    const end = offset + bytes.readUInt32LE(offset), cells = new Map();
    same(bytes.readUInt16LE(offset + 4), 0xf1fa, 'Aseprite frame magic');
    same(bytes.readUInt16LE(offset + 8), contract.actions[Math.floor(frame / 4)].frameMs, 'Aseprite frame duration');
    let chunks = bytes.readUInt16LE(offset + 6); if (chunks === 0xffff) chunks = bytes.readUInt32LE(offset + 12); offset += 16;
    for (let n = 0; n < chunks; n++) {
      const length = bytes.readUInt32LE(offset), type = bytes.readUInt16LE(offset + 4), b = offset + 6;
      check(length >= 6 && offset + length <= end, 'bounded editable chunk');
      if (type === 0x2004) {
        const nameLength = bytes.readUInt16LE(b + 16), name = bytes.toString('utf8', b + 18, b + 18 + nameLength);
        if (layerCount > 0) same(name, `Eyes - ruby-eye-${String(layerCount).padStart(2, '0')}`, 'stable editable eye layer');
        same((bytes.readUInt16LE(b) & 1) !== 0, layerCount < 2, 'default body/eye visibility'); layerCount++;
      }
      if (type === 0x2018) {
        let p = b + 10;
        for (let i = 0; i < bytes.readUInt16LE(b); i++) {
          const nameLength = bytes.readUInt16LE(p + 17);
          tags.push({ first: bytes.readUInt16LE(p), last: bytes.readUInt16LE(p + 2), name: bytes.toString('utf8', p + 19, p + 19 + nameLength) });
          p += 19 + nameLength;
        }
      }
      if (type === 0x2005) {
        const layer = bytes.readUInt16LE(b), kind = bytes.readUInt16LE(b + 7);
        check(!cells.has(layer) && layer < 31 && [0, 1, 2].includes(kind), 'unique editable native cel');
        const cell = { x: bytes.readInt16LE(b + 2), y: bytes.readInt16LE(b + 4), kind };
        same(bytes[b + 6], 255, 'cel opacity retains native RGBA');
        if (kind === 1) { cell.link = bytes.readUInt16LE(b + 16); check(cell.link < frame, 'backward cel link only'); }
        else {
          cell.width = bytes.readUInt16LE(b + 16); cell.height = bytes.readUInt16LE(b + 18); cell.data = bytes.subarray(b + 20, offset + length);
          check(cell.x >= 0 && cell.y >= 0 && cell.x + cell.width <= proof.width && cell.y + cell.height <= proof.height, 'native cel bounds');
        }
        cells.set(layer, cell);
      }
      offset += length;
    }
    same(offset, end, 'Aseprite frame complete'); frames.push(cells);
  }
  same(offset, bytes.length, 'all Aseprite bytes parsed'); same(layerCount, 31, 'body plus thirty eye layers');
  same(tags, contract.actions.slice(0, count / 4).map((a, i) => ({ first: i * 4, last: i * 4 + 3, name: a.id })), 'all named four-frame tags');
  function decode(frame, layer) {
    let cel = frames[frame].get(layer); const result = Buffer.alloc(proof.width * proof.height * 4);
    if (!cel) return result;
    const x = cel.x, y = cel.y;
    while (cel.kind === 1) { frame = cel.link; cel = frames[frame].get(layer); check(!!cel, 'linked cel exists'); }
    const pixels = cel.kind === 2 ? zlib.inflateSync(cel.data) : cel.data;
    same(pixels.length, cel.width * cel.height * 4, 'decoded cel byte count');
    check(x >= 0 && y >= 0 && x + cel.width <= proof.width && y + cel.height <= proof.height, 'linked cel position stays in frame');
    for (let row = 0; row < cel.height; row++) pixels.copy(result, ((y + row) * proof.width + x) * 4, row * cel.width * 4, (row + 1) * cel.width * 4);
    return result;
  }
  for (let frame = 0; frame < count; frame++) {
    samePixels(decode(frame, 0), expectedFrames[frame], 'editable body equals source cell ' + frame);
    const action = proof.actions[contract.actions[Math.floor(frame / 4)].id];
    for (let style = 0; style < 30; style++) samePixels(decode(frame, style + 1), renderEyeLayer(proof, action.eyes[frame % 4], eyes[style]), 'editable eye layer ' + style + '/' + frame);
  }
}
function renderEyeLayer(proof, anchors, eye) {
  const image = Buffer.alloc(proof.width * proof.height * 4);
  anchors.forEach((anchor, side) => {
    for (let y = 0; y < anchor.height; y++) for (let x = 0; x < anchor.width; x++) {
      const color = rgba(eye.data, Math.floor(y * 16 / anchor.height) * 32 + side * 16 + Math.floor(x * 16 / anchor.width));
      if (color >>> 24) image.writeUInt32LE(color, ((anchor.y + y) * proof.width + anchor.x + x) * 4);
    }
  });
  return image;
}
async function rawPng(file) { return sharp(readVerified(file), { limitInputPixels: 100_000_000 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); }
async function verifySourceHistory(directory, breed, proof, core, source) {
  for (const field of ['importerSha256', 'importerSource', 'sourceAssembly', 'sourceAssemblySha256']) same(core[field], proof[field], breed + ': matching provenance ' + field);
  if (proof.importerSource !== undefined) {
    same(proof.importerSource, 'importer-source.lua', breed + ': fixed archived importer path');
    same(digest(path.join(directory, proof.importerSource)), proof.importerSha256?.toLowerCase(), breed + ': exact historical importer snapshot');
  }
  if (proof.sourceAssembly === undefined && proof.sourceAssemblySha256 === undefined) return;
  same(proof.sourceAssembly, 'source-assembly.json', breed + ': fixed source assembly audit path');
  const auditPath = path.join(directory, 'source-assembly.json');
  same(digest(auditPath), proof.sourceAssemblySha256?.toLowerCase(), breed + ': immutable source assembly audit');
  const originalAudit = path.join(root, 'local-assets/work/ruby-round-v3/originals', breed + '.assembly.json');
  same(digest(originalAudit), proof.sourceAssemblySha256.toLowerCase(), breed + ': original assembly audit archived unchanged');
  const audit = readJson(auditPath);
  same(audit.finalSha256?.toLowerCase(), proof.sourceSha256.toLowerCase(), breed + ': assembled atlas is this source');
  check(audit.resized === false && audit.rotated === false && ['Native RGBA source-cell replacement only', 'Native source-cell replacement', 'Native RGBA frame assembly only'].includes(audit.method)
    && typeof audit.tool === 'string' && (audit.tool === 'Aseprite' || audit.tool.startsWith('Aseprite ')) && typeof audit.reason === 'string' && audit.reason.trim().length > 0,
  breed + ': source assembly permits only a recorded native cell copy');
  const correctedFrames = Array.isArray(audit.correctedFrames) ? audit.correctedFrames : [audit.correctedFrames];
  check(correctedFrames.length > 0 && correctedFrames.every(n => integer(n, 1, 64))
    && new Set(correctedFrames).size === correctedFrames.length, breed + ': explicit corrected source frames');
  if (audit.method === 'Native RGBA frame assembly only') {
    check(audit.nativeRgbaVerified === true && Array.isArray(audit.sources) && audit.sources.length >= 1 && audit.sources.length <= 64
      && Array.isArray(audit.frameMappings) && audit.frameMappings.length === 64, breed + ': complete native frame assembly audit');
    const base = path.join(root, 'local-assets/work/ruby-round-v3'), sourceHashes = new Set(), inputs = [];
    for (const input of audit.sources) {
      check(typeof input.path === 'string' && !path.isAbsolute(input.path) && /^[a-f0-9]{64}$/i.test(input.sha256), breed + ': relative hash-bound assembly source');
      const file = path.resolve(base, input.path), relative = path.relative(base, file);
      check(relative && !relative.startsWith('..') && !path.isAbsolute(relative) && !sourceHashes.has(input.sha256.toLowerCase()), breed + ': unique assembly source stays within v3 workspace');
      same(fs.realpathSync(file).toLowerCase(), file.toLowerCase(), breed + ': assembly source cannot redirect through a link');
      same(digest(file), input.sha256.toLowerCase(), breed + ': exact native assembly source bytes');
      sourceHashes.add(input.sha256.toLowerCase()); inputs.push(await rawPng(file));
    }
    same(audit.frameMappings.filter(mapping => mapping.sourceIndex !== 0).map(mapping => mapping.frame).sort((a, b) => a - b),
      [...correctedFrames].sort((a, b) => a - b), breed + ': corrected-frame history agrees with native source selection');
    checkFrameAssembly(source, inputs, audit.frameMappings, breed);
    return;
  }
  const r = audit.rectangle;
  check(r && integer(r.x, 0, source.info.width - 1) && integer(r.y, 0, source.info.height - 1)
    && integer(r.width, 1, source.info.width - r.x) && integer(r.height, 1, source.info.height - r.y), breed + ': bounded source replacement rectangle');
  const corrections = path.join(root, 'local-assets/work/ruby-round-v3/corrections');
  const files = fs.readdirSync(corrections).filter(name => name.startsWith(breed + '-') && name.endsWith('.png')).map(name => path.join(corrections, name));
  const byHash = new Map(files.map(file => [digest(file), file]));
  const beforeFile = byHash.get(audit.sourceSha256?.toLowerCase()), correctionFile = byHash.get(audit.correctionSha256?.toLowerCase());
  check(beforeFile && correctionFile, breed + ': original and independent correction files preserved by exact hashes');
  const before = await rawPng(beforeFile), corrected = await rawPng(correctionFile);
  same([before.info.width, before.info.height, corrected.info.width, corrected.info.height],
    [source.info.width, source.info.height, source.info.width, source.info.height], breed + ': assembly retains full native source canvases');
  for (let y = 0; y < source.info.height; y++) for (let x = 0; x < source.info.width; x++) {
    const expected = x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height ? corrected : before;
    if (rgba(source.data, y * source.info.width + x) !== rgba(expected.data, y * source.info.width + x)) throw new Error(breed + ': assembled source changed unapproved RGBA at ' + x + ',' + y);
  }
  checks++;
}
function checkFrameAssembly(output, inputs, mappings, breed) {
  check(mappings.length === 64, breed + ': all64 native assembly mappings');
  const expected = Buffer.alloc(output.data.length), owners = new Uint8Array(output.info.width * output.info.height), copies = new Set();
  for (const [index, mapping] of mappings.entries()) {
    check(mapping.frame === index + 1 && integer(mapping.sourceIndex, 0, inputs.length - 1), breed + ': ordered source frame mapping');
    const input = inputs[mapping.sourceIndex], from = mapping.sourceRectangle, to = mapping.destinationRectangle;
    for (const [rect, image] of [[from, input], [to, output]]) check(rect && integer(rect.x, 0, image.info.width - 1) && integer(rect.y, 0, image.info.height - 1)
      && integer(rect.width, 1, image.info.width - rect.x) && integer(rect.height, 1, image.info.height - rect.y), breed + ': bounded native assembly rectangle');
    same([to.width, to.height], [from.width, from.height], breed + ': source assembly cannot resample artwork');
    const copyKey = [mapping.sourceIndex, from.x, from.y, from.width, from.height].join(':');
    check(!copies.has(copyKey), breed + ': source assembly cannot duplicate a source pose'); copies.add(copyKey);
    for (let y = 0; y < from.height; y++) for (let x = 0; x < from.width; x++) {
      const target = (to.y + y) * output.info.width + to.x + x;
      check(owners[target] === 0, breed + ': frame assembly rectangles cannot overlap'); owners[target] = index + 1;
      expected.writeUInt32LE(rgba(input.data, (from.y + y) * input.info.width + from.x + x), target * 4);
    }
  }
  // Compare every byte, including RGB under alpha0: outside the reviewed native
  // copies the only permitted atlas padding is transparent RGBA0.
  check(expected.equals(output.data), breed + ': final atlas is exactly64 native copies with transparent padding');
}
function stripFrame(image, width, height, frame) {
  const result = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) image.data.copy(result, y * width * 4, (y * image.info.width + frame * width) * 4, (y * image.info.width + (frame + 1) * width) * 4);
  return result;
}
async function verifyV3() {
  const requested = process.argv.find(arg => arg.startsWith('--breed='))?.slice(8), staged = process.argv.includes('--staged');
  check(!requested || breeds.includes(requested), 'registered requested breed');
  const chosen = requested ? [requested] : breeds, hashes = new Set(), eyes = [];
  const requireVisual = process.argv.includes('--require-visual-review'), visualReviews = new Map();
  const reviewDir = path.join(root, 'local-assets/work/ruby-round-v3/review');
  let reviewInventory;
  if (requireVisual) {
    const report = readJson(path.join(reviewDir, 'visual-review.json'));
    check(report.version === 1 && Array.isArray(report.reviews), 'manual visual review report schema');
    for (const review of report.reviews) {
      check(breeds.includes(review.breed) && !visualReviews.has(review.breed), 'registered unique visual review breed');
      visualReviews.set(review.breed, review);
    }
    if (!requested) same([...visualReviews.keys()].sort(), [...breeds].sort(), 'all thirty breeds require explicit visual inspection');
    reviewInventory = readJson(path.join(reviewDir, 'review-inventory.json'));
  }
  for (let style = 1; style <= 30; style++) {
    const name = `eye-${String(style).padStart(2, '0')}.png`, file = path.join(root, 'local-assets/work/ruby-round-v3/eyes', name);
    const image = await rawPng(file); same([image.info.width, image.info.height], [32, 16], 'native shared eye pair'); eyes.push(image);
    if (staged) same(digest(path.join(root, 'local-assets/site/images/ruby-round-v1/eyes', name)), digest(file), 'staged eye equals editable eye source');
  }
  same(new Set(eyes.map(image => hashBytes(image.data))).size, 30, 'thirty distinct shared eyes');
  for (const breed of chosen) {
    const directory = path.join(root, 'local-assets/work/ruby-round-v3/processed', breed);
    const proof = readJson(path.join(directory, 'motion-conversion.json'));
    const core = readJson(path.join(directory, 'conversion.json'));
    checkRedrawnProof(proof, breed); checkRedrawnProof(core, breed, 20);
    if (requireVisual) {
      const panelHashes = Object.fromEntries(visualPanels.map(panel => [panel, digest(path.join(reviewDir, `${breed}-${panel.replace('actions', 'actions-')}.png`))]));
      const actualMaster = digest(path.join(directory, `${breed}-16-actions.aseprite`));
      const actualSource = digest(path.join(root, 'local-assets/work/ruby-round-v3/originals', breed + '.png'));
      checkVisualReview(visualReviews.get(breed), breed, actualMaster, actualSource, panelHashes);
      const rendered = reviewInventory.breeds?.filter(entry => entry.breed === breed);
      check(rendered?.length === 1 && rendered[0].masterSha256 === actualMaster, breed + ': reviewed previews derive from the current master');
    }
    for (const key of ['sourceSha256', 'actions', 'scenes', 'cellRectangles', 'pngSha256', 'gridMode', 'manualSourceCoverageVerified', 'eyeAnchorsSha256']) same(core[key], proof[key], breed + ': compatibility comes from the same new atlas');
    check(!hashes.has(proof.sourceSha256), breed + ': source atlas differs from other breeds'); hashes.add(proof.sourceSha256);
    const original = path.join(root, 'local-assets/work/ruby-round-v3/originals', breed + '.png');
    for (const source of [original, path.join(directory, 'source-input.png')]) same(digest(source), proof.sourceSha256.toLowerCase(), breed + ': immutable source SHA256');
    const source = await rawPng(original); same([source.info.width, source.info.height], [proof.originalWidth, proof.originalHeight], breed + ': source dimensions');
    await verifySourceHistory(directory, breed, proof, core, source);
    let manual;
    if (proof.eyeAnchorsSha256) {
      const manualFile = path.join(directory, 'eye-anchors.json');
      same(digest(manualFile), proof.eyeAnchorsSha256, breed + ': reviewed eye cleanup hash');
      manual = readJson(manualFile); same(manual.sourceSha256, proof.sourceSha256, breed + ': reviewed eye cleanup source');
    }
    checkReviewedRectangles(source, proof, manual);
    const expected = proof.cellRectangles.map(rect => sourceFrame(source, proof, rect, manual));
    if (requireVisual) {
      for (let panel = 0; panel < visualPanels.length; panel++) {
        const image = await rawPng(path.join(reviewDir, `${breed}-${visualPanels[panel].replace('actions', 'actions-')}.png`));
        same([image.info.width, image.info.height], [proof.width * 4, proof.height * 4], breed + ': native review panel size');
        for (let cell = 0; cell < 16; cell++) {
          const index = panel * 16 + cell, action = proof.actions[contract.actions[Math.floor(index / 4)].id];
          const eye = renderEyeLayer(proof, action.eyes[index % 4], eyes[0]), composed = Buffer.from(expected[index]);
          for (let pixel = 0; pixel < composed.length; pixel += 4) if (eye[pixel + 3]) eye.copy(composed, pixel, pixel, pixel + 4);
          const actual = Buffer.alloc(composed.length), x = cell % 4 * proof.width, y = Math.floor(cell / 4) * proof.height;
          for (let row = 0; row < proof.height; row++) image.data.copy(actual, row * proof.width * 4, ((y + row) * image.info.width + x) * 4, ((y + row) * image.info.width + x + proof.width) * 4);
          samePixels(actual, composed, breed + ': reviewed panel contains exact master frame ' + (index + 1));
        }
      }
    }
    for (const [index, definition] of contract.actions.entries()) {
      const action = proof.actions[definition.id], label = breed + '/' + definition.id;
      same([action.id, action.frames, action.frameMs, action.kind, action.source, action.name, action.description],
        [definition.id, 4, definition.frameMs, 'redrawn', 'independently-redrawn-atlas', definition.name, definition.description], label + ': action metadata');
      same(action.png, `/images/ruby-round-v1/${breed}/${index < 5 ? '' : 'actions/'}${definition.id}.png`, label + ': finite URL');
      checkFrameEyes(action, proof.width, proof.height, label);
      if (definition.id === 'walk-up') same(action.eyeModeByFrame, Array(4).fill('hidden'), label + ': back-facing frame eyes hidden');
      const file = path.join(directory, definition.id + '.png'); same(digest(file), proof.pngSha256[definition.id], label + ': PNG hash');
      const image = await rawPng(file); same([image.info.width, image.info.height], [proof.width * 4, proof.height], label + ': native strip');
      const frameHashes = new Set();
      for (let frame = 0; frame < 4; frame++) {
        const data = stripFrame(image, proof.width, proof.height, frame);
        samePixels(data, expected[index * 4 + frame], label + '/' + frame + ': source RGBA'); frameHashes.add(hashBytes(data));
        same(proof.cellRectangles[index * 4 + frame].eyeMode, action.eyeModeByFrame[frame], label + ': source expression retained');
      }
      check(frameHashes.size >= 2, label + ': changing independently drawn source frames');
      if (staged) same(digest(path.join(root, 'local-assets/site', action.png)), digest(file), label + ': staged PNG');
      if (index < 5) {
        const scene = proof.scenes[definition.id];
        for (const key of ['png', 'frames', 'frameMs', 'eyes', 'eyeMode', 'eyeModeByFrame']) same(scene[key], action[key], label + ': compatibility ' + key);
        same(scene.desktopFrames, definition.id === 'walk' ? 4 : 1, label + ': installed desktop frame count');
        same(scene.desktopPng, `/images/ruby-round-v1/${breed}/${definition.id}-desktop.png`, label + ': desktop URL');
        const defaultFile = path.join(directory, definition.id + '-default.png'), defaultImage = await rawPng(defaultFile);
        same(digest(defaultFile), proof.pngSha256[definition.id + '-default'], label + ': default-eye hash');
        same([defaultImage.info.width, defaultImage.info.height], [proof.width * 4, proof.height], label + ': default-eye strip');
        for (let frame = 0; frame < 4; frame++) {
          const eye = renderEyeLayer(proof, action.eyes[frame], eyes[0]), composed = Buffer.from(expected[index * 4 + frame]);
          for (let pixel = 0; pixel < composed.length; pixel += 4) if (eye[pixel + 3]) { check(eye[pixel + 3] === 255, label + ': opaque shared eye source'); eye.copy(composed, pixel, pixel, pixel + 4); }
          samePixels(stripFrame(defaultImage, proof.width, proof.height, frame), composed, label + ': default expression exactly composed');
        }
        const desktopFile = path.join(directory, definition.id + '-desktop.png'), desktop = await rawPng(desktopFile);
        same(digest(desktopFile), proof.pngSha256[definition.id + '-desktop'], label + ': desktop hash');
        same([desktop.info.width, desktop.info.height], [proof.width * scene.desktopFrames, proof.height], label + ': desktop native canvas');
        for (let frame = 0; frame < scene.desktopFrames; frame++) samePixels(stripFrame(desktop, proof.width, proof.height, frame), stripFrame(defaultImage, proof.width, proof.height, frame), label + ': compatibility frame is source default');
        if (staged) for (const suffix of ['-default', '-desktop']) same(digest(path.join(root, `local-assets/site/images/ruby-round-v1/${breed}/${definition.id}${suffix}.png`)), proof.pngSha256[definition.id + suffix], label + ': staged compatibility PNG');
      }
    }
    for (const [record, frames, suffix] of [[proof, 64, '-16-actions'], [core, 20, '']]) {
      const name = breed + suffix + '.aseprite', file = path.join(directory, name);
      same(record.aseprite, `/downloads/ruby-round-v1/${name}`, breed + ': fixed master URL'); same(digest(file), record.asepriteSha256, breed + ': master hash');
      inspectMaster(file, proof, frames, expected, eyes);
      if (staged) same(digest(path.join(root, 'local-assets/site/downloads/ruby-round-v1', name)), record.asepriteSha256, breed + ': staged master');
    }
    same(proof.legacyAsepriteSha256, core.asepriteSha256, breed + ': compatibility master provenance');
    same(core.motionAsepriteSha256, proof.asepriteSha256, breed + ': full master provenance');
    console.log(`VERIFIED ${breed}: 64 new source frames, 16 actions, 31 editable layers, compatibility exports`);
  }
  if (staged) same(digest(path.join(root, 'local-assets/site/downloads/ruby-round-v1/ruby-round-eyes.aseprite')), digest(path.join(root, 'local-assets/work/ruby-round-v3/eyes/ruby-round-eyes.aseprite')), 'staged shared eye master');
  checkInputsUnchanged();
  const reportPath = process.argv.find(arg => arg.startsWith('--verification-report='))?.slice('--verification-report='.length);
  if (reportPath) {
    const output = path.resolve(reportPath), relative = path.relative(root, output);
    check(relative && !relative.startsWith('..') && !path.isAbsolute(relative) && !verifiedInputs.has(output), 'verification report stays inside workspace and cannot replace an input');
    fs.writeFileSync(output, JSON.stringify({version: 1, complete: !requested, sourceVersion: 3, visualReviewRequired: requireVisual, staged,
      inputs: [...verifiedInputs].map(([file, sha256]) => ({path: path.relative(root, file).replaceAll('\\', '/'), sha256}))}));
  }
  console.log(`PASS ${checks} independent v3 checks: ${chosen.length} breeds, ${chosen.length * 64} source frames${staged ? ', staged files verified' : ''}.`);
}

async function verifyRegressionFixtures() {
  const sourceSha256 = 'a'.repeat(64), white = 0xffeeeeee, blue = 0xff998833;
  const source = {info: {width: 64, height: 64}, data: Buffer.alloc(64 * 64 * 4)};
  for (let y = 2; y < 62; y++) for (let x = 2; x < 62; x++) source.data.writeUInt32LE(white, (y * 64 + x) * 4);
  source.data.writeUInt32LE(blue, (10 * 64 + 10) * 4);
  const [r, g, b] = channels(blue), gray = Math.floor(r * .2126 + g * .7152 + b * .0722 + .5), after = (0xff000000 | gray << 16 | gray << 8 | gray) >>> 0;
  const box = {left: 10, top: 10, right: 10, bottom: 10};
  const proof = {width: 64, height: 64, sourceSha256, backgroundMode: 'transparent'};
  const cell = {index: 1, action: 'idle', x: 0, y: 0, width: 64, height: 64, translation: {x: 0, y: 0}, retainedVisiblePixels: 3600,
    markerEdits: [{x: 10, y: 10, before: blue, after}], markerRegions: [{kind: 'reviewed-closed-eye-neutralization', sourceSha256, repair: box}]};
  const manual = {sourceSha256, frames: {1: {cyanNeutralizeRegions: [box]}}};
  same(rgba(sourceFrame(source, proof, cell, manual), 10 * 64 + 10), after, 'one-based source frame review permits exactly its cyan pixel');
  for (const unauthorized of [{sourceSha256, frames: {0: manual.frames[1]}}, {sourceSha256, frames: {2: manual.frames[1]}}, {sourceSha256, frames: {1: {cyanNeutralizeRegions: [{...box, left: 11}]}}}]) {
    assert.throws(() => sourceFrame(source, proof, cell, unauthorized), /source-bound reviewed closed-eye cleanup/); checks++;
  }
  assert.throws(() => sourceFrame(source, proof, {...cell, markerEdits: [{x: 10, y: 10, before: blue, after: white}]}, manual), /preserve closed-eye luminance and alpha/); checks++;
  const marker = 0xffdddd44, overlapSource = {info: source.info, data: Buffer.from(source.data)};
  overlapSource.data.writeUInt32LE(marker, (10 * 64 + 10) * 4);
  const overlapCell = {...cell, markerEdits: [{x: 10, y: 10, before: marker, after: white}], markerRegions: [
    {kind: 'cyan-eye-sentinel', core: box, repair: {left: 6, top: 6, right: 14, bottom: 14}, fill: white}, ...cell.markerRegions]};
  same(rgba(sourceFrame(overlapSource, proof, overlapCell, manual), 10 * 64 + 10), white, 'overlapping manual rectangle does not reclassify an earlier sentinel repair');
  const atlas = {info: {width: 512, height: 512}, data: Buffer.alloc(512 * 512 * 4)};
  const cells = Array.from({length: 64}, (_, i) => ({x: i % 8 * 64, y: Math.floor(i / 8) * 64, width: 64, height: 64}));
  for (const c of cells) atlas.data.writeUInt32LE(white, ((c.y + 10) * 512 + c.x + 10) * 4);
  const layout = {...proof, breed: 'fixture', gridMode: 'reviewed-source-rectangles', cellRectangles: cells};
  checkReviewedRectangles(atlas, layout, {sourceSha256, cells});
  assert.throws(() => checkReviewedRectangles(atlas, layout, {sourceSha256: 'b'.repeat(64), cells}), /source-bound rectangle review/); checks++;
  const duplicate = cells.map(c => ({...c})); duplicate[1] = {...duplicate[0]};
  assert.throws(() => checkReviewedRectangles(atlas, {...layout, cellRectangles: duplicate}, {sourceSha256, cells: duplicate}), /cannot occur in two frames/); checks++;
  const omitted = cells.map(c => ({...c})); omitted[0].x += 16; omitted[0].width -= 16;
  assert.throws(() => checkReviewedRectangles(atlas, {...layout, cellRectangles: omitted}, {sourceSha256, cells: omitted}), /cannot omit visible source artwork/); checks++;
  assert.throws(() => checkReviewedRectangles(atlas, layout, {sourceSha256, cells: duplicate}), /reviewed source rectangle/); checks++;
  const assembled = {info: {width: 8, height: 8}, data: Buffer.alloc(8 * 8 * 4)};
  for (let i = 0; i < 64; i++) assembled.data.writeUInt32LE(white, i * 4);
  const mappings = Array.from({length: 64}, (_, i) => ({frame: i + 1, sourceIndex: 0, sourceRectangle: {x: i % 8 * 64 + 10, y: Math.floor(i / 8) * 64 + 10, width: 1, height: 1}, destinationRectangle: {x: i % 8, y: Math.floor(i / 8), width: 1, height: 1}}));
  checkFrameAssembly(assembled, [atlas], mappings, 'fixture');
  const changed = {info: assembled.info, data: Buffer.from(assembled.data)}; changed.data[0] ^= 1;
  assert.throws(() => checkFrameAssembly(changed, [atlas], mappings, 'fixture'), /exactly64 native copies/); checks++;
  const overlap = structuredClone(mappings); overlap[1].destinationRectangle = overlap[0].destinationRectangle;
  assert.throws(() => checkFrameAssembly(assembled, [atlas], overlap, 'fixture'), /cannot overlap/); checks++;
  const resize = structuredClone(mappings); resize[0].sourceRectangle.width = 2;
  assert.throws(() => checkFrameAssembly(assembled, [atlas], resize, 'fixture'), /cannot resample/); checks++;
  const reused = structuredClone(mappings); reused[1].sourceRectangle = reused[0].sourceRectangle;
  assert.throws(() => checkFrameAssembly(assembled, [atlas], reused, 'fixture'), /cannot duplicate a source pose/); checks++;
  console.log(`PASS ${checks} independent verifier regression checks: one-based manual edits, exact luminance, source binding, duplicate and omitted source artwork.`);
}

(process.argv.includes('--self-test') ? verifyRegressionFixtures() : process.argv.includes('--source-version=v2') ? verifyV2() : verifyV3()).catch(error => { console.error(error.message); process.exitCode = 1; });
