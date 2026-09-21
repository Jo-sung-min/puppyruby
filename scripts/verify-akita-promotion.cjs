'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createRequire}=require('node:module'),{loadFrontend}=require('./frontend-loader.cjs');
const root=path.resolve(__dirname,'..'),sharp=createRequire(path.join(root,'frontend/package.json'))('sharp');
const art=require('../frontend/src/lib/generated/akita-art-revision.json'),ruby=loadFrontend('src/lib/ruby-round-scene-styles.ts');
const coat=loadFrontend('src/lib/akita-coat.ts'),{desktopAppearance,desktopAppearanceForClient}=loadFrontend('src/lib/desktop-appearance.ts');
const {defaultAppearance}=loadFrontend('src/lib/dog-styles.ts'),{dogBreedIds}=loadFrontend('src/lib/dog-breeds.ts');
const file=hash=>path.join(root,'local-assets/site/akita-coat',hash+'.png');
async function raw(hash){return new Uint8ClampedArray(await sharp(file(hash)).ensureAlpha().raw().toBuffer());}
(async()=>{
 const bundled=JSON.parse(fs.readFileSync(path.join(root,'local-assets/desktop/build/ruby-assets/ruby-default-manifest.json'))).breeds.find(b=>b.breed==='akita');
 const active=ruby.rubyRoundAsset('akita');let comparisons=0;
 for(const old of ruby.rubyRoundAssets)if(old.breed!=='akita')assert.equal(ruby.rubyRoundAsset(old.breed),old);
 for(const [id,action]of Object.entries(art.actions)){
  assert.equal(active.actions[id].revision.bodySha256,action.bodySha256);
  const [body,mask,closed,desktop,desktopMask]=await Promise.all([action.bodySha256,action.maskSha256,action.closedSha256,action.desktopBodySha256,action.desktopMaskSha256].map(raw));
  const spec=bundled.scenes[id]??bundled.nativeActions[id];assert.equal(spec.bodySha256,action.desktopBodySha256);
  assert.deepEqual(spec.eyeAnchors,active.actions[id].eyes);
  for(const palette of coat.coatPalettes){
   const web=coat.applyCoatPixels(body,mask,palette),windows=coat.applyCoatPixels(desktop,desktopMask,palette);
   for(let i=0;i<web.length;i+=4)if(closed[i+3]){assert.equal(closed[i+3],255);web.set(closed.subarray(i,i+4),i);}
   assert.deepEqual(web,windows,`${id}/${palette.id}: web and desktop closed-eye dye parity`);comparisons++;
  }
  const compat=await sharp(file(action.compatibilitySha256)).metadata();assert.equal(compat.width,id==='walk'?716:179);
 }
 const descriptor=desktopAppearance(defaultAppearance,dogBreedIds.indexOf('akita'),'https://www.puppyruby.com','ruby-eye-03','glasses','silver');
 for(const [id,sheet]of Object.entries({...descriptor.scenes,...descriptor.nativeActions})){
  assert.equal(sheet.bodySha256,art.actions[id].desktopBodySha256);
  assert.equal(sheet.coat.maskSha256,art.actions[id].desktopMaskSha256);
  assert.match(sheet.bodyUrl,/^https:\/\/cdn\.puppyruby\.com\/site-packs\/akita-coat\//);
 }
 const v1=desktopAppearanceForClient(descriptor,1),v3=desktopAppearanceForClient(descriptor,3);
 for(const [id,sheet]of Object.entries(v1.scenes)){assert.equal(sheet.frames,id==='walk'?4:1);assert.equal(sheet.sha256,art.actions[id].compatibilitySha256);assert.ok(!sheet.coat);}
 for(const sheet of Object.values(v3.scenes))assert.ok(!sheet.coat);
 console.log(`PASS approved Akita: 16 shipped actions, ${comparisons} web/Windows color+eyelid matches, old-client fallback, other 29 breeds unchanged.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
