'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createRequire}=require('node:module'),{loadFrontend}=require('./frontend-loader.cjs');
const root=path.resolve(__dirname,'..'),sharp=createRequire(path.join(root,'frontend/package.json'))('sharp');
const art=require('../frontend/src/lib/generated/akita-art-revision.json'),coat=loadFrontend('src/lib/akita-coat.ts');
const work=path.join(root,'local-assets/work/akita-coat-revision-2'),store=path.join(root,'local-assets/site/akita-coat');
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
async function pixels(hash){const bytes=fs.readFileSync(path.join(store,hash+'.png'));assert.equal(sha(bytes),hash);const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});assert.equal(info.width,716);assert.equal(info.height,188);return new Uint8ClampedArray(data);}
(async()=>{
 assert.equal(Object.keys(art.actions).length,16);let edges=0,frames=0;
 const panels=[],bodyPanels=[],rowOrder=['idle','walk-left','happy'];
 for(const [action,sheet]of Object.entries(art.actions)){
  const body=await pixels(sheet.bodySha256),mask=await pixels(sheet.maskSha256),closed=await pixels(sheet.closedSha256);
  assert.deepEqual(coat.applyCoatPixels(body,mask,coat.coatPalette('original')),body);
  for(let f=0;f<4;f++){
   frames++;let closedPixels=0;
   for(let y=0;y<188;y++)for(let x=0;x<179;x++){
    const i=(y*716+f*179+x)*4;assert.ok(body[i+3]===0||body[i+3]===255);if(closed[i+3])closedPixels++;
    if(body[i+3]){
     const edge=[[-1,0],[1,0],[0,-1],[0,1]].some(([dx,dy])=>x+dx<0||x+dx>=179||y+dy<0||y+dy>=188||body[((y+dy)*716+f*179+x+dx)*4+3]===0);
     if(edge){assert.deepEqual(Array.from(body.subarray(i,i+3)),[0,0,0],`${action}:${f} outline ${x},${y}`);edges++;}
    }
    if(closed[i+3])assert.ok(Math.max(body[i],body[i+1],body[i+2])>120,`${action}:${f} closed eyelid remains baked in body`);
   }
   assert.equal(closedPixels>0,sheet.eyeModes[f]==='closed');
   if(sheet.eyeModes[f]==='shared')for(const a of sheet.eyes[f])for(let y=a.y+2;y<=a.y+13;y++)for(let x=a.x+1;x<=a.x+14;x++){
    const i=(y*716+f*179+x)*4;assert.ok(Math.max(body[i],body[i+1],body[i+2])>120,`${action}:${f} dark eye residue`);
   }
  }
  const dyed=coat.applyCoatPixels(body,mask,coat.coatPalette('silver'));
  for(let i=0;i<body.length;i+=4){assert.equal(dyed[i+3],body[i+3]);if(mask[i]===0)assert.deepEqual(dyed.subarray(i,i+4),body.subarray(i,i+4));}
  if(rowOrder.includes(action)){
   const bodyBuffer=await sharp(Buffer.from(dyed),{raw:{width:716,height:188,channels:4}}).png().toBuffer();
   const overlays=[{input:path.join(store,sheet.closedSha256+'.png'),left:0,top:0}];
   for(let f=0;f<4;f++)if(sheet.eyeModes[f]==='shared')for(const [side,a]of sheet.eyes[f].entries())overlays.push({input:await sharp(path.join(root,'local-assets/site/images/ruby-round-v1/eyes/eye-01.png')).extract({left:side*16,top:0,width:16,height:16}).resize(a.width,a.height,{kernel:'nearest'}).png().toBuffer(),left:f*179+a.x,top:a.y});
   panels.push({input:await sharp(bodyBuffer).composite(overlays).png().toBuffer(),left:0,top:rowOrder.indexOf(action)*188});
   bodyPanels.push({input:bodyBuffer,left:0,top:rowOrder.indexOf(action)*188});
  }
 }
 for(const [name,list]of [['silver-review',panels],['eyeless-review',bodyPanels]])await sharp({create:{width:716,height:564,channels:4,background:'#24262e'}}).composite(list).png().toFile(path.join(work,name+'.png'));
 await sharp({create:{width:716,height:564,channels:4,background:'#f5eee2'}}).composite(panels).png().toFile(path.join(work,'light-review.png'));
 assert.equal(sha(fs.readFileSync(path.join(root,'local-assets/work/ruby-round-v3/processed/akita/akita-16-actions.aseprite'))),'d73803edfb5f974fcf2b6ab4ded78dd98499a03e24c853639739a9de178b0474');
 console.log(`PASS Akita revision: ${frames} frames, ${edges} black exterior pixels, eyes/closed eyelids separated, original master unchanged.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
