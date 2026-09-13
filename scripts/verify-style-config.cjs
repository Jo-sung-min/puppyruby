#!/usr/bin/env node
'use strict';

// Read-only checks against the real TypeScript modules, compiled with installed Next SWC.
// No server requests, settings writes, asset exports, or user data access.
// Run: node scripts/verify-style-config.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { resolveFrontendDependency } = require('./frontend-loader.cjs');
const { createHash } = require('node:crypto');
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
  loaded.require = name => Object.hasOwn(overrides, name) ? overrides[name] : resolveFrontendDependency(filename, name, fallback);
  loaded._compile(compiled, filename);
  return loaded.exports;
}
const styles = load('src/lib/dog-styles.ts');
const { isPremiumDogStyleId, premiumDogStyles, premiumDogAsset } = load('src/lib/premium-dog-styles.ts');
const { isOriginalArtDogStyleId, originalArtDogStyles, originalArtDogAsset } = load('src/lib/original-art-dog-styles.ts');
const { art16SceneStyleId, art16SceneStyles, art16SceneAsset, art16ScenesReady } = load('src/lib/art16-scene-styles.ts');
const { spSceneStyles, isSpSceneStyleId, spScenesReady, spSceneFamily, spSceneAsset } = load('src/lib/sp-scene-styles.ts');
const { parseAppearance } = load('src/lib/dog-appearance.ts', { './dog-styles': styles });
const { dogStyles, pixelDogStyles, styleBreedIds, styleBreeds, defaultAppearance, resolveDogStyle, isDogStyleId, activeDogStyles, isStyleAvailable } = styles;
const ids = dogStyles.map(style => style.id);
const editablePixelStyles = pixelDogStyles.filter(style => !isPremiumDogStyleId(style.id) && !isOriginalArtDogStyleId(style.id) && style.id !== art16SceneStyleId && !isSpSceneStyleId(style.id));
const backend = fs.readFileSync(path.join(root, 'backend/src/main/java/com/puppyruby/appearance/AppearanceService.java'), 'utf8');
function javaList(name) {
  if (name === "BREEDS") return [...fs.readFileSync(path.join(root, "backend/src/main/java/com/puppyruby/game/BreedCatalog.java"), "utf8").matchAll(/new Breed\("([^"\\]+)"/g)].map(match => match[1]);
  const match = backend.match(new RegExp(`public static final List<String> ${name} = List\\.of\\(([\\s\\S]*?)\\);`));
  assert.ok(match, `Backend ${name} catalog was not found`);
  return [...match[1].matchAll(/"([^"\\]+)"/g)].map(value => value[1]);
}
const blank = () => ({ defaultStyle: 'classic', breedStyles: {}, deletedStyles: [], varieties: [], breedVarieties: {}, revision: 0, updatedAt: null });
const reject = (name, value) => check(name, () => assert.throws(() => parseAppearance(value), Error));

check('pixel collections and one animated style match backend order', () => {
  assert.equal(ids.length, 68 + premiumDogStyles.length + originalArtDogStyles.length + art16SceneStyles.length + spSceneStyles.length); assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids, javaList('STYLES').filter(id => (art16ScenesReady || id !== art16SceneStyleId) && (!isSpSceneStyleId(id) || spScenesReady(spSceneFamily(id)))));
  assert.equal(pixelDogStyles.length, ids.length - 1); assert.ok(pixelDogStyles.every(style => style.kind === 'pixel'));
  assert.deepEqual(dogStyles.filter(style => style.kind === 'animated').map(style => style.id), ['animated-2d']);
});
check('exact thirty breed IDs match the backend in order', () => {
  assert.equal(styleBreedIds.length, 30); assert.equal(new Set(styleBreedIds).size, 30);
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
  assert.match(style.id, /^[a-z0-9-]{1,23}$/);
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
for (const key of ['unknown-breed', 'Poodle', '0', '__proto__', 'prototype', 'constructor', 'toString', 'hasOwnProperty']) {
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
  assert.deepEqual(Object.keys(result).sort(), ['breedStyles', 'breedVarieties', 'defaultStyle', 'deletedStyles', 'revision', 'updatedAt', 'varieties']);
  assert.deepEqual(result, { ...blank(), defaultStyle: 'round', breedStyles: { poodle: 'soft' }, revision: 2, updatedAt: 10 });
  assert.equal(Object.getPrototypeOf(result), Object.prototype); assert.equal(Object.prototype.polluted, undefined);
});
check('parse makes its own map and deletion list without modifying or retaining the source', () => {
  const source = Object.freeze({ ...blank(), breedStyles: Object.freeze({ poodle: 'mochi' }), deletedStyles: Object.freeze(['badge']) });
  const result = parseAppearance(source);
  assert.notEqual(result, source); assert.notEqual(result.breedStyles, source.breedStyles); assert.notEqual(result.deletedStyles, source.deletedStyles);
  result.breedStyles.poodle = 'round'; assert.equal(source.breedStyles.poodle, 'mochi');
  result.deletedStyles.push('soft'); assert.deepEqual(source.deletedStyles, ['badge']);
});

const variety = (changes = {}) => ({ id:'00000000-0000-4000-8000-000000000001', breed:'pomeranian', name:'곰돌이 타입',
  style:null, shape:'teddy', pattern:'patches', coatColor:null, patternColor:'#F7E6CF', ...changes });
const varietyConfig = (items = [variety()], bindings = { pomeranian:items[0]?.id }) => ({ ...blank(), varieties:items, breedVarieties:bindings });
const varietyId = index => `00000000-0000-4000-8000-${String(index).padStart(12,'0')}`;
check('legacy server config without both variety fields normalizes safely', () => {
  const old=blank();delete old.varieties;delete old.breedVarieties;assert.deepEqual(parseAppearance(old),blank());
});
check('shape and pattern options match the server catalog', () => {
  assert.deepEqual(styles.varietyShapes,javaList('SHAPES'));assert.deepEqual(styles.varietyPatterns,javaList('PATTERNS'));
});
for(const value of [null,undefined,{},'type',0,false,[null],[[]],new Array(1)])
  reject('variety list rejects invalid shapes',{...blank(),varieties:value,breedVarieties:{}});
for(const value of [null,undefined,[],'type',0,false])
  reject('binding map rejects invalid shapes',{...blank(),varieties:[variety()],breedVarieties:value});
for(const key of Object.keys(variety())){
  const missing=variety();delete missing[key];reject(`variety missing ${key}`,varietyConfig([missing],{}));
}
for(const id of [null,undefined,0,'','abc','1-1-1-1-1','00000000-0000-4000-8000-00000000000A','__proto__'])
  reject('variety requires canonical UUID',varietyConfig([variety({id})],{}));
for(const name of [null,undefined,0,'','   ','가'.repeat(25),'🐶'.repeat(25),'강\u0000아지','강\u0009아지','강\u000A아지','강\u007F아지','강\u0085아지','강\u200B아지','강\u200D아지','강\u202E아지','강\u2066아지'])
  reject('variety rejects empty long or control-character name',varietyConfig([variety({name})]));
for(const name of ['가','가'.repeat(24),'🐶'.repeat(24),'  포근한 친구  '])check('variety name supports bounded Unicode and trims edges',()=>{
  assert.equal(parseAppearance(varietyConfig([variety({name})])).varieties[0].name,name.trim());
});
for(const [key,values]of Object.entries({breed:[null,undefined,'unknown-breed','Pomeranian','__proto__'],shape:[null,undefined,'bear','Teddy',1],pattern:[null,undefined,'stripe','Solid',1],style:[undefined,'unknown','CLASSIC',1],coatColor:[undefined,'red','#fff','#12345g','url(https://evil.invalid)',0],patternColor:[null,undefined,'','#FFF','#12345678',0]}))
  for(const value of values)reject(`variety rejects invalid ${key}`,varietyConfig([variety({[key]:value})]));
check('variety normalizes hex colors without retaining private fields',()=>{
  const source=variety({coatColor:'#aAbBcC',patternColor:'#ddeeff',token:'private',playerId:'private'});
  const parsed=parseAppearance(varietyConfig([source])).varieties[0];
  assert.deepEqual(parsed,variety({coatColor:'#AABBCC',patternColor:'#DDEEFF'}));assert.notEqual(parsed,source);
});
for(const style of ids)check(`variety can select ${style}`,()=>{
  const parsed=parseAppearance(varietyConfig([variety({style})]));assert.equal(styles.resolveDogStyle(parsed,'pomeranian'),style);
});
for(const shape of styles.varietyShapes)for(const pattern of styles.varietyPatterns)check(`variety accepts configured ${shape}/${pattern}`,()=>{
  const parsed=parseAppearance(varietyConfig([variety({shape,pattern})]));assert.equal(parsed.varieties[0].shape,shape);assert.equal(parsed.varieties[0].pattern,pattern);
});
reject('same UUID cannot belong to two varieties',varietyConfig([variety(),variety({breed:'poodle',name:'다른 친구'})],{}));
reject('same-breed names are case and whitespace insensitive',varietyConfig([
  variety({name:'Fluffy   Friend'}),variety({id:varietyId(2),name:'  fluffy friend  '}),
],{}));
reject('same-breed names normalize Unicode spaces',varietyConfig([
  variety({name:'포근한\u00a0친구'}),variety({id:varietyId(2),name:'포근한 친구'}),
],{}));
check('different breeds may use the same display name',()=>{
  assert.equal(parseAppearance(varietyConfig([variety(),variety({id:varietyId(2),breed:'poodle'})],{})).varieties.length,2);
});
const fullVarieties=styleBreedIds.slice(0,7).flatMap((breed,breedIndex)=>Array.from({length:20},(_,index)=>variety({
  id:varietyId(breedIndex*20+index+1),breed,name:`종류 ${index+1}`,
})));
check('all seven breeds can retain twenty varieties each',()=>{
  const bindings=Object.fromEntries(styleBreedIds.slice(0,7).map((breed,index)=>[breed,varietyId(index*20+1)]));
  const result=parseAppearance(varietyConfig(fullVarieties,bindings));assert.equal(result.varieties.length,140);assert.deepEqual(result.breedVarieties,bindings);
});
reject('one breed cannot exceed twenty varieties',varietyConfig([...fullVarieties.slice(0,20),variety({id:varietyId(999),name:'종류21'})],{}));
reject('overall catalog cannot exceed140 varieties',varietyConfig([...fullVarieties,variety({id:varietyId(999),name:'초과'})],{}));
for(const binding of [{pomeranian:varietyId(2)},{poodle:varietyId(1)},{husky:varietyId(1)},{pomeranian:null},{pomeranian:0},{pomeranian:'__proto__'},Object.fromEntries([['__proto__',varietyId(1)]]),Object.fromEntries([['constructor',varietyId(1)]])])
  reject('binding must name an existing variety of the same breed',varietyConfig([variety()],binding));
reject('deleting a variety also requires removing its binding',varietyConfig([],{pomeranian:varietyId(1)}));
check('removing variety and its binding together is valid',()=>assert.deepEqual(parseAppearance(varietyConfig([],{})),blank()));
for(const bindings of [{},{pomeranian:varietyId(1)}])reject('deleted styles cannot remain on bound or unbound varieties',{
  ...varietyConfig([variety({style:'round'})],bindings),deletedStyles:['round'],
});
check('variety may inherit after its formerly selected style is deleted',()=>{
  const parsed=parseAppearance({...varietyConfig(),defaultStyle:'soft',deletedStyles:['round'],breedStyles:{pomeranian:'mochi'}});
  assert.equal(styles.resolveDogStyle(parsed,'pomeranian'),'mochi');
  assert.equal(styles.resolveDogStyle({...parsed,breedStyles:{}},'pomeranian'),'soft');
});
check('public variety result strips inherited bindings and prototype extras',()=>{
  const bindings=Object.create({poodle:varietyId(2),polluted:true});bindings.pomeranian=varietyId(1);
  const raw=JSON.parse(JSON.stringify(variety()));Object.defineProperty(raw,'__proto__',{value:{polluted:true},enumerable:true});
  const result=parseAppearance(varietyConfig([raw],bindings));assert.deepEqual(result.varieties,[variety()]);assert.deepEqual(result.breedVarieties,{pomeranian:varietyId(1)});
  assert.equal(Object.prototype.polluted,undefined);
});
check('variety result owns its array objects and bindings',()=>{
  const source=Object.freeze({...blank(),varieties:Object.freeze([Object.freeze(variety())]),breedVarieties:Object.freeze({pomeranian:varietyId(1)})});
  const result=parseAppearance(source);assert.notEqual(result.varieties,source.varieties);assert.notEqual(result.varieties[0],source.varieties[0]);assert.notEqual(result.breedVarieties,source.breedVarieties);
  result.varieties[0].name='다른이름';result.breedVarieties.pomeranian='다른값';assert.equal(source.varieties[0].name,'곰돌이 타입');assert.equal(source.breedVarieties.pomeranian,varietyId(1));
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
  assert.equal(rendered.type, Renderer); assert.deepEqual(rendered.props, { ...props, styleId: style, variant: undefined });
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
check('live wrapper forwards selected variety look and highest-priority style',()=>{
  contextConfig={...varietyConfig([variety({style:'animated-2d'})]),defaultStyle:'mini',breedStyles:{pomeranian:'pocket'}};
  const selected=wrapper.PixelDog({breed:'pomeranian'}).props;
  assert.equal(selected.styleId,'animated-2d');assert.deepEqual(selected.variant,contextConfig.varieties[0]);
  const explicitLook={shape:'fox',pattern:'blaze',coatColor:'#abcdef',patternColor:'#ffffff'};
  const explicit=wrapper.PixelDog({breed:'pomeranian',styleId:'classic',variant:explicitLook}).props;
  assert.equal(explicit.styleId,'classic');assert.deepEqual(explicit.variant,explicitLook);
  const other=wrapper.PixelDog({breed:'poodle'}).props;assert.equal(other.styleId,'mini');assert.equal(other.variant,undefined);
});

const React = requireFrontend('react');
const { renderToStaticMarkup } = requireFrontend('react-dom/server');
const sharp = requireFrontend('sharp');
const animated = load('src/components/animated-dog.tsx', { './animated-dog.module.css': new Proxy({}, { get: (_, key) => String(key) }) });
const { PixelDog } = load('src/components/pixel-dog.tsx', { './animated-dog': animated });
const originalIds = ['classic','round','mochi','chibi','bean','plush','storybook','bold','retro','mini','sticker','soft','fluffy','pocket','cookie','badge'];
const moods = ['idle','love','eat','play','sleep','typing','excited','scroll','drag','walk'];
const digest = value => createHash('sha256').update(value).digest('hex');
const svg = props => renderToStaticMarkup(React.createElement(PixelDog, props));
// Breed silhouettes and markings deliberately changed; exercise all legacy poses without pinning the old artwork.
for (const breed of styleBreedIds) for (const styleId of originalIds) for (const [index, mood] of moods.entries()) {
  check(`legacy pose remains valid ${breed}/${styleId}/${mood}`, () => {
    const markup = svg({ breed, styleId, mood, frame:index%2, look:-1, fur:'#ffeedd', eyes:'#223344', accessory:['none','ribbon','scarf','crown','bow-blue','bow-lilac','party-hat','flower','glasses','angel-wings'][index] });
    assert.match(markup, /viewBox="0 0 64 64"/); assert.doesNotMatch(markup, /NaN|Infinity/);
  });
}
check('animated selection invokes the actual 2D renderer', () => {
  const element = PixelDog({ breed:'poodle', styleId:'animated-2d', mood:'walk' });
  assert.equal(element.type, animated.AnimatedDog);
  const markup = renderToStaticMarkup(element);
  assert.match(markup, /data-dog-style="animated-2d"/); assert.doesNotMatch(markup, /shape-rendering="crispEdges"/);
});

async function verifyArt() {
  for (const breed of styleBreedIds) {
    const geometries = new Set(), rasterHashes = new Set();
    for (const { id:styleId } of editablePixelStyles) {
      const markup = svg({ breed, styleId, groundShadow:false });
      check(`real geometry ${breed}/${styleId}`, () => {
        assert.match(markup, /viewBox="0 0 64 64"/); assert.doesNotMatch(markup, /NaN|Infinity/);
        const geometry = [...markup.matchAll(/\b(?:d|cx|cy|rx|ry|x|y|width|height|points|transform)="([^"]*)"/g)].map(match => match[0]).join('|');
        const hash = digest(geometry); assert.ok(!geometries.has(hash), 'Geometry must differ even when colors and metadata are ignored'); geometries.add(hash);
      });
      const source = markup.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" ');
      const raster = await sharp(Buffer.from(source)).ensureAlpha().raw().toBuffer();
      check(`visible unique raster ${breed}/${styleId}`, () => {
        const hash = digest(raster); assert.ok(!rasterHashes.has(hash), 'Two styles render the same pixels'); rasterHashes.add(hash);
        assert.ok(raster.filter((value,index) => index%4===3 && value>0).length > 120);
      });
      if (!originalIds.includes(styleId)) {
        const paddedSource = source.replace('viewBox="0 0 64 64"', 'viewBox="-8 -8 80 80"').replace('width="64" height="64"', 'width="80" height="80"');
        const padded = await sharp(Buffer.from(paddedSource)).ensureAlpha().raw().toBuffer();
        check(`new silhouette fits native canvas ${breed}/${styleId}`, () => {
          let outside=0; for(let y=0;y<80;y++) for(let x=0;x<80;x++) if((x<8||x>=72||y<8||y>=72) && padded[(y*80+x)*4+3]>0) outside++;
          assert.equal(outside,0,'Dog silhouette extends beyond its64px canvas');
        });
      }
      const variants = new Set(), variantPixels = new Set();
      for (const shape of styles.varietyShapes) for (const pattern of styles.varietyPatterns) {
        const variant = { shape, pattern, coatColor:'#d5aa86', patternColor:'#86543b' };
        const varied = svg({ breed, styleId, variant, groundShadow:false });
        const normalized = varied.replace(/coat-[a-zA-Z0-9_-]+/g,'coat-fixture');
        check(`variant changes visible drawing ${breed}/${styleId}/${shape}/${pattern}`, () => {
          const drawing = [...normalized.matchAll(/\b(?:d|fill|stroke|cx|cy|rx|ry|points|transform)="([^"]*)"/g)].map(match=>match[0]).join('|');
          const hash=digest(drawing); assert.ok(!variants.has(hash),'Shape/pattern must change artwork, not only metadata'); variants.add(hash);
          if(pattern!=='solid') {
            // Indexed Aseprite styles mask each fur pixel directly; their native alpha is checked separately.
            if (/^(cozy|bean|bright|button)-(chubby|slim|tall|loaf)$/.test(styleId)) assert.match(varied,new RegExp(`data-coat-pattern="${pattern}"`));
            else assert.match(varied,/clip-path="url\(#coat-/);
          }
          assert.doesNotMatch(varied,/NaN|Infinity/);
        });
        if(breed==='pomeranian'||breed==='beagle') {
          const raster=await sharp(Buffer.from(varied.replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" '))).ensureAlpha().raw().toBuffer();
          check(`variant has distinct raster ${breed}/${styleId}/${shape}/${pattern}`,()=>{
            const hash=digest(raster); assert.ok(!variantPixels.has(hash),'Variant geometry/pattern must remain visible inside the canvas');variantPixels.add(hash);
          });
        }
      }
    }
    check(`each breed offers ${editablePixelStyles.length} distinct editable pixel results: ${breed}`, () => { assert.equal(geometries.size,editablePixelStyles.length); assert.equal(rasterHashes.size,editablePixelStyles.length); });
  }
  for(const styleId of ids.filter(id => !isPremiumDogStyleId(id) && !isOriginalArtDogStyleId(id) && id !== art16SceneStyleId && !isSpSceneStyleId(id))) check(`explicit coat and eyes retain priority ${styleId}`, () => {
    const markup=svg({styleId,fur:'#123456',eyes:'#654321',variant:{shape:'original',pattern:'solid',coatColor:'#abcdef',patternColor:'#ffffff'}});
    const otherEyes=svg({styleId,fur:'#123456',eyes:'#112233',variant:{shape:'original',pattern:'solid',coatColor:'#abcdef',patternColor:'#ffffff'}});
    assert.ok(markup.includes('#123456')); assert.notEqual(markup,otherEyes); assert.ok(!markup.includes('#abcdef'));
  });
  for (const style of [...premiumDogStyles, ...originalArtDogStyles]) check(`original art retains priority ${style.id}`, () => {
    const source = svg({ styleId: style.id, groundShadow: false });
    const changed = svg({ styleId: style.id, groundShadow: false, breed: 'dalmatian', fur: '#123456', eyes: '#654321', variant: { shape: 'fox', pattern: 'patches', coatColor: '#abcdef', patternColor: '#ffffff' } });
    assert.equal(changed, source); assert.ok(source.includes((premiumDogAsset(style.id) || originalArtDogAsset(style.id)).png));
  });
  if(process.argv.includes('--preview')) {
    const overlays=[];
    for(const [index,style]of pixelDogStyles.entries()){
      const markup=svg({breed:'pomeranian',styleId:style.id,groundShadow:false});
      const original = premiumDogAsset(style.id) || originalArtDogAsset(style.id) || (style.id === art16SceneStyleId ? art16SceneAsset('pomeranian')?.scenes.idle : isSpSceneStyleId(style.id) ? spSceneAsset(style.id, 'pomeranian')?.scenes.idle : undefined);
      const sprite= original ? await sharp(path.join(root, 'local-assets/site', original.png)).resize(96,96,{kernel:'nearest',fit:'contain'}).png().toBuffer()
        : await sharp(Buffer.from(markup.replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" '))).resize(96,96,{kernel:'nearest'}).png().toBuffer();
      overlays.push({input:sprite,left:(index%10)*124+14,top:Math.floor(index/10)*130+6});
      const label=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="124" height="24"><text x="62" y="17" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" fill="#453d38">${index+1}. ${style.id}</text></svg>`);
      overlays.push({input:await sharp(label).png().toBuffer(),left:(index%10)*124,top:Math.floor(index/10)*130+106});
    }
    const folder=path.join(root,'backend/build');fs.mkdirSync(folder,{recursive:true});
    await sharp({create:{width:1240,height:Math.ceil(pixelDogStyles.length/10)*130,channels:4,background:'#fffaf3'}}).composite(overlays).png().toFile(path.join(folder,`pixel-styles-${pixelDogStyles.length}-proof.png`));
  }
  console.log(`PASS: ${checks} checks; ${pixelDogStyles.length} distinct pixel styles / ${styleBreedIds.length} breeds + animated2D, legacy pose compatibility, 18 shape/pattern combinations, backend parity, inheritance and validation.`);
}
verifyArt().catch(error => { console.error(error.message); process.exitCode=1; });

