#!/usr/bin/env node
'use strict';

// Runs real preset helpers and admin cards without a server, account, or settings writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const frontend = path.join(root, 'frontend');
const requireFrontend = Module.createRequire(path.join(frontend, 'package.json'));
const swc = requireFrontend('next/dist/build/swc');
const React = requireFrontend('react');
const { renderToStaticMarkup } = requireFrontend('react-dom/server');
const cache = new Map();
let checks = 0;
function check(name, run) {
  try { run(); checks++; }
  catch (error) { throw new Error(`${name}: ${error.message}`, { cause: error }); }
}
function load(relative, overrides = {}) {
  const filename = path.resolve(frontend, relative);
  if (Object.keys(overrides).length === 0 && cache.has(filename)) return cache.get(filename);
  const compiled = swc.transformSync(fs.readFileSync(filename, 'utf8'), {
    filename, jsc: { parser: { syntax: 'typescript', tsx: filename.endsWith('.tsx') },
      transform: { react: { runtime: 'automatic' } }, target: 'es2020' }, module: { type: 'commonjs' },
  }).code;
  const loaded = new Module(filename, module);
  loaded.filename = filename; loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const fallback = loaded.require.bind(loaded);
  loaded.require = name => {
    if (Object.hasOwn(overrides, name)) return overrides[name];
    if (name.endsWith('.module.css')) return new Proxy({}, { get: (_, key) => String(key) });
    if (name.startsWith('.') || name.startsWith('@/')) {
      const base = name.startsWith('@/') ? path.join(frontend, 'src', name.slice(2)) : path.resolve(path.dirname(filename), name);
      for (const suffix of ['.ts', '.tsx']) if (fs.existsSync(base + suffix)) return load(path.relative(frontend, base + suffix));
    }
    return fallback(name);
  };
  loaded._compile(compiled, filename);
  if (Object.keys(overrides).length === 0) cache.set(filename, loaded.exports);
  return loaded.exports;
}
const presets = load('src/lib/dog-coat-presets.ts');
const { shibaCoatPresets, findCoatPresetVariety, addCoatPreset } = presets;
const styles = load('src/lib/dog-styles.ts');
const { parseAppearance } = load('src/lib/dog-appearance.ts');
const { PixelDog } = load('src/components/pixel-dog.tsx');
const { AdminDogVarieties } = load('src/components/account/admin-dog-varieties.tsx');
const blank = () => structuredClone(styles.defaultAppearance);
const makeVariety = (index, breed = 'shiba') => ({ id: `3472492e-afac-44e4-915e-${String(index + 100).padStart(12, '0')}`,
  breed, name: `종류 ${index}`, style: null, ...styles.defaultVariantLook });
const deepFreeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(deepFreeze); Object.freeze(value); }
  return value;
};
const base = blank();
check('importing the catalog does not seed server or draft defaults', () => assert.equal(base.varieties.length, 0));
check('ten distinct Shiba presets use valid stable IDs and distinct coat combinations', () => {
  assert.equal(shibaCoatPresets.length, 10);
  for (const field of ['id', 'varietyId', 'name']) assert.equal(new Set(shibaCoatPresets.map(item => item[field])).size, 10);
  assert.equal(new Set(shibaCoatPresets.map(({ coatColor, pattern, patternColor }) => `${coatColor}:${pattern}:${patternColor}`)).size, 10);
  for (const item of shibaCoatPresets) {
    assert.equal(item.breed, 'shiba'); assert.match(item.varietyId, /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
    assert.match(item.coatColor, /^#[\dA-F]{6}$/); assert.match(item.patternColor, /^#[\dA-F]{6}$/);
  }
});
let all = blank();
for (const preset of shibaCoatPresets) check(`draft registration, parser round trip, and reselect: ${preset.name}`, () => {
  const source = deepFreeze(structuredClone(all));
  const result = addCoatPreset(source, preset);
  assert.equal(result.added, true); assert.equal(result.variety.style, null); assert.equal(result.variety.id, preset.varietyId);
  assert.equal(result.config.varieties.length, all.varieties.length + 1); assert.notEqual(result.config, source);
  assert.deepEqual(result.config.breedVarieties, {}); assert.equal(result.config.defaultStyle, all.defaultStyle);
  assert.equal(result.config.revision, all.revision); assert.equal(result.config.updatedAt, all.updatedAt);
  assert.deepEqual(Object.keys(result.variety).sort(), ['id', 'breed', 'name', 'style', 'shape', 'pattern', 'coatColor', 'patternColor'].sort());
  assert.deepEqual(parseAppearance(result.config), result.config);
  const same = addCoatPreset(result.config, preset);
  assert.equal(same.added, false); assert.equal(same.config, result.config); assert.equal(same.variety, result.variety);
  all = result.config;
});
const first = shibaCoatPresets[0];
check('renamed and recolored presets retain their saved customization and style on reselect', () => {
  const config = structuredClone(all); Object.assign(config.varieties[0], { name: '나만의 시바', coatColor: '#123456', style: 'round' });
  const selected = addCoatPreset(config, first);
  assert.equal(selected.added, false); assert.equal(selected.config, config);
  assert.equal(selected.variety.name, '나만의 시바'); assert.equal(selected.variety.coatColor, '#123456'); assert.equal(selected.variety.style, 'round');
});
check('manually named equivalent selects existing entry without overwriting it', () => {
  const manual = { ...makeVariety(0), name: '  일반  시바 ', coatColor: '#123456' };
  const config = { ...blank(), varieties: [manual] };
  const selected = addCoatPreset(config, first);
  assert.equal(selected.added, false); assert.equal(selected.variety, manual); assert.equal(selected.variety.coatColor, '#123456');
});
check('same name in another breed does not block Shiba registration', () => {
  const config = { ...blank(), varieties: [{ ...makeVariety(0, 'poodle'), name: first.name }] };
  assert.equal(addCoatPreset(config, first).config.varieties.length, 2);
});
check('twenty entries block only that breed and still permit selecting an existing preset', () => {
  const full = { ...blank(), varieties: Array.from({ length: 20 }, (_, i) => makeVariety(i)) };
  assert.throws(() => addCoatPreset(full, first), /20개/);
  full.varieties[0] = all.varieties[0];
  assert.equal(addCoatPreset(full, first).added, false);
  const otherFull = { ...blank(), varieties: Array.from({ length: 20 }, (_, i) => makeVariety(i, 'poodle')) };
  assert.equal(addCoatPreset(otherFull, first).added, true);
});
const nonShiba = styles.styleBreedIds.filter(breed => breed !== 'shiba');
const totalFull = { ...blank(), varieties: Array.from({ length: 140 }, (_, i) => makeVariety(i, nonShiba[Math.floor(i / 20)])) };
check('global limit of 140 blocks addition even when the selected breed is empty', () => {
  assert.deepEqual(parseAppearance(totalFull), totalFull);
  assert.throws(() => addCoatPreset(totalFull, first), /140개/);
});
check('existing presets remain selectable at the total cap', () => {
  const full = structuredClone(totalFull); full.varieties[0] = all.varieties[0];
  assert.equal(addCoatPreset(full, first).added, false);
});
check('fixed ID collision cannot create invalid duplicate ID settings', () => {
  const config = { ...blank(), varieties: [{ ...makeVariety(0, 'poodle'), id: first.varietyId }] };
  assert.equal(findCoatPresetVariety(config, first), undefined);
  assert.throws(() => addCoatPreset(config, first), /등록 정보/);
});

function markup(config, options = {}) {
  return renderToStaticMarkup(React.createElement(AdminDogVarieties, { config, breed: 'shiba', busy: false,
    previewStyle: 'round', edit: () => { throw new Error('Render must not edit settings'); },
    select: () => { throw new Error('Render must not select a variety'); }, inherit: () => {}, ...options }));
}
const presetButtons = html => [...html.matchAll(/<button\b([^>]*class="admin-dog-coat-card"[^>]*)>/g)].map(match => match[1]);
check('ten real pixel cards render without seeding, selecting, or showing every blank card as selected', () => {
  const html = markup(blank()); const cards = presetButtons(html);
  assert.equal(cards.length, 10); assert.ok(cards.every(card => card.includes('aria-pressed="false"') && !card.includes('disabled')));
  assert.equal((html.match(/data-dog-style="round"/g) ?? []).length, 10);
  assert.match(html, /곰돌이형 추가/); assert.match(html, /여우형 추가/); assert.match(html, /변경사항 저장/);
});
check('only the selected existing preset is checked', () => {
  const cards = presetButtons(markup(all, { selected: all.varieties[2] }));
  assert.equal(cards.filter(card => card.includes('aria-pressed="true"')).length, 1);
  assert.match(cards[2], /백시바 선택/);
});
check('busy state disables all preset cards', () => assert.ok(presetButtons(markup(all, { busy: true })).every(card => card.includes('disabled'))));
check('full breed keeps existing preset button enabled but disables nine additions', () => {
  const full = { ...blank(), varieties: [all.varieties[0], ...Array.from({ length: 19 }, (_, i) => makeVariety(i))] };
  const cards = presetButtons(markup(full));
  assert.equal(cards.filter(card => card.includes('disabled')).length, 9); assert.ok(!cards[0].includes('disabled'));
});
check('global limit disables cards and generic additions and explains why', () => {
  const html = markup(totalFull); assert.ok(presetButtons(html).every(card => card.includes('disabled')));
  assert.match(html, /전체 종류가 140개예요/);
  assert.match(html, /placeholder="예: 크림 곰돌이, 얼룩 여우" disabled/);
});
check('other breeds retain kind editing without Shiba preset cards', () => {
  const html = markup(blank(), { breed: 'dalmatian' });
  assert.equal(presetButtons(html).length, 0); assert.match(html, /달마시안/); assert.match(html, /곰돌이형 추가/);
});
check('all ten color references produce distinct SVGs and intended visible coat colors', () => {
  const seen = new Set();
  for (const preset of shibaCoatPresets) {
    const svg = renderToStaticMarkup(React.createElement(PixelDog, { breed: 'shiba', styleId: 'round', variant: preset, decorative: true }));
    assert.ok(svg.toUpperCase().includes(preset.coatColor));
    if (preset.pattern !== 'solid') { assert.match(svg, new RegExp(`data-coat-pattern="${preset.pattern}"`)); assert.ok(svg.toUpperCase().includes(preset.patternColor)); }
    seen.add(createHash('sha256').update(svg.replace(/«[^»]*»/g, 'react-id').replace(/_R_[^_]*_/g, 'react-id')).digest('hex'));
  }
  assert.equal(seen.size, 10);
});

const hooks = { ...React, useId: () => 'preset-test', useState: value => [value, () => {}] };
const interactive = load('src/components/account/admin-dog-varieties.tsx', { react: hooks }).AdminDogVarieties;
function descendants(node) {
  if (!node || typeof node !== 'object') return [];
  return [node, ...React.Children.toArray(node.props?.children).flatMap(descendants)];
}
check('actual preset button adds only a draft and selects it; next click reselects instead of duplicating', () => {
  let config = blank(); let selectedId = ''; let notice = '';
  const render = () => interactive({ config, breed: 'shiba', busy: false, previewStyle: 'classic',
    edit: (update, message) => { config = update(config); notice = message; }, select: id => { selectedId = id; }, inherit: () => {} });
  descendants(render()).find(node => node.props?.['aria-label'] === `${first.name} 종류 추가`).props.onClick();
  assert.equal(config.varieties.length, 1); assert.equal(selectedId, first.varietyId); assert.deepEqual(config.breedVarieties, {}); assert.match(notice, /저장/);
  descendants(render()).find(node => node.props?.['aria-label'] === `${first.name} 선택`).props.onClick();
  assert.equal(config.varieties.length, 1); assert.equal(selectedId, first.varietyId); assert.match(notice, /이미 등록/);
});
console.log(`Dog coat preset verification passed: ${checks} checks (no network or settings writes).`);
