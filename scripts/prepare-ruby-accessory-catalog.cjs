'use strict';

// shared/accessories.json is the source of truth. The checked-in frontend copy
// keeps Turbopack inside its project root and is refreshed before dev/build/typecheck.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'shared/accessories.json');
const target = path.join(root, 'frontend/src/lib/generated/ruby-accessories.json');
const catalog = JSON.parse(fs.readFileSync(source, 'utf8'));
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const exactFields = (value, required, allowed, label) => {
  if (!record(value) || required.some(key => !Object.hasOwn(value, key)) || Object.keys(value).some(key => !allowed.includes(key)))
    throw new Error(`Invalid ${label} fields`);
};
const text = (value, max, pattern, label) => {
  if (typeof value !== 'string' || value !== value.trim() || !value || [...value].length > max || /[\u0000-\u001f\u007f]/u.test(value)
    || pattern && !pattern.test(value)) throw new Error(`Invalid ${label}`);
  return value;
};
const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const finite = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
const rootFields = ['schemaVersion', 'revision', 'items'];
const itemRequired = ['id', 'label', 'availability', 'slot', 'layer', 'renderer', 'revision'];
const itemAllowed = [...itemRequired, 'emoji', 'grade', 'weight', 'asset', 'defaultTransform'];
const legacyFree = new Set(['ribbon', 'scarf', 'crown']);
const legacyPaid = new Set(['bow-blue', 'bow-lilac', 'party-hat', 'flower', 'glasses', 'halo', 'angel-wings']);
const legacyBuiltin = new Set([...legacyFree, ...legacyPaid]);

exactFields(catalog, rootFields, rootFields, 'accessory catalog');
if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.items) || catalog.items.length < 1 || catalog.items.length > 1000)
  throw new Error('shared/accessories.json does not match schemaVersion 1');
text(catalog.revision, 80, /^[A-Za-z0-9._-]+$/u, 'catalog revision');
const ids = new Set();
for (const item of catalog.items) {
  exactFields(item, itemRequired, itemAllowed, 'accessory item');
  text(item.id, 40, /^[a-z0-9]+(?:-[a-z0-9]+)*$/u, 'accessory id');
  if (item.id === 'none' || ids.has(item.id)) throw new Error('Duplicate or reserved accessory id');
  ids.add(item.id);
  text(item.label, 80, null, 'accessory label');
  if (item.emoji !== undefined) text(item.emoji, 16, null, 'accessory emoji');
  if (!['free', 'paid'].includes(item.availability) || !['face', 'head', 'neck', 'back'].includes(item.slot)
    || !['behind', 'front'].includes(item.layer) || !['builtin', 'image'].includes(item.renderer)) throw new Error(`Invalid accessory contract: ${item.id}`);
  const revision = typeof item.revision === 'number' && integer(item.revision, 1, 1_000_000) ? String(item.revision) : item.revision;
  text(revision, 80, /^[A-Za-z0-9._-]+$/u, 'item revision');
  if (item.availability === 'paid') {
    if (!['R', 'SR', 'SSR'].includes(item.grade) || !integer(item.weight, 0, 1_000_000)) throw new Error(`Paid metadata missing: ${item.id}`);
  } else if (item.grade !== undefined || item.weight !== undefined) throw new Error(`Free item has paid metadata: ${item.id}`);
  if (item.renderer === 'builtin') {
    if (!legacyBuiltin.has(item.id) || item.asset !== undefined) throw new Error(`Unreviewed builtin accessory: ${item.id}`);
  } else {
    exactFields(item.asset, ['png', 'sha256', 'width', 'height', 'pivotX', 'pivotY'], ['png', 'sha256', 'width', 'height', 'pivotX', 'pivotY'], 'accessory asset');
    if (item.asset.png !== `/images/ruby-round-v1/accessories/${item.id}.png` || !/^[a-f0-9]{64}$/u.test(item.asset.sha256)
      || !integer(item.asset.width, 1, 2048) || !integer(item.asset.height, 1, 2048)
      || !finite(item.asset.pivotX, 0, item.asset.width) || !finite(item.asset.pivotY, 0, item.asset.height)) throw new Error(`Invalid accessory asset: ${item.id}`);
    if (item.availability === 'paid' && item.weight !== 0) throw new Error(`New paid image accessory must start with weight 0: ${item.id}`);
  }
  if (item.defaultTransform !== undefined) {
    exactFields(item.defaultTransform, [], ['offsetX', 'offsetY', 'scaleX', 'scaleY', 'rotation', 'flipX'], 'default transform');
    const transform = item.defaultTransform;
    if (transform.offsetX !== undefined && !finite(transform.offsetX, -512, 512)
      || transform.offsetY !== undefined && !finite(transform.offsetY, -512, 512)
      || transform.scaleX !== undefined && !finite(transform.scaleX, .05, 2)
      || transform.scaleY !== undefined && !finite(transform.scaleY, .05, 2)
      || transform.rotation !== undefined && !finite(transform.rotation, -180, 180)
      || transform.flipX !== undefined && typeof transform.flipX !== 'boolean') throw new Error(`Invalid default transform: ${item.id}`);
  }
}
for (const id of legacyFree) if (!catalog.items.some(item => item.id === id && item.availability === 'free')) throw new Error(`Missing legacy free accessory: ${id}`);
for (const id of legacyPaid) if (!catalog.items.some(item => item.id === id && item.availability === 'paid')) throw new Error(`Missing legacy paid accessory: ${id}`);
if (!catalog.items.some(item => item.availability === 'paid' && item.weight > 0)) throw new Error('Paid accessory weights cannot all be zero');
if (process.argv.includes('--require-release')) {
  const imageItems = catalog.items.filter(item => item.renderer === 'image');
  if (imageItems.length) {
    const releasePath = path.join(root, 'frontend/src/lib/generated/ruby-round-media-release.json');
    const release = JSON.parse(fs.readFileSync(releasePath, 'utf8'));
    const released = new Map(Array.isArray(release.accessories) ? release.accessories.map(item => [item.id, item]) : []);
    if (release.accessoryCatalogRevision !== catalog.revision || released.size !== imageItems.length
      || imageItems.some(item => {
        const value = released.get(item.id);
        return !record(value) || value.png !== item.asset.png || value.sha256 !== item.asset.sha256
          || value.width !== item.asset.width || value.height !== item.asset.height;
      })) throw new Error('Publish and verify the current accessory catalog to S3/CDN before the frontend production build');
    const overrideBase = (process.env.NEXT_PUBLIC_RUBY_ROUND_BASE_URL || '').trim().replace(/\/+$/u, '');
    if (overrideBase && overrideBase !== String(release.baseUrl || '').replace(/\/+$/u, ''))
      throw new Error('NEXT_PUBLIC_RUBY_ROUND_BASE_URL must match the verified active Ruby Round release when image accessories are enabled');
  }
}
fs.writeFileSync(target, JSON.stringify(catalog, null, 2) + '\n');
console.log(`SYNCED ${path.relative(root, source)} -> ${path.relative(root, target)} (${catalog.items.length} items)`);
