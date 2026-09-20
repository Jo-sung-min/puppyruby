'use strict';
const assert = require('node:assert/strict');
const { loadFrontend } = require('./frontend-loader.cjs');
const { readDesktopUpdateRelease, desktopUpdateResponse } = loadFrontend('src/lib/desktop-update.ts');
const release = {
  schemaVersion: 1, version: '0.10.0.0', release: '123456789abcdef0', publishedAt: '2026-09-20T07:31:24.406Z',
  notes: '새 동작과 업데이트 알림을 적용했어요.',
  installer: { url: 'https://cdn.puppyruby.com/site-downloads/123456789abcdef0/downloads/PuppyRuby-Setup.exe', sha256: 'a'.repeat(64), size: 62691328 },
};
(async () => {
  assert.deepEqual(readDesktopUpdateRelease(release), release);
  const nanos = { ...release, publishedAt: '2026-09-20T08:02:38.106973200Z' };
  assert.equal(readDesktopUpdateRelease(nanos).publishedAt, '2026-09-20T08:02:38.106Z');
  assert.equal((await desktopUpdateResponse(nanos).json()).publishedAt, '2026-09-20T08:02:38.106Z');
  assert.deepEqual(readDesktopUpdateRelease({ ...release, secret: 'must never be exposed', installer: { ...release.installer, internalPath: 'private' } }), release);
  const invalid = [null, {}, [], { ...release, schemaVersion: 2 },
    ...['0.10', '0.10.0.0beta', '00.10.0.0', '0.65536.0.0'].map(version => ({ ...release, version })),
    ...['', 'z'.repeat(16), '../other-release'].map(value => ({ ...release, release: value })),
    ...['now', '2026-99-99T07:00:00Z'].map(publishedAt => ({ ...release, publishedAt })),
    ...['<script>x</script>', 'private\nline', 'x'.repeat(501)].map(notes => ({ ...release, notes })),
    ...['http://cdn.puppyruby.com/site-downloads/123456789abcdef0/downloads/PuppyRuby-Setup.exe',
      release.installer.url + '?token=x', release.installer.url.replace('cdn.puppyruby.com', 'other.example'),
      release.installer.url.replace('123456789abcdef0', '2222222222222222')]
      .map(url => ({ ...release, installer: { ...release.installer, url } })),
    ...[0, -1, 1.1, NaN, 200 * 1024 * 1024 + 1, '123'].map(size => ({ ...release, installer: { ...release.installer, size } })),
    ...['', 'A'.repeat(64), 'a'.repeat(63)].map(sha256 => ({ ...release, installer: { ...release.installer, sha256 } })),
  ];
  for (const value of invalid) {
    assert.equal(readDesktopUpdateRelease(value), null);
    const response = desktopUpdateResponse(value);
    assert.equal(response.status, 503);
    assert.match(response.headers.get('Cache-Control'), /no-store/);
    assert.equal(response.headers.get('Vercel-CDN-Cache-Control'), 'no-store');
    assert.deepEqual(Object.keys(await response.json()), ['message']);
  }
  const response = desktopUpdateResponse(release);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), release);
  assert.match(response.headers.get('Cache-Control'), /no-store/);
  assert.equal(response.headers.get('CDN-Cache-Control'), 'no-store');
  assert.equal(response.headers.get('Vercel-CDN-Cache-Control'), 'no-store');
  assert.equal(response.headers.get('Set-Cookie'), null);
  assert.equal(response.headers.get('Location'), null);
  const route = loadFrontend('src/app/api/desktop/update/route.ts', { '@/lib/desktop-update': { desktopUpdateResponse: () => desktopUpdateResponse(release) } });
  assert.equal(route.dynamic, 'force-dynamic');
  assert.deepEqual(await route.GET().json(), release);
  const published = require('../frontend/src/lib/generated/desktop-update-release.json');
  if (published !== null) {
    assert.deepEqual(readDesktopUpdateRelease(published), { ...published, publishedAt: new Date(published.publishedAt).toISOString() });
    assert.match((await desktopUpdateResponse(published).json()).publishedAt, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
    const downloads = require('../frontend/src/lib/generated/public-media-release.json').downloads;
    assert.equal(downloads.release, published.release);
    assert.equal(published.installer.url, `${downloads.baseUrl}/downloads/PuppyRuby-Setup.exe`);
  }
  console.log(`PASS: public desktop update endpoint; ${invalid.length} invalid releases fail closed, no-store on success/failure, exact allowlisted installer, no session/backend dependency.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
