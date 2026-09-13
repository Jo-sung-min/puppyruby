'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const { loadFrontend } = require('./frontend-loader.cjs');
const req = createRequire(path.resolve(__dirname, '../frontend/package.json'));
const React = req('react'), { renderToStaticMarkup } = req('react-dom/server'), sharp = req('sharp');
const fixture = { id: 'sp-01', code: 'SP01', name: '검증용 강아지', description: '분리된 눈 검증', width: 192, height: 192,
  png: '/images/soft-pixel-v1/sp-01/preview.png', body: '/images/soft-pixel-v1/sp-01/body.png',
  eyes: Object.fromEntries(['dot', 'bean', 'sparkle', 'sleep'].map(eye => [eye, `/images/soft-pixel-v1/sp-01/eyes-${eye}.png`])),
  aseprite: '/downloads/soft-pixel-v1/sp-01.aseprite', eyeAnchors: [{ x: 65, y: 60, rx: 8, ry: 8 }, { x: 125, y: 60, rx: 8, ry: 8 }] };
const lib = loadFrontend('src/lib/soft-pixel-candidates.ts', { './generated/soft-pixel-candidates.json': [fixture] });
const { SoftPixelDog } = loadFrontend('src/components/soft-pixel-dog.tsx', { '@/lib/soft-pixel-candidates': lib });
const { AdminSoftPixelPreview } = loadFrontend('src/components/account/admin-soft-pixel-preview.tsx');
const { dogStyles } = loadFrontend('src/lib/dog-styles.ts');
const realCatalog = loadFrontend('src/lib/soft-pixel-candidates.ts');
const { defaultAppearance, isDogStyleId } = loadFrontend('src/lib/dog-styles.ts');
const { parseAppearance } = loadFrontend('src/lib/dog-appearance.ts');
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };
const choice = { id: 'sp-01', eye: 'bean', color: '#30263B' };
check(JSON.stringify(lib.parseSoftPixelChoice(choice)) === JSON.stringify(choice), 'Explicit candidate and eye choice can be restored');
for (const invalid of [null, [], {}, { ...choice, id: 'classic' }, { ...choice, eye: 'missing' }, { ...choice, color: 'url(x)' }, { ...choice, color: '#fff' }])
  check(lib.parseSoftPixelChoice(invalid) === null, 'Malformed or unrelated saved browser choices cannot enter the gallery');
check(!dogStyles.some(style => /^sp-/.test(style.id)), 'Comparison candidates are not silently published to all breeds');
for (const eye of lib.softPixelEyes.map(item => item.id)) {
  for (const look of [{ x: 0, y: 0 }, { x: 1, y: -1 }, { x: 500, y: -999 }, { x: NaN, y: Infinity }]) {
    const offset = lib.softPixelEyeOffset(fixture, look, eye);
    check(Number.isInteger(offset.x) && Number.isInteger(offset.y) && Math.abs(offset.x) <= 3 && Math.abs(offset.y) <= 2, 'Gaze uses bounded whole pixels');
    if (eye === 'sleep') check(offset.x === 0 && offset.y === 0, 'Closed smiling eyes stay still');
    const svg = renderToStaticMarkup(React.createElement(SoftPixelDog, { candidate: fixture, eye, look }));
    check(svg.includes(fixture.body) && svg.includes(fixture.eyes[eye]) && !svg.includes(fixture.png), 'Live preview composites a body and the exact replaceable eye layer');
    check(!/NaN|Infinity/.test(svg), 'Malformed gaze cannot invalidate SVG');
  }
}
const sidebar = renderToStaticMarkup(React.createElement(AdminSoftPixelPreview, { candidate: fixture, eye: 'bean', color: '#30263B', look: { x: 0, y: 0 }, choice,
  busy: false, notice: '', onEye() {}, onColor() {}, onLook() {}, onChoose() {} }));
check(sidebar.includes('선택한 시안이에요') && sidebar.includes('눈동자 바꿔 보기'), 'Selected candidate exposes eye controls and its remembered choice');
check(!sidebar.includes('전체 견종에 적용') && !sidebar.includes('이 견종에만 적용'), 'Candidate preview cannot apply one Pomeranian drawing to unrelated breeds');
check(sidebar.includes(fixture.aseprite) && sidebar.includes(fixture.png), 'Editable and PNG downloads remain available');

