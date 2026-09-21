'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),target=path.join(root,'shared/akita-accessory-rig.json');
const rig=JSON.parse(fs.readFileSync(target)),art=require('../frontend/src/lib/generated/akita-art-revision.json');
if(rig.sourceSha256!==art.sourceSha256){
 fs.writeFileSync(path.join(root,'local-assets/work/akita-coat-revision-2/previous-rig.json'),JSON.stringify(rig,null,2));
 for(const action of ['side','walk','walk-left','walk-right','happy'])for(let f=0;f<4;f++){
  const eyes=art.actions[action].eyes[f],slots=rig.actions[action][f];
  const x=Math.round(eyes.reduce((v,e)=>v+e.x+e.width/2,0)/eyes.length),y=Math.round(eyes.reduce((v,e)=>v+e.y+e.height/2,0)/eyes.length);
  const dx=x-slots.face.x,dy=y-slots.face.y;
  for(const slot of Object.values(slots)){slot.x=Math.max(0,Math.min(179,slot.x+dx));slot.y=Math.max(0,Math.min(188,slot.y+dy));slot.rotation=0;}
 }
 rig.sourceSha256=art.sourceSha256;
 rig.revision='akita-rig-'+crypto.createHash('sha256').update(JSON.stringify(rig.actions)).digest('hex').slice(0,16);
 fs.writeFileSync(target,JSON.stringify(rig,null,2)+'\n');
}
fs.copyFileSync(target,path.join(root,'frontend/src/lib/generated/akita-accessory-rig.json'));
console.log('Akita accessory rig aligned to accepted artwork.');
