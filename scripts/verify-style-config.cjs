#!/usr/bin/env node
'use strict';

// Read-only checks against the real TypeScript modules, compiled with installed Next SWC.
// No server requests, settings writes, asset exports, or user data access.
// Run: node scripts/verify-style-config.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const root = path.resolve(__dirname, '..');
const requireFrontend = Module.createRequire(path.join(root, 'frontend/package.json'));
const swc = requireFrontend('next/dist/build/swc');
let checks = 0;

function check(name, run) {
  try { run(); checks++; }
  catch (error) { throw new Error(`${name}: ${error.message}`, { cause: error }); }
}
function load(relative, overrides = {}) {
  const filename = path.join(root, 'frontend', relative);
  const compiled = swc.transformSync(fs.readFileSync(filename, 'utf8'), {
    filename,
    jsc: { parser: { syntax: 'typescript', tsx: filename.endsWith('.tsx') }, transform: { react: { runtime: 'automatic' } }, target: 'es2020' },
    module: { type: 'commonjs' },
  }).code;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const fallback = loaded.require.bind(loaded);
  loaded.require = name => Object.hasOwn(overrides, name) ? overrides[name] : fallback(name);
  loaded._compile(compiled, filename);
  return loaded.exports;
}
const styles = load('src/lib/dog-styles.ts');
const { parseAppearance } = load('src/lib/dog-appearance.ts', { './dog-styles': styles });
const { dogStyles, styleBreedIds, styleBreeds, defaultAppearance, resolveDogStyle, isDogStyleId, activeDogStyles, isStyleAvailable } = styles;
const ids = dogStyles.map(style => style.id);
const backend = fs.readFileSync(path.join(root, 'backend/src/main/java/com/puppyruby/appearance/AppearanceService.java'), 'utf8');
function javaList(name) {
  const match = backend.match(new RegExp(`public static final List<String> ${name} = List\\.of\\(([\\s\\S]*?)\\);`));
  assert.ok(match, `Backend ${name} catalog was not found`);
  return [...match[1].matchAll(/"([^"\\]+)"/g)].map(value => value[1]);
}
const blank = () => ({ defaultStyle: 'classic', breedStyles: {}, deletedStyles: [], revision: 0, updatedAt: null });
const reject = (name, value) => check(name, () => assert.throws(() => parseAppearance(value), Error));

check('exact 16 style IDs match the backend in order', () => {
  assert.equal(ids.length, 16); assert.equal(new Set(ids).size, 16); assert.deepEqual(ids, javaList('STYLES'));
});
check('exact seven breed IDs match the backend in order', () => {
  assert.equal(styleBreedIds.length, 7); assert.equal(new Set(styleBreedIds).size, 7);
  assert.deepEqual(styleBreedIds, javaList('BREEDS')); assert.deepEqual(styleBreeds.map(breed => breed.id), styleBreedIds);
});
check('default public appearance matches the backend contract', () => assert.deepEqual(defaultAppearance, blank()));
check('default appearance can be parsed', () => assert.deepEqual(parseAppearance(defaultAppearance), blank()));
check('older server config without deletedStyles normalizes to an empty list', () => {
  const legacy = blank(); delete legacy.deletedStyles;
  assert.deepEqual(parseAppearance(legacy), blank()); assert.deepEqual(activeDogStyles(legacy), dogStyles);
});
for (const style of dogStyles) check(`catalog metadata ${style.id}`, () => {
  assert.equal(isDogStyleId(style.id), true); assert.ok(style.name.trim()); assert.ok(style.description.trim());
});
for (const value of [null, undefined, '', 'ROUND', ' round', 'unknown', '__proto__', 'constructor', 0, true, {}, []])
  check(`unknown style predicate ${String(value)}`, () => assert.equal(isDogStyleId(value), false));

for (const style of ids) {
  const inherited = parseAppearance({ ...blank(), defaultStyle: style });
  for (const breed of styleBreedIds) {
    check(`inherit ${breed}/${style}`, () => assert.equal(resolveDogStyle(inherited, breed), style));
    for (const override of ids) {
      const custom = parseAppearance({ ...blank(), defaultStyle: style, breedStyles: { [breed]: override }, revision: 1, updatedAt: 1 });
      check(`override ${breed}/${style}/${override}`, () => {
        assert.equal(resolveDogStyle(custom, breed), override);
        for (const other of styleBreedIds.filter(value => value !== breed)) assert.equal(resolveDogStyle(custom, other), style);
      });
    }
    check(`remove override restores ${breed}/${style}`, () => {
      const reset = parseAppearance({ ...inherited, breedStyles: {}, revision: 2, updatedAt: 2 });
      assert.equal(resolveDogStyle(reset, breed), style); assert.deepEqual(reset.breedStyles, {});
    });
  }
}
for (const breed of styleBreedIds) check(`safe resolver fallback ${breed}`, () => {
  assert.equal(resolveDogStyle(null, breed), 'classic'); assert.equal(resolveDogStyle(undefined, breed), 'classic');
  assert.equal(resolveDogStyle({ defaultStyle: 'unknown', breedStyles: { [breed]: 'invalid' } }, breed), 'classic');
  assert.equal(resolveDogStyle({ defaultStyle: 'round', breedStyles: { [breed]: 'invalid' } }, breed), 'round');
});

