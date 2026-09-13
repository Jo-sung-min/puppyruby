'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { loadFrontend } = require('./frontend-loader.cjs');
const root = path.resolve(__dirname, '..');
const frontendRequire = createRequire(path.join(root, 'frontend/package.json'));
const React = frontendRequire('react');
const { renderToStaticMarkup } = frontendRequire('react-dom/server');
const { assetUrl, publicAssetBaseUrl, publicDownloadBaseUrl } = loadFrontend('src/lib/asset-url.ts');
const release = require('../frontend/src/lib/generated/public-media-release.json');
const originalBase = process.env.NEXT_PUBLIC_ASSET_BASE_URL;
const base = 'https://cdn.example.test/puppyruby/site-assets/release-1';
let checks = 0;
function equal(actual, expected, label) { assert.deepEqual(actual, expected, label); checks++; }
function check(condition, label) { assert.ok(condition, label); checks++; }

try {
  equal(publicAssetBaseUrl(''), release.images.baseUrl, 'Empty image setting uses the committed CDN release');
  equal(publicDownloadBaseUrl(''), release.downloads.baseUrl, 'Empty download setting uses the committed CDN release');
  equal(publicDownloadBaseUrl(` ${base}/// `), base, 'Download CDN normalizes whitespace and slashes');
  equal(publicAssetBaseUrl(` ${base}/// `), base, 'Normalize whitespace and trailing slashes');
  for (const local of ['http://localhost:8090/assets', 'http://127.0.0.1:8090/assets', 'http://[::1]:8090/assets']) {
    equal(publicAssetBaseUrl(local), local, 'Loopback HTTP supports local CDN testing');
  }
  for (const invalid of ['http://cdn.example.test/assets', '//cdn.example.test/assets', 'javascript:alert(1)',
    `${base}?signature=secret-marker`, `${base}#fragment`, 'https://name:secret-marker@cdn.example.test/assets',
    'https://cdn.example.test/a/../b', 'https://cdn.example.test/a/%2e%2e/b', 'https://cdn.example.test/a/%5cb',
    'https://cdn.example.test/a/%22b', 'https://cdn.example.test/a path', 'https://cdn.example.test/a\\path']) {
    assert.throws(() => publicAssetBaseUrl(invalid), error => !error.message.includes('secret-marker') && error.message.includes('NEXT_PUBLIC_ASSET_BASE_URL'));
    checks++;
    assert.throws(() => publicDownloadBaseUrl(invalid), error => !error.message.includes('secret-marker') && error.message.includes('NEXT_PUBLIC_DOWNLOAD_BASE_URL'));
    checks++;
  }
  delete process.env.NEXT_PUBLIC_ASSET_BASE_URL;
  equal(assetUrl('/images/pixel-garden.svg'), `${release.images.baseUrl}/images/pixel-garden.svg`, 'Clean clone garden uses the committed CDN release');
  equal(assetUrl('/favicon.svg'), `${release.images.baseUrl}/favicon.svg`, 'Clean clone favicon uses the committed CDN release');
  process.env.NEXT_PUBLIC_ASSET_BASE_URL = `${base}/`;
  equal(assetUrl('/images/pixel-garden.svg'), `${base}/images/pixel-garden.svg`, 'Garden uses CDN release prefix');
  equal(assetUrl('/favicon.svg'), `${base}/favicon.svg`, 'Favicon uses CDN release prefix');
  for (const untouched of ['https://photos.example.test/person.jpg', 'https://seo.example.test/share.png',
    '//photos.example.test/photo.png', '/downloads/PuppyRuby.exe', '/downloads/PuppyRuby-server.jar',
    '/downloads/puppyruby-pixel-art-30.zip', '/api/media/config', 'data:image/png;base64,AAAA',
    '/images/../secret.png', '/images/%2e%2e/secret.png', '/images/test.png?signature=value']) {
    equal(assetUrl(untouched), untouched, 'Only project public image paths are converted');
  }

  const { pixelArtCandidates, pixelArtArchive } = loadFrontend('src/lib/pixel-art-candidates.ts');
  equal(pixelArtCandidates.length, 30, 'All thirty finished candidates remain in the manifest');
  for (const candidate of pixelArtCandidates) {
    equal(candidate.png, `/images/pixel-art-v1/${candidate.id}.png`, 'Manifest keeps portable local paths');
    if (fs.existsSync(path.join(root, 'local-assets/site/images'))) check(fs.existsSync(path.join(root, 'local-assets/site', candidate.png)), 'Ignored local master image exists');
    equal(assetUrl(candidate.png), `${base}${candidate.png}`, 'Candidate display uses the configured release');
  }
  const { AdminPixelArtGallery } = loadFrontend('src/components/account/admin-pixel-art-gallery.tsx');
  const gallery = renderToStaticMarkup(React.createElement(AdminPixelArtGallery));
  equal((gallery.match(/<img /g) || []).length, 12, 'CDN gallery still renders twelve cards per page');
  check(gallery.includes(`src="${base}/images/pixel-art-v1/art-01.png"`), 'Image src points directly to CDN');
  check(gallery.includes(`href="${base}/images/pixel-art-v1/art-01.png"`), 'PNG download points to CDN');
  check(gallery.includes(`href="${pixelArtArchive}"`), 'ZIP download stays on the site');
  check(!gallery.includes('/_next/image'), 'Original pixel-art PNG is not recompressed');

  const { defaultSeoConfig } = loadFrontend('src/lib/seo.ts');
  const { rootSeoMetadata } = loadFrontend('src/lib/server-seo.ts', { 'server-only': {}, './server-session': { apiBase: () => 'http://127.0.0.1:1' } });
  const shared = 'https://user-cdn.example.test/shared.jpg?version=2';
  const metadata = rootSeoMetadata({ ...defaultSeoConfig, ogImageUrl: shared });
  equal(metadata.icons.icon, `${base}/favicon.svg`, 'Server metadata icon uses CDN');
  equal(metadata.openGraph.images[0].url, shared, 'Administrator SEO image keeps its saved URL');
  equal(metadata.twitter.images[0].url, shared, 'Twitter share image keeps its saved URL');

  const landingSource = fs.readFileSync(path.join(root, 'frontend/src/components/puppy-landing.tsx'), 'utf8');
  const landingCss = fs.readFileSync(path.join(root, 'frontend/src/app/landing.css'), 'utf8');
  check(landingSource.includes('assetUrl("/images/pixel-garden.svg")'), 'Landing supplies its background through the shared helper');
  check(!/url\(['"]?\/images\//.test(landingCss), 'Static CSS does not bypass the configured CDN');
  console.log(`Asset URL checks passed: ${checks} checks. Clean clone CDN defaults, validation, gallery, metadata, downloads and saved external photos verified without network requests.`);
} finally {
  if (originalBase === undefined) delete process.env.NEXT_PUBLIC_ASSET_BASE_URL;
  else process.env.NEXT_PUBLIC_ASSET_BASE_URL = originalBase;
}