(async () => {
  check(realCatalog.softPixelCandidates.length === 15, 'The completed comparison catalog contains all 15 real candidates');
  check(new Set(realCatalog.softPixelCandidates.map(candidate => candidate.id)).size === 15, 'Real candidate IDs are unique');
  for (const candidate of realCatalog.softPixelCandidates) {
    const savedChoice = { id: candidate.id, eye: 'sparkle', color: '#166AB0' };
    check(JSON.stringify(realCatalog.parseSoftPixelChoice(JSON.parse(JSON.stringify(savedChoice)))) === JSON.stringify(savedChoice), `${candidate.id} and its eye settings survive a browser-storage round trip`);
    check(!isDogStyleId(candidate.id), `${candidate.id} cannot be assigned as a public dog style`);
    assert.throws(() => parseAppearance({ ...defaultAppearance, defaultStyle: candidate.id })); checks++;
    const editable = fs.readFileSync(path.resolve(__dirname, '../local-assets/site' + candidate.aseprite));
    check(editable.readUInt16LE(4) === 0xa5e0 && editable.readUInt16LE(8) === candidate.width && editable.readUInt16LE(10) === candidate.height, `${candidate.id} links a real Aseprite file at its advertised dimensions`);
    for (const eye of realCatalog.softPixelEyes.map(item => item.id)) {
      const svg = renderToStaticMarkup(React.createElement(SoftPixelDog, { candidate, eye, color: '#30263B', look: { x: 1, y: -1 } }));
      check(svg.includes(candidate.body) && svg.includes(candidate.eyes[eye]) && svg.includes(`viewBox="0 0 ${candidate.width} ${candidate.height}"`), `${candidate.id}/${eye} uses its own actual aligned layers`);
      const png = fs.readFileSync(path.resolve(__dirname, '../local-assets/site' + candidate.eyes[eye]));
      check(png.readUInt32BE(16) === candidate.width && png.readUInt32BE(20) === candidate.height && png[25] === 6, `${candidate.id}/${eye} is an actual full-canvas RGBA layer`);
    }
  }
  const side = 192, body = Buffer.alloc(side * side * 4), eyes = Buffer.alloc(body.length);
  for (let p = 0; p < body.length; p += 4) { body[p] = 239; body[p + 1] = 202; body[p + 2] = 147; body[p + 3] = 255; }
  const pixel = (buffer, x, y, rgba) => rgba.forEach((value, channel) => { buffer[(y * side + x) * 4 + channel] = value; });
  for (const x of [65, 125]) { pixel(eyes, x, 60, [0, 0, 0, 255]); pixel(eyes, x + 1, 60, [255, 255, 255, 255]); }
  const bodyPng = await sharp(body, { raw: { width: side, height: side, channels: 4 } }).png().toBuffer();
  const eyesPng = await sharp(eyes, { raw: { width: side, height: side, channels: 4 } }).png().toBuffer();
  for (const color of ['#000000', '#30263B', '#166AB0', '#934626']) {
    let svg = renderToStaticMarkup(React.createElement(SoftPixelDog, { candidate: fixture, color, eye: 'bean' }));
    svg = svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')
      .replace(/href="[^"]+"/g, href => `href="data:image/png;base64,${(href.includes('body.png') ? bodyPng : eyesPng).toString('base64')}"`);
    const rendered = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer();
    const at = (x, y) => [...rendered.subarray((y * side + x) * 4, (y * side + x) * 4 + 4)];
    for (const x of [65, 125]) {
      const wanted = [1, 3, 5].map(start => parseInt(color.slice(start, start + 2), 16));
      check(at(x, 60).slice(0, 3).every((channel, index) => Math.abs(channel - wanted[index]) <= 1), 'Black pupil pixels take the chosen eye color');
      check(at(x + 1, 60).every(channel => channel === 255), 'White eye highlights stay white after recoloring');
    }
    check(JSON.stringify(at(80, 80)) === JSON.stringify([239, 202, 147, 255]), 'Eye recoloring leaves dog fur pixels unchanged');
  }
  console.log(`PASS: ${checks} soft-pixel admin checks; separate eyes, color fidelity, gaze bounds and candidate-only selection.`);
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
