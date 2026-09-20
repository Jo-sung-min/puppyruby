#!/usr/bin/env node
'use strict';

// Isolated Akita review only. Never reads the environment, updates a catalog or publishes artwork.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { createHash } = require('node:crypto');
const project = path.resolve(__dirname, '..');
const trial = path.join(project, 'local-assets/work/ruby-round-v4/akita-trial');
const review = path.join(trial, 'review');
const baselineRoot = path.join(trial, 'revision-2/final');
const newRoot = path.join(trial, 'final');
const eyeRoot = path.join(project, 'local-assets/site/images/ruby-round-v1/eyes');
const actions = ['idle', 'side', 'walk', 'happy', 'sleep', 'typing', 'petting', 'eat', 'belly', 'stretch', 'wag', 'scratch', 'walk-left', 'walk-right', 'walk-up', 'walk-down'];
const names = ['가만히 있기', '옆모습', '걷기', '반가워하기', '잠자기', '키보드 타이핑', '쓰다듬기', '밥 먹기', '배 뒤집고 눕기', '기지개 켜기', '꼬리 흔들기', '귀 긁기', '왼쪽 이동', '오른쪽 이동', '위쪽 이동', '아래쪽 이동'];
const eyeNames = ['기본 검은눈', '갈색 순둥눈', '파란 반짝눈', '초록 반짝눈', '금빛 눈', '분홍 사랑눈', '보랏빛 몽환눈', '쉬는 미소', '도도 반눈', '졸린 눈', '무표정 쿨눈', '초승달 웃음', '반짝 별눈', '동그란 아기눈', '호기심 눈', '새침한 눈', '장난기 눈', '슬픈 촉촉눈', '자신감 눈', '깜짝 큰눈', '윙크눈', '삐진 눈', '용맹한 눈', '온화한 눈', '청록 신비눈', '붉은 열정눈', '회색 차분눈', '쌍하트 눈', '까만 유리알눈', '힐링 순둥눈'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const isInteger = (number, min, max) => Number.isInteger(number) && number >= min && number <= max;

function boundedFile(root, relative) {
  const boundary = fs.realpathSync(root), candidate = path.resolve(root, relative), actual = fs.realpathSync(candidate);
  if (!actual.startsWith(boundary + path.sep) || path.relative(candidate, actual) !== '' || fs.lstatSync(candidate).isSymbolicLink()) throw new Error('Preview input must be a regular local file: ' + relative);
  const stat = fs.statSync(actual);
  if (!stat.isFile() || stat.size > 64 * 1024 * 1024) throw new Error('Preview input size/type rejected: ' + relative);
  return actual;
}

function pngDimensions(bytes) {
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('Invalid preview PNG');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function loadManifest(root, filename) {
  const source = JSON.parse(fs.readFileSync(boundedFile(root, filename), 'utf8'));
  if (!isInteger(source.width, 16, 1024) || !isInteger(source.height, 16, 1024) || !source.actions || typeof source.actions !== 'object') throw new Error('Expected width, height and 16 action definitions');
  const manifest = { breed: 'akita', name: '아키타', width: source.width, height: source.height, actionOrder: actions, actions: {} };
  if (source.revision !== undefined) {
    if (!isInteger(source.revision, 1, 100)) throw new Error('Preview revision must be an integer from 1 to 100');
    manifest.revision = source.revision;
  }
  if (source.displayName !== undefined) {
    if (typeof source.displayName !== 'string' || source.displayName.trim() !== source.displayName
      || source.displayName.length < 1 || source.displayName.length > 80 || /[\u0000-\u001f\u007f]/.test(source.displayName)) throw new Error('Preview display name must be a plain single line of 1–80 characters');
    manifest.displayName = source.displayName;
  }
  for (const [index, id] of actions.entries()) {
    const input = source.actions[id];
    if (!input || input.frames !== 4 || !isInteger(input.frameMs, 40, 5000) || !Array.isArray(input.eyes) || input.eyes.length !== 4) throw new Error('Invalid action timing/eye frames: ' + id);
    const modes = input.eyeModeByFrame ?? Array(4).fill(input.eyeMode ?? 'shared');
    if (!Array.isArray(modes) || modes.length !== 4 || modes.some(mode => !['shared', 'closed', 'baked-closed', 'hidden', 'baked', 'none'].includes(mode))) throw new Error('Invalid per-frame eye modes: ' + id);
    const eyes = input.eyes.map(frame => {
      if (!Array.isArray(frame) || frame.length > 2) throw new Error('Invalid eye pair: ' + id);
      return frame.map(anchor => {
        if (!anchor || !isInteger(anchor.x, 0, source.width) || !isInteger(anchor.y, 0, source.height)
          || !isInteger(anchor.width, 1, 64) || !isInteger(anchor.height, 1, 64)
          || anchor.x + anchor.width > source.width || anchor.y + anchor.height > source.height) throw new Error('Eye anchor outside native frame: ' + id);
        return { x: anchor.x, y: anchor.y, width: anchor.width, height: anchor.height };
      });
    });
    const image = fs.readFileSync(boundedFile(root, id + '.png'));
    const dimensions = pngDimensions(image);
    if (dimensions.width !== source.width * 4 || dimensions.height !== source.height) throw new Error('Expected horizontal four-frame native strip: ' + id);
    manifest.actions[id] = { id, name: names[index], frames: 4, frameMs: input.frameMs, eyes, eyeModeByFrame: modes, png: id + '.png', sha256: hash(image) };
  }
  return manifest;
}

function copyPack(root, manifest, side, master) {
  const output = path.join(review, side);
  fs.mkdirSync(output, { recursive: true });
  for (const id of actions) {
    const image = fs.readFileSync(boundedFile(root, id + '.png'));
    if (hash(image) !== manifest.actions[id].sha256) throw new Error('Source changed while preparing preview: ' + id);
    fs.writeFileSync(path.join(output, id + '.png'), image);
  }
  fs.copyFileSync(boundedFile(root, master), path.join(output, 'akita.aseprite'));
  fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
}

function generate() {
  fs.mkdirSync(review, { recursive: true });
  const realReview = fs.realpathSync(review);
  if (!realReview.startsWith(fs.realpathSync(project) + path.sep) || path.relative(review, realReview) !== '') throw new Error('Preview output cannot be redirected outside its workspace');
  const newManifest = fs.existsSync(path.join(newRoot, 'manifest.json')) ? loadManifest(newRoot, 'manifest.json') : null;
  const baseline = loadManifest(baselineRoot, 'manifest.json');
  if (baseline.revision !== 2) throw new Error('The selected comparison baseline must remain v4 revision 2');
  copyPack(baselineRoot, baseline, 'old', 'akita-v4.aseprite');
  let ready = false;
  if (newManifest) {
    copyPack(newRoot, newManifest, 'new', 'akita-v4.aseprite');
    ready = true;
  } else {
    fs.mkdirSync(path.join(review, 'new'), { recursive: true });
    // A rerun with missing final input must not silently present a stale candidate.
    fs.writeFileSync(path.join(review, 'new', 'manifest.json'), 'null\n');
  }
  fs.mkdirSync(path.join(review, 'eyes'), { recursive: true });
  for (let i = 1; i <= 30; i++) {
    const name = 'eye-' + String(i).padStart(2, '0') + '.png';
    const source = boundedFile(eyeRoot, name), bytes = fs.readFileSync(source), size = pngDimensions(bytes);
    if (size.width !== 32 || size.height !== 16) throw new Error('Shared eye atlas must be 32 × 16');
    fs.copyFileSync(source, path.join(review, 'eyes', name));
  }
  fs.writeFileSync(path.join(review, 'review.html'), html);
  fs.writeFileSync(path.join(review, 'preview.css'), css + '\n' + comparisonCss);
  fs.writeFileSync(path.join(review, 'preview.js'), '(' + browserApp.toString() + ')(' + JSON.stringify({ actions, names, eyeNames }) + ');\n');
  console.log(JSON.stringify({ review: path.join(review, 'review.html'), url: 'http://127.0.0.1:3104/', candidateReady: ready, breed: 'akita', actions: 16, frames: 64, eyeStyles: 30 }));
}

const allowed = new Set(['review.html', 'preview.css', 'preview.js', 'old/manifest.json', 'new/manifest.json', 'old/akita.aseprite', 'new/akita.aseprite',
  ...actions.flatMap(id => ['old/' + id + '.png', 'new/' + id + '.png']), ...Array.from({ length: 30 }, (_, i) => 'eyes/eye-' + String(i + 1).padStart(2, '0') + '.png')]);

function serve() {
  const server = http.createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    try {
      if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, { Allow: 'GET, HEAD' }); return response.end(); }
      const raw = request.url.split('?', 1)[0];
      const file = raw === '/' ? 'review.html' : decodeURIComponent(raw).replace(/^\//, '');
      if (!allowed.has(file)) { response.writeHead(404); return response.end('Not found'); }
      if (file.startsWith('new/') && !['new/manifest.json'].includes(file)) {
        const current = JSON.parse(fs.readFileSync(path.join(review, 'new/manifest.json'), 'utf8'));
        if (!current) { response.writeHead(404); return response.end('Candidate is not ready'); }
      }
      const source = boundedFile(review, file), stat = fs.statSync(source);
      const type = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.aseprite': 'application/octet-stream' }[path.extname(file)];
      if (file.endsWith('.aseprite')) {
        const side = file.startsWith('new/') ? 'new' : 'old';
        const manifest = JSON.parse(fs.readFileSync(boundedFile(review, side + '/manifest.json'), 'utf8'));
        const version = manifest?.revision ? 'v4-revision-' + manifest.revision : side === 'new' ? 'v4' : 'v3';
        response.setHeader('Content-Disposition', 'attachment; filename="akita-' + version + '.aseprite"');
      }
      response.writeHead(200, { 'Content-Type': type, 'Content-Length': stat.size });
      if (request.method === 'HEAD') return response.end();
      fs.createReadStream(source).pipe(response);
    } catch { if (!response.headersSent) response.writeHead(404); response.end('Not found'); }
  });
  server.on('error', error => { console.error('Preview server: ' + error.message); process.exitCode = 1; });
  server.listen(3104, '127.0.0.1', () => console.log('Akita-only review: http://127.0.0.1:3104/ · Ctrl+C to stop'));
}

