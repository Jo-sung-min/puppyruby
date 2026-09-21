'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createRequire}=require('node:module');
const root=path.resolve(__dirname,'..'),work=path.join(root,'local-assets/work/akita-coat-revision-2');
const manifest=JSON.parse(fs.readFileSync(path.join(work,'manifest.json')));
const dest=path.join(root,'local-assets/site/akita-coat');fs.mkdirSync(dest,{recursive:true});
const sharp=createRequire(path.join(root,'frontend/package.json'))('sharp');
function register(file){const data=fs.readFileSync(path.join(work,file));const sha=crypto.createHash('sha256').update(data).digest('hex');if(data.readUInt32BE(16)!==716||data.readUInt32BE(20)!==188)throw Error('Unexpected image dimensions: '+file);fs.writeFileSync(path.join(dest,sha+'.png'),data);return sha;}
async function main(){
const result={schemaVersion:1,revision:manifest.revision,width:179,height:188,breed:'akita',sourceSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(work,'akita-clean-body-r2.aseprite'))).digest('hex'),actions:{}};
for(const [action,item]of Object.entries(manifest.actions)){
 // v3/v4 Windows already understand baked-closed frames. Flatten only the
 // transport copy; retain the editable eyeless source and separate web layers.
 await sharp(path.join(work,action+'.png')).composite([{input:path.join(work,action+'-closed.png')}]).png().toFile(path.join(work,action+'-desktop-body.png'));
 const mask=await sharp(path.join(work,action+'-mask.png')).ensureAlpha().raw().toBuffer();
 const eyes=await sharp(path.join(work,action+'-closed.png')).ensureAlpha().raw().toBuffer();
 for(let i=0;i<mask.length;i+=4)if(eyes[i+3])mask[i]=0;
 await sharp(mask,{raw:{width:716,height:188,channels:4}}).png().toFile(path.join(work,action+'-desktop-mask.png'));
 result.actions[action]={...item,bodySha256:register(action+'.png'),maskSha256:register(action+'-mask.png'),closedSha256:register(action+'-closed.png'),desktopBodySha256:register(action+'-desktop-body.png'),desktopMaskSha256:register(action+'-desktop-mask.png'),previewSha256:register(action+'-preview.png')};
}
fs.writeFileSync(path.join(root,'frontend/src/lib/generated/akita-art-revision.json'),JSON.stringify(result,null,2)+'\n');
console.log('Registered Akita revision: 16 actions, separate web eyes and compatible Windows transport.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