for (const [index, value] of [null, undefined, true, false, 0, '', 'classic', [], [blank()], new Date(), new Map(), new Set(), () => blank()].entries())
  reject(`invalid root ${index}`, value);
for (const key of Object.keys(blank()).filter(key => key !== 'deletedStyles')) {
  const missing = blank(); delete missing[key]; reject(`missing ${key}`, missing);
}
for (const [index, value] of [undefined, null, '', 'unknown', 'Classic', 0, true, {}, []].entries())
  reject(`invalid default style ${index}`, { ...blank(), defaultStyle: value });
for (const [index, value] of [undefined, null, '', 'classic', 0, false, [], [{ poodle: 'round' }]].entries())
  reject(`invalid breed map ${index}`, { ...blank(), breedStyles: value });
for (const key of ['husky', 'Poodle', '0', '__proto__', 'prototype', 'constructor', 'toString', 'hasOwnProperty']) {
  const overrides = Object.fromEntries([[key, 'round']]);
  reject(`unknown/prototype breed key ${key}`, { ...blank(), breedStyles: overrides });
}
for (const [index, value] of [undefined, null, '', 'unknown', 'ROUND', 0, false, {}, []].entries())
  reject(`invalid override ${index}`, { ...blank(), breedStyles: { poodle: value } });
for (const [index, value] of [undefined, null, false, true, 0, '', 'round', {}, ['unknown'], ['__proto__'], [null], [1], new Array(1), ['round', 'round'], ids].entries())
  reject(`invalid deleted list ${index}`, { ...blank(), deletedStyles: value });
for (const deleted of ids) {
  const kept = ids.find(style => style !== deleted);
  const config = parseAppearance({ ...blank(), defaultStyle: kept, deletedStyles: [deleted] });
  check(`deleted style ${deleted} is unavailable and removed from the ordered active catalog`, () => {
    assert.equal(isStyleAvailable(config, deleted), false);
    assert.deepEqual(activeDogStyles(config), dogStyles.filter(style => style.id !== deleted));
    for (const available of ids.filter(style => style !== deleted)) assert.equal(isStyleAvailable(config, available), true);
  });
  reject(`deleted default ${deleted} is rejected`, { ...config, defaultStyle: deleted });
  for (const breed of styleBreedIds) {
    reject(`deleted ${breed}/${deleted} override is rejected`, { ...config, breedStyles: { [breed]: deleted } });
    check(`deleted ${breed}/${deleted} override falls back to available default`, () => {
      assert.equal(resolveDogStyle({ ...config, breedStyles: { [breed]: deleted } }, breed), kept);
    });
  }
  const last = parseAppearance({ ...blank(), defaultStyle: deleted, deletedStyles: ids.filter(style => style !== deleted) });
  check(`one remaining style ${deleted} is valid and selected by fallback`, () => {
    assert.deepEqual(activeDogStyles(last).map(style => style.id), [deleted]);
    for (const breed of styleBreedIds) assert.equal(resolveDogStyle({ ...last, defaultStyle: kept, breedStyles: { [breed]: kept } }, breed), deleted);
  });
}
check('resolver selects the first available style when default and override are invalid', () => {
  const config = { ...blank(), defaultStyle: 'missing', deletedStyles: ['classic', 'round'], breedStyles: { poodle: 'round' } };
  assert.equal(resolveDogStyle(config, 'poodle'), 'mochi'); assert.equal(resolveDogStyle(config, 'shiba'), 'mochi');
});
check('null config keeps the full catalog and unknown style IDs remain unavailable', () => {
  assert.deepEqual(activeDogStyles(null), dogStyles); assert.deepEqual(activeDogStyles(undefined), dogStyles);
  for (const value of [null, undefined, 'unknown', '__proto__', 0, false, {}, []]) assert.equal(isStyleAvailable(blank(), value), false);
});
for (const [index, value] of [undefined, null, '0', true, false, -1, 0.1, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, 1n].entries())
  reject(`invalid revision ${index}`, { ...blank(), revision: value });
for (const [index, value] of [undefined, '0', true, false, -1, 0.1, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, 1n].entries())
  reject(`invalid updated time ${index}`, { ...blank(), updatedAt: value });