const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>아키타 · 동작 비교실</title><link rel="stylesheet" href="preview.css"><script defer src="preview.js"></script></head><body>
<main><header class="masthead"><div><p class="eyebrow">PUPPYRUBY · AKITA STUDY</p><h1>작은 움직임, 더 사랑스럽게.</h1><p class="intro">수정한 아키타의 움직임을 먼저 살펴보세요. ‘이전 원본과 비교’를 켜면 같은 프레임으로 나란히 볼 수 있어요.</p></div><div class="stamp">아키타 단독 시안<span>기존 서비스에 적용되지 않아요</span></div></header>
<section class="toolbar" aria-label="비교 설정"><div class="tool"><span>배경</span><div class="segmented" id="background"><button data-value="dark" class="active">짙은 밤</button><button data-value="light">포근한 크림</button><button data-value="key">Windows 투명색</button></div></div><div class="tool"><span>원본 배율</span><div class="segmented" id="zoom"><button data-value="1">1×</button><button data-value="2" class="active">2×</button></div></div><label class="compare-switch"><input id="compare" type="checkbox">이전 원본과 비교</label><button id="reload" class="quiet">시안 새로 읽기 ↻</button></section>
<section class="action-panel" aria-label="열여섯 동작"><div class="section-heading"><h2>어떤 모습을 볼까요?</h2><span>16가지 동작 · 동작마다 4프레임</span></div><div id="actions" class="actions"></div></section>
<section id="comparison" class="comparison" aria-label="수정한 시안과 이전 원본"><article class="dog-card new-card"><div class="card-heading"><div><span class="overline">REVISED STUDY</span><h2 id="new-title">새 아키타 시안</h2></div><span id="new-version" class="version salmon">준비 중</span></div><div id="new-stage" class="stage"><canvas id="new-main" aria-label="수정한 아키타 동작"></canvas><p class="placeholder" id="new-placeholder">새 시안을 준비하고 있어요<br><small>준비되면 ‘시안 새로 읽기’를 눌러 주세요.</small></p></div><div class="card-caption"><span id="new-info">원본 준비 중</span><a id="new-master" href="new/akita.aseprite" download hidden>수정본 Aseprite ↗</a></div></article>
<article id="old-card" class="dog-card old-card" hidden><div class="card-heading"><div><span class="overline">BEFORE · COMPARISON ONLY</span><h2 id="old-title">이전 원본 · 비교용</h2></div><span class="version">이전 원본</span></div><div id="old-stage" class="stage"><canvas id="old-main" aria-label="수정 전 비교용 아키타 동작"></canvas><p class="placeholder" id="old-placeholder">원본을 불러오고 있어요</p></div><div class="card-caption"><span id="old-info"></span><a href="old/akita.aseprite" download>이전 원본 Aseprite ↗</a></div></article></section>
<section class="playback" aria-label="재생 조절"><button id="play" class="primary">Ⅱ 일시정지</button><div class="scrub"><label for="frame">같은 프레임으로 비교 <output id="frame-value">1 / 4</output></label><input id="frame" type="range" min="0" max="3" step="1" value="0"></div><span class="duration" id="duration"></span></section>
<section class="detail-tools" aria-label="공통 눈과 시선"><div><label class="field-label" for="eyes">공통 눈 · 30가지</label><select id="eyes"></select><label class="check"><input type="checkbox" id="body-only"> 공통 눈을 빼고 몸체만 보기</label></div><div><label class="field-label" for="gaze-x">좌우 시선 <output id="gaze-x-value">0 px</output></label><input id="gaze-x" type="range" min="-2" max="2" step="1" value="0"></div><div><label class="field-label" for="gaze-y">위아래 시선 <output id="gaze-y-value">0 px</output></label><input id="gaze-y" type="range" min="-2" max="2" step="1" value="0"></div><button id="reset-gaze" class="quiet">시선 가운데로</button></section>
<div class="notes"><span id="eye-note">두 눈은 같은 방향으로 함께 움직여요.</span><span id="background-note">원본 픽셀 그대로, 부드럽게 늘리지 않아요.</span></div>
<section class="frames-panel"><div class="section-heading"><h2>네 프레임을 한눈에</h2><span id="action-title">왼쪽 이동</span></div><div class="contact-scroll"><div class="contact-row" id="new-contact"></div><div class="contact-row" id="old-contact" hidden></div></div></section>
<footer>아키타 1종만 비교하는 검수 화면입니다. 눈을 감거나 얼굴이 보이지 않는 프레임은 원래 그림을 유지해요.<p id="status" role="status"></p></footer></main></body></html>`;

const css = `:root{font-family:"Malgun Gothic",system-ui,sans-serif;color:#3a302b;background:#f7f3ed;font-synthesis:none;--zoom:2;--stage:#22242b}*{box-sizing:border-box}body{margin:0}button,a,input,select{-webkit-tap-highlight-color:transparent}button,select{font:inherit}button,a{touch-action:manipulation}button{cursor:pointer}button:focus-visible,a:focus-visible,select:focus-visible,input:focus-visible{outline:3px solid #dc806b;outline-offset:4px}main{max-width:1420px;margin:0 auto;padding:48px 42px 24px}.masthead{display:flex;align-items:center;justify-content:space-between;gap:28px;margin-bottom:34px}.eyebrow,.overline{font-size:11px;letter-spacing:.16em;font-weight:800;color:#aa7562}.eyebrow{margin:0 0 12px}h1{font-size:34px;line-height:1.4;letter-spacing:-1.7px;margin:0 0 12px}h2{margin:0;font-size:18px;letter-spacing:-.5px}.intro{margin:0;font-size:13px;color:#87786e;line-height:1.9}.stamp{flex-shrink:0;background:#efe6dc;border:1px solid #e4d4c6;border-radius:16px;padding:16px 21px;font-size:13px;font-weight:800}.stamp span{display:block;color:#a18573;font-size:10px;font-weight:400;margin-top:7px}.toolbar{display:flex;align-items:center;gap:28px;margin-bottom:22px;flex-wrap:wrap}.tool{display:flex;align-items:center;gap:13px}.tool>span{font-size:11px;font-weight:800;color:#857568}.segmented{display:flex;padding:4px;border-radius:11px;background:#eae3db;gap:3px}.segmented button{border:0;background:transparent;padding:9px 13px;border-radius:8px;font-size:11px;color:#8d7c6d}.segmented button.active{background:#fffaf4;color:#45372e;box-shadow:0 2px 5px #60432e10}.quiet{border:1px solid #dfd3c7;background:transparent;color:#857060;padding:11px 15px;border-radius:10px;font-size:11px}.toolbar>.quiet{margin-left:auto}.action-panel{background:#fffaf5;border:1px solid #e6dcd1;border-radius:18px;padding:21px 24px;margin-bottom:22px}.section-heading{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:18px}.section-heading h2{font-size:15px}.section-heading>span{font-size:11px;color:#ad9785}.actions{display:grid;grid-template-columns:repeat(8,1fr);gap:7px}.actions button{border:1px solid #e9ded4;border-radius:9px;background:#fcf8f2;color:#8c7866;font-size:11px;padding:10px 5px}.actions button.active{background:#373239;border-color:#373239;color:#fff3e9}.comparison{display:grid;grid-template-columns:1fr 1fr;gap:22px}.dog-card{border:1px solid #dfd6cd;background:#fffaf5;border-radius:22px;overflow:hidden;box-shadow:0 5px 25px #66462905}.new-card{border-color:#dda38f}.card-heading{display:flex;justify-content:space-between;align-items:center;padding:24px 25px 20px}.card-heading h2{margin-top:6px;font-size:20px}.version{font-size:11px;background:#ede7df;color:#8d7b6a;border-radius:7px;padding:7px 10px}.salmon{background:#f8d9cf;color:#a65f4c}.stage{height:432px;display:flex;align-items:center;justify-content:center;background:var(--stage);position:relative;overflow:auto;padding:20px;min-height:220px}.stage canvas{flex-shrink:0;image-rendering:pixelated;image-rendering:crisp-edges;max-width:none}.stage.light{--stage:#f6eee0}.stage.key{background-color:#26232b;background-image:linear-gradient(45deg,#343039 25%,transparent 25%),linear-gradient(-45deg,#343039 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#343039 75%),linear-gradient(-45deg,transparent 75%,#343039 75%);background-size:16px 16px;background-position:0 0,0 8px,8px -8px,-8px 0}.placeholder{position:absolute;text-align:center;color:#b8a999;font-size:13px;line-height:2.2;margin:0}.placeholder small{font-size:11px;color:#9d9087}.placeholder[hidden]{display:none}.card-caption{display:flex;justify-content:space-between;align-items:center;min-height:58px;padding:17px 22px;font-size:10px;color:#a28d7b;gap:10px}.card-caption a{color:#9e725e;text-decoration:none;font-weight:bold}.playback{display:flex;align-items:center;gap:23px;padding:23px 0}.primary{background:#cb7f6b;color:#fff7f0;border:0;border-radius:12px;padding:14px 22px;font-size:12px;min-width:134px}.scrub{flex:1;max-width:730px}.scrub label,.field-label{display:flex;justify-content:space-between;gap:10px;font-size:11px;color:#8b7564;margin-bottom:10px}.scrub output,.field-label output{color:#b37a61;font-variant-numeric:tabular-nums}input[type=range]{width:100%;accent-color:#cd8974;height:5px;cursor:pointer}.duration{margin-left:auto;font-size:10px;color:#a49080}.detail-tools{display:grid;grid-template-columns:1.35fr 1fr 1fr auto;align-items:center;gap:28px;padding:23px 26px;background:#efe8de;border-radius:17px}.detail-tools select{padding:10px 12px;background:#fffaf4;border:1px solid #e2d3c5;border-radius:9px;color:#6a5444;width:100%;font-size:12px}.check{display:flex;align-items:center;gap:7px;font-size:10px;color:#8e7867;margin-top:10px;cursor:pointer}.check input{accent-color:#c5816b}.notes{display:flex;justify-content:space-between;gap:15px;color:#a4907e;font-size:10px;padding:14px 3px 27px;line-height:1.8}.frames-panel{padding:24px;background:#fffaf5;border:1px solid #e6dcd1;border-radius:18px}.contact-scroll{overflow:auto}.contact-row{display:grid;grid-template-columns:82px repeat(4,max-content);gap:12px;align-items:center;margin-bottom:13px}.contact-row:last-child{margin-bottom:0}.row-name{font-size:12px;font-weight:bold;color:#9a8170}.frame-cell{border-radius:10px;background:var(--stage);padding:10px;position:relative;text-align:center}.frame-cell.light{--stage:#f6eee0}.frame-cell.key{background:#2c2831}.frame-cell canvas{display:block;image-rendering:pixelated;image-rendering:crisp-edges}.frame-cell small{display:block;color:#a89889;font-size:9px;letter-spacing:.09em;margin-top:7px}.frame-cell.current{outline:2px solid #d9947d;outline-offset:-2px}footer{text-align:center;color:#b3a18f;font-size:10px;line-height:1.8;padding:26px 0 6px}footer p{margin:7px 0 0;color:#ba7567}@media(max-width:950px){main{padding:25px 18px}.masthead{align-items:flex-start}.stamp{display:none}h1{font-size:28px}.actions{grid-template-columns:repeat(4,1fr)}.comparison{gap:12px}.card-heading{padding:18px}.stage{height:405px;padding:10px}.detail-tools{grid-template-columns:1fr 1fr;gap:22px}.detail-tools>div:first-child{grid-column:1/-1}.detail-tools>.quiet{grid-column:1/-1}.notes{flex-direction:column;gap:2px}.card-caption{padding:13px;flex-wrap:wrap}.duration{display:none}.toolbar{gap:12px}.toolbar>.quiet{margin-left:0}.segmented button{padding:8px 10px}}@media(max-width:660px){.comparison{grid-template-columns:1fr}.stage{height:426px}.toolbar{align-items:flex-start}.playback{gap:12px}.primary{min-width:116px;padding:13px}.intro{font-size:12px}.section-heading>span{font-size:9px}.contact-row{grid-template-columns:65px repeat(4,max-content)}}`;

const comparisonCss = `[hidden]{display:none!important}.compare-switch{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700;color:#845c4e;cursor:pointer;white-space:nowrap}.compare-switch input{width:16px;height:16px;accent-color:#c5816b}.comparison{grid-template-columns:1fr;max-width:850px;margin-inline:auto}.comparison.comparing{grid-template-columns:1fr 1fr;max-width:none}.old-card .card-heading{background:#eee8e1}.old-card .card-heading h2{font-size:17px;color:#8d7868}.old-card .overline{color:#a08e80}.new-card .card-heading h2{color:#87513e}@media(max-width:660px){.comparison.comparing{grid-template-columns:1fr}.old-card .card-heading h2{font-size:16px}}`;

function browserApp(configuration) {
  'use strict';
  const $ = id => document.getElementById(id);
  const state = { action: 'walk-left', eye: 1, body: false, gx: 0, gy: 0, frame: 0, playing: true, background: 'dark', zoom: 2, compare: false };
  const packs = {}, eyeImages = new Map();
  let lastFrame = performance.now();
  const image = src => new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('이미지를 읽지 못했어요: ' + src)); img.src = src; });
  async function load(side) {
    const response = await fetch(side + '/manifest.json', { cache: 'no-store' });
    if (!response.ok) return null;
    const manifest = await response.json();
    if (!manifest) return null;
    const images = {};
    await Promise.all(configuration.actions.map(async id => { images[id] = await image(side + '/' + id + '.png'); }));
    return { manifest, images };
  }
  function nativeFrame(pack, index) {
    const m = pack.manifest, action = m.actions[state.action];
    const canvas = document.createElement('canvas'); canvas.width = m.width; canvas.height = m.height;
    const context = canvas.getContext('2d', { willReadFrequently: state.background === 'key' });
    context.imageSmoothingEnabled = false;
    if (state.background === 'key') { context.fillStyle = '#ff00ff'; context.fillRect(0, 0, m.width, m.height); }
    context.drawImage(pack.images[state.action], index * m.width, 0, m.width, m.height, 0, 0, m.width, m.height);
    if (!state.body && action.eyeModeByFrame[index] === 'shared') {
      const eye = eyeImages.get(state.eye);
      if (eye) action.eyes[index].forEach((anchor, side) => {
        context.drawImage(eye, side * 16, 0, 16, 16, anchor.x + state.gx, anchor.y + state.gy, anchor.width, anchor.height);
      });
    }
    if (state.background === 'key') {
      // Match the WinForms key operation: composite all RGBA onto opaque magenta,
      // then remove only exact 255,0,255. Partly transparent fringe remains visible.
      const pixels = context.getImageData(0, 0, m.width, m.height);
      for (let p = 0; p < pixels.data.length; p += 4) if (pixels.data[p] === 255 && pixels.data[p + 1] === 0 && pixels.data[p + 2] === 255) pixels.data[p + 3] = 0;
      context.putImageData(pixels, 0, 0);
    }
    return canvas;
  }
  function paint(target, source, zoom) {
    target.width = source.width; target.height = source.height;
    target.style.width = source.width * zoom + 'px'; target.style.height = source.height * zoom + 'px';
    const context = target.getContext('2d'); context.imageSmoothingEnabled = false; context.clearRect(0, 0, target.width, target.height); context.drawImage(source, 0, 0);
  }
  function render(includeContact = true) {
    $('comparison').classList.toggle('comparing', state.compare);
    $('old-card').hidden = !state.compare; $('old-contact').hidden = !state.compare;
    $('frame').value = String(state.frame); $('frame-value').textContent = (state.frame + 1) + ' / 4';
    $('play').textContent = state.playing ? 'Ⅱ 일시정지' : '▶ 재생하기';
    $('gaze-x-value').textContent = state.gx + ' px'; $('gaze-y-value').textContent = state.gy + ' px';
    $('action-title').textContent = configuration.names[configuration.actions.indexOf(state.action)];
    $('background-note').textContent = state.background === 'key' ? 'Windows 투명색 처리 후 가장자리를 확인해요.' : '원본 픽셀 그대로, 부드럽게 늘리지 않아요.';
    let hidden = false;
    for (const side of ['old', 'new']) {
      const stage = $(side + '-stage'); stage.className = 'stage ' + state.background;
      const pack = packs[side], main = $(side + '-main'); main.hidden = !pack; $(side + '-placeholder').hidden = !!pack;
      if (!pack) continue;
      const m = pack.manifest, action = m.actions[state.action];
      if (side === 'new' || state.compare) hidden = hidden || action.eyeModeByFrame[state.frame] !== 'shared';
      paint(main, nativeFrame(pack, state.frame), state.zoom);
      $(side + '-info').textContent = m.width + ' × ' + m.height + ' px · ' + action.frameMs + 'ms / 프레임';
      if (includeContact) {
        const row = $(side + '-contact'); row.replaceChildren();
        const name = document.createElement('span'); name.className = 'row-name';
        name.textContent = side === 'old' ? '선택한 v4 · 2차 시안' : (m.revision === 4 ? '걷기·테두리 수정' : '수정한 v4'); row.append(name);
        for (let n = 0; n < 4; n++) {
          const cell = document.createElement('div'); cell.className = 'frame-cell ' + state.background + (state.frame === n ? ' current' : ''); cell.dataset.frame = String(n);
          const canvas = document.createElement('canvas'); canvas.setAttribute('aria-label', (side === 'old' ? '기존' : '새 시안') + ' ' + (n + 1) + '번 프레임'); paint(canvas, nativeFrame(pack, n), 1);
          const label = document.createElement('small'); label.textContent = 'FRAME 0' + (n + 1); cell.append(canvas, label); row.append(cell);
        }
      } else $(side + '-contact').querySelectorAll('[data-frame]').forEach(cell => cell.classList.toggle('current', Number(cell.dataset.frame) === state.frame));
    }
    $('eye-note').textContent = state.body ? '공통 눈을 숨겼어요. 그림에 그려진 감은 눈은 그대로 보여요.' : hidden ? '감은 눈·뒷모습은 원래 그림을 유지해요. 열린 눈만 선택한 눈으로 바뀌어요.' : '두 눈은 같은 방향으로 함께 움직여요.';
    $('new-master').hidden = !packs.new;
    if (packs.old) {
      $('old-title').textContent = '선택한 v4 · 2차 시안';
    }
    if (packs.new) {
      const { revision, displayName } = packs.new.manifest;
      $('new-title').textContent = displayName ?? (revision === 4 ? 'v4 2차 기반 · 걷기·테두리 수정' : '수정한 v4 · ' + (revision ? revision + '차 시안' : '검수용 시안'));
      $('new-version').textContent = revision === 4 ? '2차 시안 기반' : revision ? revision + '차 수정본' : 'v4 수정본';
    }
    const timing = packs.new ?? packs.old; $('duration').textContent = timing ? (timing.manifest.actions[state.action].frameMs * 4 / 1000).toFixed(2) + '초 반복' : '';
  }
  const priorityActions = ['walk-left', 'walk-right', 'walk', 'happy'];
  const displayActions = [...priorityActions, ...configuration.actions.filter(id => !priorityActions.includes(id))];
  for (const id of displayActions) {
    const index = configuration.actions.indexOf(id);
    const button = document.createElement('button'); button.textContent = configuration.names[index]; button.dataset.id = id;
    button.classList.toggle('active', id === state.action); button.setAttribute('aria-pressed', String(id === state.action));
    button.addEventListener('click', () => {
      state.action = id; state.frame = 0; lastFrame = performance.now();
      $('actions').querySelectorAll('button').forEach(item => { item.classList.toggle('active', item === button); item.setAttribute('aria-pressed', String(item === button)); }); render();
    }); $('actions').append(button);
  }
  configuration.eyeNames.forEach((name, i) => { const option = document.createElement('option'); option.value = String(i + 1); option.textContent = String(i + 1).padStart(2, '0') + ' · ' + name; $('eyes').append(option); });
  for (const control of ['background', 'zoom']) $(control).querySelectorAll('button').forEach(button => button.addEventListener('click', () => {
    state[control] = control === 'zoom' ? Number(button.dataset.value) : button.dataset.value;
    $(control).querySelectorAll('button').forEach(item => item.classList.toggle('active', item === button)); render();
  }));
  $('eyes').addEventListener('change', () => { state.eye = Number($('eyes').value); render(); });
  $('body-only').addEventListener('change', () => { state.body = $('body-only').checked; render(); });
  for (const axis of ['x', 'y']) $('gaze-' + axis).addEventListener('input', () => { state['g' + axis] = Number($('gaze-' + axis).value); render(); });
  $('reset-gaze').addEventListener('click', () => { state.gx = state.gy = 0; $('gaze-x').value = $('gaze-y').value = '0'; render(); });
  $('play').addEventListener('click', () => { state.playing = !state.playing; lastFrame = performance.now(); render(false); });
  $('frame').addEventListener('input', () => { state.playing = false; state.frame = Number($('frame').value); render(false); });
  $('reload').addEventListener('click', () => location.reload());
  $('compare').addEventListener('change', () => { state.compare = $('compare').checked; render(); });
  Promise.all([load('old').then(pack => { packs.old = pack; }), load('new').then(pack => { packs.new = pack; }),
    ...configuration.eyeNames.map((_, i) => image('eyes/eye-' + String(i + 1).padStart(2, '0') + '.png').then(img => eyeImages.set(i + 1, img)))])
    .then(() => { render(); $('status').textContent = packs.new ? '수정한 v4 시안을 보고 있어요. 이전 원본은 비교를 켰을 때만 표시돼요.' : '새 시안 준비 중 · 이전 원본이 필요하면 ‘이전 원본과 비교’를 켜 주세요.'; })
    .catch(error => { $('status').textContent = error.message; render(); });
  function tick(now) {
    const timing = packs.new ?? packs.old;
    if (state.playing && timing && now - lastFrame >= timing.manifest.actions[state.action].frameMs) {
      state.frame = (state.frame + 1) % 4; lastFrame = now; render(false);
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

if (require.main === module) {
  try {
    if (process.argv.slice(2).some(arg => arg !== '--serve')) throw new Error('Usage: node scripts/akita-v4-preview.cjs [--serve]');
    generate(); if (process.argv.includes('--serve')) serve();
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { generate, loadManifest, boundedFile, pngDimensions, allowed };
