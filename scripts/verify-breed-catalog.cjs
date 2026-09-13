'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadFrontend } = require('./frontend-loader.cjs');
const { dogBreeds, dogBreedAt } = loadFrontend('src/lib/dog-breeds.ts');
const { breeds } = loadFrontend('src/lib/game.ts');
const { styleBreedIds } = loadFrontend('src/lib/dog-styles.ts');
const root = path.resolve(__dirname, '..');
const expected = ['pomeranian','poodle','maltese','shiba','corgi','beagle','samoyed','bichon','golden','labrador','husky','shihtzu','frenchbulldog','dachshund','schnauzer','chihuahua','dalmatian','akita','bordercollie','doberman','rottweiler','greatdane','saintbernard','bassethound','englishbulldog','westie','bostonterrier','yorkshireterrier','pekingese','chowchow'];
const java = fs.readFileSync(path.join(root,'backend/src/main/java/com/puppyruby/game/BreedCatalog.java'),'utf8');
const javaIds = [...java.matchAll(/new Breed\("([^"]+)"/g)].map(match=>match[1]);
assert.deepEqual(dogBreeds.map(b=>b.id), expected);
assert.deepEqual(javaIds, expected);
assert.deepEqual(styleBreedIds, expected);
assert.deepEqual(breeds, dogBreeds);
const Dog = () => null;
const { PuppySprite } = loadFrontend('src/components/puppy-sprite.tsx', { './styled-pixel-dog': { PixelDog: Dog } });
for (let index=0; index<expected.length; index++) {
  const dog=dogBreeds[index];
  assert.equal(PuppySprite({ puppy: { breed:index } }).props.children.props.breed, expected[index]);
  assert.equal(dogBreedAt(index).id, expected[index]);
  assert.ok(dog.name && dog.note && dog.personality);
  for (const color of dog.palette) assert.match(color,/^#[0-9a-f]{6}$/i);
}
for(const invalid of [-1,30,100,NaN,1.5]) assert.equal(dogBreedAt(invalid).id,expected[0]);
console.log('PASS: All30 reference breeds, stable legacy numeric IDs, game/admin/backend catalog parity, sprite mapping and safe fallback.');