for (const revision of [0, 1, 1234, Number.MAX_SAFE_INTEGER]) for (const updatedAt of [null, 0, 1, 1_800_000_000_000, Number.MAX_SAFE_INTEGER])
  check(`valid finite revision/time ${revision}/${updatedAt}`, () => assert.deepEqual(parseAppearance({ ...blank(), revision, updatedAt }), { ...blank(), revision, updatedAt }));

check('own prototype keys from actual JSON are rejected without pollution', () => {
  const before = Object.prototype.polluted;
  const data = JSON.parse('{"defaultStyle":"classic","breedStyles":{"__proto__":{"polluted":true}},"revision":0,"updatedAt":null}');
  assert.throws(() => parseAppearance(data), Error);
  assert.equal(Object.prototype.polluted, before);
});
check('inherited override properties are not copied into the public result', () => {
  const overrides = Object.create({ poodle: 'fluffy', polluted: true }); overrides.shiba = 'round';
  const result = parseAppearance({ ...blank(), breedStyles: overrides });
  assert.deepEqual(result.breedStyles, { shiba: 'round' });
  assert.equal(resolveDogStyle(result, 'poodle'), 'classic');
  assert.equal(Object.getPrototypeOf(result.breedStyles), Object.prototype);
});
check('private and prototype-shaped top-level extras are stripped', () => {
  const data = JSON.parse('{"defaultStyle":"round","breedStyles":{"poodle":"soft"},"revision":2,"updatedAt":10,"token":"private","playerId":"private","realName":"private","photo":"private","__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}');
  const result = parseAppearance(data);
  assert.deepEqual(Object.keys(result).sort(), ['breedStyles', 'defaultStyle', 'deletedStyles', 'revision', 'updatedAt']);
  assert.deepEqual(result, { defaultStyle: 'round', breedStyles: { poodle: 'soft' }, deletedStyles: [], revision: 2, updatedAt: 10 });
  assert.equal(Object.getPrototypeOf(result), Object.prototype); assert.equal(Object.prototype.polluted, undefined);
});
check('parse makes its own map and deletion list without modifying or retaining the source', () => {
  const source = Object.freeze({ ...blank(), breedStyles: Object.freeze({ poodle: 'mochi' }), deletedStyles: Object.freeze(['badge']) });
  const result = parseAppearance(source);
  assert.notEqual(result, source); assert.notEqual(result.breedStyles, source.breedStyles); assert.notEqual(result.deletedStyles, source.deletedStyles);
  result.breedStyles.poodle = 'round'; assert.equal(source.breedStyles.poodle, 'mochi');
  result.deletedStyles.push('soft'); assert.deepEqual(source.deletedStyles, ['badge']);
});

// Execute the live wrapper with a context stub and a renderer marker: this isolates
// configuration choice from the independently verified SVG artwork and React hooks.
const Renderer = () => null;
let contextConfig = blank();
const wrapper = load('src/components/styled-pixel-dog.tsx', {
  '@/lib/dog-styles': styles,
  './pixel-dog': { PixelDog: Renderer, pixelBreeds: [] },
  './dog-appearance-provider': { useDogAppearance: () => contextConfig },
});
for (const breed of styleBreedIds) for (const style of ids) check(`live wrapper ${breed}/${style}`, () => {
  contextConfig = { ...blank(), defaultStyle: 'classic', breedStyles: { [breed]: style } };
  const props = { breed, mood: 'walk', frame: 1, fur: '#ffeedd', eyes: '#223344', accessory: 'ribbon', look: -1, groundShadow: false, decorative: true };
  const rendered = wrapper.PixelDog(props);
  assert.equal(rendered.type, Renderer); assert.deepEqual(rendered.props, { ...props, styleId: style });
  assert.equal(wrapper.PixelDog({ ...props, styleId: 'classic' }).props.styleId, 'classic');
});
check('wrapper default breed and default style agree with the renderer', () => {
  contextConfig = { ...blank(), defaultStyle: 'soft', breedStyles: { shiba: 'pocket' } };
  assert.equal(wrapper.PixelDog({}).props.styleId, 'pocket');
  assert.equal(wrapper.PixelDog({ styleId: 'badge' }).props.styleId, 'badge');
});
check('live wrapper ignores deleted server defaults and breed overrides', () => {
  contextConfig = { ...blank(), defaultStyle: 'classic', breedStyles: { shiba: 'badge' }, deletedStyles: ['classic', 'badge'] };
  assert.equal(wrapper.PixelDog({ breed: 'shiba' }).props.styleId, 'round');
  assert.equal(wrapper.PixelDog({ breed: 'poodle' }).props.styleId, 'round');
});

console.log(`PASS: ${checks} style configuration checks; 16 styles / 7 breeds, backend parity, deletion, legacy normalization, inheritance, validation, prototype safety, and live wrapper.`);
