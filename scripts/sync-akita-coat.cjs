'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
for(const file of ['coat-palettes.json','akita-accessory-rig.json']){
 const bytes=fs.readFileSync(path.join(root,'shared',file));JSON.parse(bytes);
 const target=path.join(root,'frontend/src/lib/generated',file);
 if(!fs.existsSync(target)||!fs.readFileSync(target).equals(bytes))fs.writeFileSync(target,bytes);
}
console.log('Synced shared Akita pilot catalog and rig.');
