'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createRequire}=require('node:module'),{loadFrontend}=require('./frontend-loader.cjs');
const root=path.resolve(__dirname,'..'),req=createRequire(path.join(root,'frontend/package.json')),sharp=req('sharp');
const coat=loadFrontend('src/lib/akita-coat.ts'),ruby=loadFrontend('src/lib/ruby-round-scene-styles.ts');
const {desktopAppearance,desktopAppearanceForClient}=loadFrontend('src/lib/desktop-appearance.ts');
const {defaultAppearance}=loadFrontend('src/lib/dog-styles.ts'),{dogBreedIds}=loadFrontend('src/lib/dog-breeds.ts');
const {rubyAccessoryItemForBreed,resolvedRubyAccessoryActionPlacement}=loadFrontend('src/lib/ruby-round-accessories.ts');
const work=path.join(root,'local-assets/work/akita-coat-pilot');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
async function raw(file){return new Uint8ClampedArray(await sharp(file).ensureAlpha().raw().toBuffer());}
(async()=>{
 const asset=ruby.rubyRoundAsset('akita'),width=asset.width*4,height=asset.height;let unchanged=0,changed=0;
 assert.deepEqual(coat.parseAkitaRig(coat.akitaRig),coat.akitaRig);
 const broken=structuredClone(coat.akitaRig);broken.actions.belly[2].face.x=NaN;assert.throws(()=>coat.parseAkitaRig(broken));
 const panels=[];
 for(const [action,sheet] of Object.entries(coat.akitaCoatAssets.sheets)){
  const bodyFile=path.join(root,'local-assets/site',sheet.bodyPng),maskFile=path.join(root,'local-assets/site/akita-coat',sheet.maskSha256+'.png');
  assert.equal(hash(fs.readFileSync(bodyFile)),sheet.bodySha256);assert.equal(hash(fs.readFileSync(maskFile)),sheet.maskSha256);
  const body=await raw(bodyFile),mask=await raw(maskFile);assert.equal(body.length,mask.length);
  assert.deepEqual(coat.applyCoatPixels(body,mask,coat.coatPalette('original')),body);
  for(const palette of coat.coatPalettes.slice(1)){
   const output=coat.applyCoatPixels(body,mask,palette);
   for(let i=0;i<body.length;i+=4){assert.equal(output[i+3],body[i+3]);if(!mask[i]||!body[i+3]){assert.deepEqual(output.subarray(i,i+4),body.subarray(i,i+4));unchanged++;}else changed++;}
   await sharp(Buffer.from(output),{raw:{width,height,channels:4}}).png().toFile(path.join(work,`${action}-${palette.id}-preview.png`));
  }
 }
 // Visual contact sheet: rows idle, side walk, petting, belly; columns original + four palettes.
 const rows=['idle','walk-left','petting','belly'];
 for(let row=0;row<rows.length;row++)for(let col=0;col<coat.coatPalettes.length;col++){
  const action=rows[row],palette=coat.coatPalettes[col],sheet=asset.actions[action],frame=action==='belly'?2:0;
  const file=palette.id==='original'?path.join(root,'local-assets/site',coat.akitaCoatAssets.sheets[action].bodyPng):path.join(work,`${action}-${palette.id}-preview.png`);
  let framePng=await sharp(file).extract({left:frame*asset.width,top:0,width:asset.width,height:asset.height}).png().toBuffer();
  const eyeFile=path.join(root,'local-assets/site/images/ruby-round-v1/eyes/eye-01.png');
  const eyes=[];
  if(sheet.revision)eyes.push({input:await sharp(path.join(root,'local-assets/site/akita-coat',sheet.revision.closedSha256+'.png')).extract({left:frame*asset.width,top:0,width:asset.width,height:asset.height}).png().toBuffer(),left:0,top:0});
  for(const [side,eye] of sheet.eyes[frame].entries())eyes.push({input:await sharp(eyeFile).extract({left:side*16,top:0,width:16,height:16}).resize(eye.width,eye.height,{kernel:'nearest'}).png().toBuffer(),left:eye.x,top:eye.y});
  if(eyes.length)framePng=await sharp(framePng).composite(eyes).png().toBuffer();
  panels.push({input:framePng,left:col*asset.width,top:row*asset.height});
 }
 await sharp({create:{width:asset.width*5,height:asset.height*4,channels:4,background:'#20222a'}}).composite(panels).png().toFile(path.join(work,'coat-review.png'));
 const akitaIndex=dogBreedIds.indexOf('akita'),origin='http://localhost:3001';
 const appearance=desktopAppearance(defaultAppearance,akitaIndex,origin,'ruby-eye-03','glasses','rose');
 assert.equal(Object.keys(appearance.nativeActions).length,11);
 for(const scene of [...Object.values(appearance.scenes),...Object.values(appearance.nativeActions)])assert.equal(scene.coat.paletteId,'rose');
 assert.equal(appearance.accessoryLayer.renderer,'image');
 assert.ok(Object.values(desktopAppearanceForClient(appearance,3).scenes).every(s=>!s.coat));
 assert.ok(!desktopAppearanceForClient(appearance,1).nativeActions);
 for(let i=0;i<dogBreedIds.length;i++)if(i!==akitaIndex){const a=desktopAppearance(defaultAppearance,i,origin,'ruby-eye-03','glasses','rose');assert.ok(Object.values(a.scenes).every(s=>!s.coat));assert.equal(a.accessoryLayer.renderer,'builtin');}
 for(const action of Object.keys(coat.akitaRig.actions))for(let f=0;f<4;f++)for(const [slot,id] of Object.entries({face:'glasses',head:'crown',neck:'scarf',back:'angel-wings'})){
  const p=resolvedRubyAccessoryActionPlacement(rubyAccessoryItemForBreed(id,'akita'),'akita',action,f);assert.ok(p);assert.ok(Object.values(p).every(v=>typeof v==='boolean'||Number.isFinite(v)));
 }
 // Opaque parity fixture covers every intensity, both material roles and fixed pixels.
 const fixtureBody=new Uint8ClampedArray(256*3*4),fixtureMask=new Uint8ClampedArray(fixtureBody.length);
 for(let role=0;role<3;role++)for(let tone=0;tone<256;tone++){const i=(role*256+tone)*4;fixtureBody.set([91,113,157,255],i);fixtureMask.set([role,tone,0,255],i);}
 const palette=coat.coatPalette('rose');
 for(const [name,pixels] of Object.entries({body:fixtureBody,mask:fixtureMask,expected:coat.applyCoatPixels(fixtureBody,fixtureMask,palette)}))await sharp(Buffer.from(pixels),{raw:{width:256,height:3,channels:4}}).png().toFile(path.join(work,'parity-'+name+'.png'));
 fs.writeFileSync(path.join(work,'parity-palette.json'),JSON.stringify(palette));
 assert.equal(coat.akitaCoatSheet('pomeranian','idle',asset.scenes.idle.png),undefined);
 assert.equal(coat.akitaCoatSheet('akita','idle','/changed-source.png'),undefined);
 console.log(`PASS: 16 actions × 5 palettes; ${unchanged} fixed pixels and ${changed} recolored pixels; 29 other breeds untouched; desktop v1/v3/v4; 256 attachment slots.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
