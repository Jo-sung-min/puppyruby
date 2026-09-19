'use strict';
const assert = require('node:assert/strict');
const { loadFrontend } = require('./frontend-loader.cjs');
const release = require('../frontend/src/lib/generated/public-media-release.json');
const ruby = require('../frontend/src/lib/generated/ruby-round-media-release.json');
const saved = [process.env.NEXT_PUBLIC_ASSET_BASE_URL, process.env.NEXT_PUBLIC_DOWNLOAD_BASE_URL, process.env.NEXT_PUBLIC_RUBY_ROUND_BASE_URL];
delete process.env.NEXT_PUBLIC_ASSET_BASE_URL;
delete process.env.NEXT_PUBLIC_DOWNLOAD_BASE_URL;
delete process.env.NEXT_PUBLIC_RUBY_ROUND_BASE_URL;
(async () => {
  try {
    for (const item of [release.images, ...(release.downloads.baseUrl ? [release.downloads] : []), ruby]) {
      assert.match(item.release, /^[a-f0-9]{16}$/);
      assert.ok(item.baseUrl.endsWith('/' + item.release));
    }
    const config = loadFrontend('next.config.ts').default;
    assert.deepEqual(await config.redirects(), [
      { source: '/images/ruby-round-v1/:path*', destination: `${ruby.baseUrl}/images/ruby-round-v1/:path*`, permanent: false },
      { source: '/downloads/ruby-round-v1/:path*', destination: `${ruby.baseUrl}/downloads/ruby-round-v1/:path*`, permanent: false },
      { source: '/images/:path((?!ruby-round-v1(?:/|$)).*)', destination: `${release.images.baseUrl}/images/:path`, permanent: false },
      { source: '/favicon.svg', destination: `${release.images.baseUrl}/favicon.svg`, permanent: false },
      ...(release.downloads.baseUrl ? [{ source: '/downloads/:path((?!ruby-round-v1(?:/|$)).*)', destination: `${release.downloads.baseUrl}/downloads/:path`, permanent: false }] : []),
    ]);
    assert.equal(config.images.remotePatterns[0].href, `${release.images.baseUrl}/images/**`);
    assert.equal(config.images.remotePatterns[1].href, `${ruby.baseUrl}/images/ruby-round-v1/**`);
    if (!release.downloads.baseUrl) assert.equal(release.downloads.release, '', 'An unverified download release must not be advertised.');
    console.log('Media redirects passed: shared images, Ruby Round pack and desktop downloads use their committed verified CDN releases.');
  } finally {
    ['NEXT_PUBLIC_ASSET_BASE_URL', 'NEXT_PUBLIC_DOWNLOAD_BASE_URL', 'NEXT_PUBLIC_RUBY_ROUND_BASE_URL']
      .forEach((key, i) => saved[i] === undefined ? delete process.env[key] : process.env[key] = saved[i]);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
