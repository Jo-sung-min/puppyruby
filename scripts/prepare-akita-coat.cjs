'use strict';
// Registers the isolated pilot. Never changes the thirty-breed release or source art.
const fs=require('node:fs'), path=require('node:path'), crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'), work=path.join(root,'local-assets/work/akita-coat-pilot');
const generated=path.join(root,'frontend/src/lib/generated');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
const asset=JSON.parse(fs.readFileSync(path.join(generated,'ruby-round-scene-assets.json'))).find(a=>a.breed==='akita');
const fingerprints=JSON.parse(fs.readFileSync(path.join(generated,'desktop-appearance-assets.json')));
const dest=path.join(root,'local-assets/site/akita-coat'); fs.mkdirSync(dest,{recursive:true});
const sheets={};
for(const [action,sheet] of Object.entries(asset.actions)){
 const file=path.join(work,action+'-mask.png'),bytes=fs.readFileSync(file),hash=sha(bytes);
 if(bytes.readUInt32BE(16)!==asset.width*4||bytes.readUInt32BE(20)!==asset.height)throw Error('Mask size mismatch');
 const body=fs.readFileSync(path.join(root,'local-assets/site',sheet.png));
 if(sha(body)!==fingerprints[sheet.png].sha256)throw Error('Source body differs from active release');
 fs.writeFileSync(path.join(dest,sha(body)+'.png'),body);
 fs.copyFileSync(file,path.join(dest,hash+'.png'));
 sheets[action]={bodySha256:sha(body),bodyPng:sheet.png,maskSha256:hash,maskPng:'/api/akita-coat/'+hash+'.png',frames:4};
}
const glasses=fs.readFileSync(path.join(work,'glasses.png')),glassesHash=sha(glasses);
fs.writeFileSync(path.join(dest,glassesHash+'.png'),glasses);
const manifest={schemaVersion:1,revision:'akita-coat-1',breed:'akita',width:asset.width,height:asset.height,
 glasses:{sha256:glassesHash,width:64,height:32,pivotX:32,pivotY:16},
 sourceSha256:sha(fs.readFileSync(path.join(root,'local-assets/work/ruby-round-v3/processed/akita/akita-16-actions.aseprite'))),sheets};
write(path.join(generated,'akita-coat-assets.json'),manifest);
fs.copyFileSync(path.join(root,'shared/coat-palettes.json'),path.join(generated,'coat-palettes.json'));
// Initial explicit positions are independent of selected/blinking eyes and are editable.
const rigPath=path.join(root,'shared/akita-accessory-rig.json');
if(!fs.existsSync(rigPath)){
 const actions={};
 const manual={scratch:[[79,110,-16],[84,115,-27],[85,108,10],[86,105,0]],belly:[null,null,[64,128,-70],[65,122,-73]],stretch:[null,[73,147,0],[72,145,0],null], 'walk-up':[[89,89,0],[89,90,0],[89,89,0],[89,89,0]]};
 for(const [action,sheet] of Object.entries(asset.actions)){
  actions[action]=Array.from({length:4},(_,f)=>{
   const eyes=sheet.eyes[f].length?sheet.eyes[f]:sheet.eyes.find(e=>e.length)||[];
   const center=manual[action]?.[f]??(eyes.length?[eyes.reduce((s,e)=>s+e.x+e.width/2,0)/eyes.length,eyes.reduce((s,e)=>s+e.y+e.height/2,0)/eyes.length,eyes.length===2?Math.atan2(eyes[1].y-eyes[0].y,eyes[1].x-eyes[0].x)*180/Math.PI:0]:[89,100,0]);
   const view=action==='walk-up'?'back':action==='belly'&&f>0?'supine':eyes.length===1?(action==='walk-right'?'right':'left'):'front';
   return Object.fromEntries(Object.entries({face:[0,58,27],head:[-48,50,38],neck:[32,65,28],back:[37,130,56]}).map(([slot,[offset,width,height]])=>{
    const angle=center[2]*Math.PI/180;
    return [slot,{x:Math.round(Math.max(0,Math.min(179,center[0]-Math.sin(angle)*offset))),y:Math.round(Math.max(0,Math.min(188,center[1]+Math.cos(angle)*offset))),width,height,rotation:Math.round(center[2]),flipX:view==='right',visible:!(view==='back'&&(slot==='face'||slot==='neck')),view}];
   }));
  });
 }
 write(rigPath,{schemaVersion:1,revision:'akita-rig-1',sourceSha256:manifest.sourceSha256,actions});
}
fs.copyFileSync(rigPath,path.join(generated,'akita-accessory-rig.json'));
console.log('Akita only: registered 16 masks and 64 frame attachment maps; no other breed modified.');
