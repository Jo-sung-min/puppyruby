'use strict';
const assert = require('node:assert/strict'), path = require('node:path');
const { createRequire } = require('node:module'), { loadFrontend } = require('./frontend-loader.cjs');
const req = createRequire(path.join(__dirname, '../frontend/package.json'));
const { match } = req('next/dist/compiled/path-to-regexp');
const { prepareDestination } = req('next/dist/shared/lib/router/utils/prepare-destination');
const library = loadFrontend('src/lib/asset-url.ts');
const { assetUrl, publicRubyRoundBaseUrl } = library;
const saved = process.env.NEXT_PUBLIC_RUBY_ROUND_BASE_URL;
const pack = 'https://cdn.example.test/site-packs/ruby-round-v1/verified-release';
const committed = require('../frontend/src/lib/generated/ruby-round-media-release.json');
let checks = 0;
function check(actual, expected, label) { assert.deepEqual(actual, expected, label); checks++; }
function config(base) { return loadFrontend('next.config.ts', { './src/lib/asset-url': { ...library, publicRubyRoundBaseUrl: () => base } }).default; }
const matched = (routes, target) => routes.find(route => match(route.source)(target));
(async () => {
  check(publicRubyRoundBaseUrl(''), committed.baseUrl, 'Unset pack override uses only its own verified release');
  check(publicRubyRoundBaseUrl(` ${pack}/// `), pack, 'Pack public base is normalized');
  for (const bad of ['http://remote.test/pack', `${pack}?token=do-not-leak`, 'https://name:do-not-leak@cdn.test/pack', `${pack}/../bad`, `${pack}/%2e%2e/bad`, '//cdn.test/pack']) {
    assert.throws(() => publicRubyRoundBaseUrl(bad), error => error.message.includes('NEXT_PUBLIC_RUBY_ROUND_BASE_URL') && !error.message.includes('do-not-leak')); checks++;
  }
  process.env.NEXT_PUBLIC_RUBY_ROUND_BASE_URL = pack;
  for (const file of ['/images/ruby-round-v1/shiba/idle.png', '/images/ruby-round-v1/eyes/eye-30.png', '/downloads/ruby-round-v1/shiba.aseprite']) check(assetUrl(file), pack + file, 'Images, common eyes and editable masters use the independent pack');
  for (const file of ['/images/ruby-round-v1/../secret.png', '/downloads/ruby-round-v1/x.aseprite?token=value']) check(assetUrl(file), file, 'Invalid paths cannot become a trusted CDN URL');
  check(assetUrl('/images/pixel-garden.svg'), `${library.publicAssetBaseUrl()}/images/pixel-garden.svg`, 'Existing image release stays intact');
  check(assetUrl('/downloads/PuppyRuby.exe'), '/downloads/PuppyRuby.exe', 'Existing installer URL stays intact');
  const next = config(pack), redirects = await next.redirects();
  for (const area of ['images', 'downloads']) {
    const route = matched(redirects, `/${area}/ruby-round-v1/shiba/${area === 'images' ? 'idle.png' : 'source.aseprite'}`);
    check(route.source, `/${area}/ruby-round-v1/:path*`, 'Specific pack redirect takes priority');
    check(route.destination.startsWith(pack), true, 'Direct redirect bypasses the Next server for large files');
  }
  check(next.images.remotePatterns.some(pattern => pattern.href === pack + '/images/ruby-round-v1/**'), true, 'Remote optimization is limited to the published pack prefix');
  const local = await config('').redirects();
  for (const area of ['images', 'downloads']) {
    check(matched(local, `/${area}/ruby-round-v1/shiba/idle.png`), undefined, 'An unpublished pack falls through to local files, never the older release');
    check(!!matched(local, `/${area}/another-pack/file.png`), true, 'Older media still redirects to its original release');
  }
  for (const target of ['/images/art16-scenes-v1/shiba/walk.png', '/downloads/sp-scenes-v1/sp08/shiba.aseprite']) {
    const route = matched(local, target), params = match(route.source)(target).params;
    const destination = prepareDestination({ destination: route.destination, params, query: {}, appendParamsToQuery: false });
    check(destination.newUrl.endsWith(target), true, 'Existing nested media paths retain literal slashes in Next redirects');
  }
  console.log(`PASS ${checks} Ruby Round CDN routing checks: isolated release, validation, local fallback, Next redirect matching and old-release preservation.`);
})().finally(() => { if (saved === undefined) delete process.env.NEXT_PUBLIC_RUBY_ROUND_BASE_URL; else process.env.NEXT_PUBLIC_RUBY_ROUND_BASE_URL = saved; }).catch(error => { console.error(error); process.exitCode = 1; });
