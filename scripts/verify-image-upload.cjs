#!/usr/bin/env node
// Isolated browser-helper checks. Every image and network operation is synthetic.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const root = path.resolve(__dirname, '..');
const requireFrontend = Module.createRequire(path.join(root, 'frontend/package.json'));
const swc = requireFrontend('next/dist/build/swc');
const filename = path.join(root, 'frontend/src/lib/image-upload.ts');
const compiled = swc.transformSync(fs.readFileSync(filename, 'utf8'), {
  filename, jsc: { parser: { syntax: 'typescript' }, target: 'es2022' }, module: { type: 'commonjs' },
}).code;
const loaded = new Module(filename, module);
loaded._compile(compiled, filename);
const { safeProfilePhoto, getImageUploadConfig, uploadProfilePhoto } = loaded.exports;
const config = { enabled: true, maxBytes: 160 * 1024, acceptedTypes: ['image/jpeg', 'image/png'] };
const jpeg = new Blob([new Uint8Array([255, 216, 255, 224, 1, 2, 3])], { type: 'image/jpeg' });
const file = new File([jpeg], 'test.jpg', { type: 'image/jpeg' });
const id = '12345678-1234-1234-1234-123456789abc';
const complete = { photo: `media:${id}`, url: 'https://cdn.example.test/photos/test.jpg' };
let revoked = 0, calls = [], stages = [], failure = '', unsafe = '', checksum = '';
URL.createObjectURL = () => 'blob:test';
URL.revokeObjectURL = () => revoked++;
global.Image = class { width = 500; height = 250; async decode() {} };
global.document = { createElement: () => ({ getContext: () => ({ fillRect() {}, drawImage() {} }), toBlob: callback => callback(jpeg) }) };
global.fetch = async (url, options) => {
  options.signal.throwIfAborted();
  calls.push({ url, options });
  if (url.endsWith('/config')) return Response.json(config);
  if (url.endsWith('/presign')) {
    const body = JSON.parse(options.body); checksum = body.sha256;
    assert.equal(body.size, jpeg.size); assert.equal(body.contentType, 'image/jpeg');
    if (failure === 'network') throw new Error('UPSTREAM_SECRET_SHOULD_NEVER_RENDER');
    const headers = { 'Content-Type': 'image/jpeg', 'x-amz-checksum-sha256': failure === 'checksum' ? 'wrong' : checksum };
    if (failure === 'headers') headers.Authorization = 'forbidden';
    return Response.json({ uploadId: id, method: 'PUT', uploadUrl: unsafe || 'https://bucket.s3.example.test/key?signature=private', expiresAt: Date.now() + 60000, headers });
  }
  if (url.endsWith('/complete')) return Response.json(failure === 'complete' ? { photo: `media:${id}`, url: 'javascript:bad' } : complete);
  assert.equal(options.credentials, 'omit'); assert.equal(options.referrerPolicy, 'no-referrer'); assert.equal(options.redirect, 'error');
  assert.equal(options.method, 'PUT'); assert.equal(options.body, jpeg); assert.equal(options.headers.get('x-amz-checksum-sha256'), checksum);
  return new Response(null, { status: failure === 'put' ? 403 : 200 });
};

(async () => {
  assert.equal(safeProfilePhoto('https://cdn.example.test/a.jpg'), 'https://cdn.example.test/a.jpg');
  assert.equal(safeProfilePhoto('https://CDN.example.test/a.jpg'), 'https://CDN.example.test/a.jpg');
  for (const value of ['http://bad.test/a.jpg', 'javascript:alert(1)', 'data:image/svg+xml;base64,YQ==', 'https://user:pass@cdn.test/a.jpg', `media:${id}`]) assert.equal(safeProfilePhoto(value), null);
  assert.equal(safeProfilePhoto('data:image/jpeg;base64,YQ=='), 'data:image/jpeg;base64,YQ==');
  assert.deepEqual(await getImageUploadConfig(new AbortController().signal), config);
  calls = [];
  assert.deepEqual(await uploadProfilePhoto(file, config, new AbortController().signal, stage => stages.push(stage)), complete);
  assert.deepEqual(stages, ['prepare', 'upload', 'verify']); assert.equal(calls.length, 3); assert.equal(revoked, 1);
  const expected = require('node:crypto').createHash('sha256').update(Buffer.from(await jpeg.arrayBuffer())).digest('base64'); assert.equal(checksum, expected);
  failure = 'put'; calls = [];
  await assert.rejects(uploadProfilePhoto(file, config, new AbortController().signal, () => {}), /사진 전송/); assert.equal(calls.length, 2);
  failure = 'complete'; calls = [];
  await assert.rejects(uploadProfilePhoto(file, config, new AbortController().signal, () => {}), /등록한 사진/);
  failure = 'network'; calls = [];
  await assert.rejects(uploadProfilePhoto(file, config, new AbortController().signal, () => {}), error => error.message.includes('연결하지 못했어요') && !error.message.includes('UPSTREAM_SECRET')); assert.equal(calls.length, 1);
  for (failure of ['checksum', 'headers']) {
    calls = [];
    await assert.rejects(uploadProfilePhoto(file, config, new AbortController().signal, () => {}), /등록 정보/); assert.equal(calls.length, 1);
  }
  failure = ''; unsafe = 'http://bucket.test/unsafe'; calls = [];
  await assert.rejects(uploadProfilePhoto(file, config, new AbortController().signal, () => {}), /등록 주소/); assert.equal(calls.length, 1);
  unsafe = ''; calls = [];
  await assert.rejects(uploadProfilePhoto(file, { ...config, enabled: false }, new AbortController().signal, () => {}), /준비 중/); assert.equal(calls.length, 0);
  const aborted = new AbortController(); aborted.abort();
  await assert.rejects(uploadProfilePhoto(file, config, aborted.signal, () => {}), { name: 'AbortError' }); assert.equal(calls.length, 0);
  const cancel = new AbortController(); calls = [];
  await assert.rejects(uploadProfilePhoto(file, config, cancel.signal, stage => { if (stage === 'upload') cancel.abort(); }), { name: 'AbortError' });
  assert.equal(calls.some(call => call.url.endsWith('/complete')), false);
  assert.equal(calls.length, 1);
  console.log('Image upload helper checks passed: safe image URLs, checksum, credentials omission, failed PUT, malformed completion, secret-safe network errors, header validation, disabled uploads and cancellation. No cloud requests.');
})().catch(error => { console.error(error); process.exitCode = 1; });
