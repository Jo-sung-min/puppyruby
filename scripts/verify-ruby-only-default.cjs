#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { loadFrontend } = require('./frontend-loader.cjs');

const root = path.resolve(__dirname, '..');
const req = createRequire(path.join(root, 'frontend/package.json'));
const React = req('react');
const { renderToStaticMarkup } = req('react-dom/server');
const styles = loadFrontend('src/lib/dog-styles.ts');
const { parseAppearance } = loadFrontend('src/lib/dog-appearance.ts', { './dog-styles': styles });
const { PixelDog } = loadFrontend('src/components/pixel-dog.tsx');
const ruby = 'ruby-round-scenes';

assert.deepEqual(styles.dogStyles.map(style => style.id), [ruby]);
assert.deepEqual(styles.pixelDogStyles.map(style => style.id), [ruby]);
assert.equal(styles.defaultAppearance.defaultStyle, ruby);
assert.equal(styles.resolveDogStyle(null, 'pomeranian'), ruby);
assert.equal(styles.resolveDogStyle({ defaultStyle: 'classic', breedStyles: { pomeranian: 'art-16' } }, 'pomeranian'), ruby);
assert.throws(() => parseAppearance({ ...styles.defaultAppearance, defaultStyle: 'classic' }));
assert.equal(parseAppearance(styles.defaultAppearance).defaultStyle, ruby);

const markup = renderToStaticMarkup(React.createElement(PixelDog, { breed: 'pomeranian', paused: true }));
assert.match(markup, /data-dog-style="ruby-round-scenes"/);
assert.match(markup, /\/images\/ruby-round-v1\/pomeranian\/idle\.png/);
const implicit = renderToStaticMarkup(React.createElement(PixelDog, { paused: true }));
assert.match(implicit, /data-dog-breed="pomeranian"/);

const backend = fs.readFileSync(path.join(root, 'backend/src/main/java/com/puppyruby/appearance/AppearanceService.java'), 'utf8');
assert.match(backend, /DEFAULT_STYLE\s*=\s*"ruby-round-scenes"/);
assert.match(backend, /STYLES\s*=\s*List\.of\(DEFAULT_STYLE\)/);
const migration = fs.readFileSync(path.join(root, 'backend/src/main/resources/db/migration/postgresql/V3__make_ruby_round_the_only_dog_style.sql'), 'utf8');
assert.match(migration, /set default_style = 'ruby-round-scenes'/);
assert.match(migration, /delete from appearance_breed_styles/);
assert.match(migration, /delete from appearance_deleted_styles/);
assert.match(migration, /update appearance_varieties[\s\S]*set style = null/);

console.log('PASS Ruby Round is the only live style, web fallback, backend default and Flyway normalization target.');
