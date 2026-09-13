'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {createRequire}=require('node:module');
const req=createRequire(path.resolve(__dirname,'../frontend/package.json'));
const React=req('react'), {renderToStaticMarkup}=req('react-dom/server'), sharp=req('sharp');
const {loadFrontend}=require('./frontend-loader.cjs');
const {PixelDog}=loadFrontend('src/components/pixel-dog.tsx');
const {AnimatedDog}=loadFrontend('src/components/animated-dog.tsx');
const {dogBreeds}=loadFrontend('src/lib/dog-breeds.ts');
const {pixelDogStyles}=loadFrontend('src/lib/dog-styles.ts');
const {shibaCoatPresets}=loadFrontend('src/lib/dog-coat-presets.ts');
const output=path.resolve(__dirname,'../local-assets/work/breed-art-review');
let checks=0;
function check(value,message){assert.ok(value,message);checks++;}
function svg(props,component=PixelDog){let html=renderToStaticMarkup(React.createElement(component,{decorative:false,groundShadow:false,...props}));if(!html.includes('xmlns='))html=html.replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" ');for(const key of ['coat','ear']){const value=html.match(new RegExp(`--animated-${key}:(#[a-f0-9]{6})`,'i'))?.[1];if(value)html=html.replaceAll(`var(--animated-${key})`,value);}if(html.includes('data-dog-style="animated-2d"'))html=html.replace(/^(<svg[^>]*>)/,'$1<style>.closedEyes{display:none}</style>');return html;}
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
async function raster(props){return sharp(Buffer.from(svg(props))).resize(64,64,{kernel:'nearest'}).ensureAlpha().raw().toBuffer();}
async function preview(styleId){
  const columns=6,cell=196,height=192,rows=Math.ceil(dogBreeds.length/columns),title=64, layers=[];
  for(let i=0;i<dogBreeds.length;i++){
    const breed=dogBreeds[i], x=i%columns*cell,y=Math.floor(i/columns)*height+title;
    const art=await sharp(Buffer.from(svg({breed:breed.id,styleId}))).resize(144,144,{kernel:styleId==='animated-2d'?'lanczos3':'nearest'}).png().toBuffer();
    layers.push({input:art,left:x+26,top:y});
    const name=breed.id==='westie'?'웨스티':breed.name;
    layers.push({input:Buffer.from(`<svg width="196" height="43"><text x="98" y="17" font-size="13" font-family="Malgun Gothic, sans-serif" text-anchor="middle" fill="#292725">${name}</text><text x="98" y="34" font-size="10" font-family="sans-serif" text-anchor="middle" fill="#77716b">${breed.id}</text></svg>`),left:x,top:y+145});
  }
  layers.push({input:Buffer.from(`<svg width="1176" height="64"><text x="28" y="35" font-size="22" font-family="sans-serif" font-weight="700" fill="#292725">Puppy Ruby · 30 breeds · ${styleId}</text></svg>`),left:0,top:0});
  const file=path.join(output,`dog-breeds-30-${styleId}.png`);
  await sharp({create:{width:columns*cell,height:title+rows*height,channels:4,background:'#f8f5ef'}}).composite(layers).png().toFile(file);
}
async function presetPreview(){
  const layers=[],cell=196;
  for(let i=0;i<shibaCoatPresets.length;i++){
    const preset=shibaCoatPresets[i],x=i%5*cell,y=Math.floor(i/5)*194+60;
    const art=await sharp(Buffer.from(svg({breed:'shiba',styleId:'fluffy',variant:preset}))).resize(144,144,{kernel:'nearest'}).png().toBuffer();
    layers.push({input:art,left:x+26,top:y});
    layers.push({input:Buffer.from(`<svg width="196" height="40"><text x="98" y="22" font-size="14" font-family="Malgun Gothic, sans-serif" text-anchor="middle" fill="#292725">${preset.name} · ${preset.description}</text></svg>`),left:x,top:y+147});
  }
  layers.push({input:Buffer.from('<svg width="980" height="60"><text x="25" y="35" font-size="22" font-family="sans-serif" font-weight="700" fill="#292725">Puppy Ruby · Shiba coats · fluffy</text></svg>'),left:0,top:0});
  await sharp({create:{width:980,height:450,channels:4,background:'#f8f5ef'}}).composite(layers).png().toFile(path.join(output,'dog-shiba-coats-10.png'));
}
(async()=>{
  check(dogBreeds.length===30,'Exactly30 distinct breed IDs');
  check(new Set(dogBreeds.map(b=>b.id)).size===30,'Unique breed IDs');
  check(pixelDogStyles.length===67 && pixelDogStyles.some(style=>style.id==='meadow'),'All51 pixel style choices retained plus16 cute derivatives');
  for(const style of pixelDogStyles){
    const images=new Set();
    for(const breed of dogBreeds){
      const html=svg({breed:breed.id,styleId:style.id});
      check(html.includes('shape-rendering="crispEdges"'),`${breed.id}/${style.id} remains on pixel grid`);
      check(!/NaN|undefined|Infinity/.test(html),`${breed.id}/${style.id} valid geometry`);
      check(html.includes(breed.name),`${breed.id}/${style.id} meaningful label`);
      const rgba=await raster({breed:breed.id,styleId:style.id});
      check(rgba.some((value,i)=>i%4===3&&value>0),`${breed.id}/${style.id} nonempty`);
      if(dogBreeds.indexOf(breed)>=7){
        const padded=await sharp(Buffer.from(html.replace('viewBox="0 0 64 64"','viewBox="-8 -8 80 80"'))).resize(80,80).ensureAlpha().raw().toBuffer();
        let outside=0;
        for(let y=0;y<80;y++)for(let x=0;x<80;x++)if((x<8||x>=72||y<8||y>=72)&&padded[(y*80+x)*4+3])outside++;
        check(outside===0,`${breed.id}/${style.id} whole silhouette fits64px without clipping`);
      }
      images.add(hash(rgba));
    }
    check(images.size===30,`Every ${style.id} breed has a distinct rendered sprite`);
  }
  const animated=new Set();
  for(const breed of dogBreeds){
    const html=svg({breed:breed.id,styleId:'animated-2d'});
    check(html.includes('data-dog-style="animated-2d"'),`${breed.id} actual2D route`);
    check(html.includes(breed.name),`${breed.id} 2D breed label`);
    check(!/NaN|undefined|Infinity/.test(html),`${breed.id} valid2D geometry`);
    animated.add(hash(await raster({breed:breed.id,styleId:'animated-2d'})));
    for(const mood of ['sleep','walk','typing','love'])for(const styleId of ['classic','fluffy','animated-2d']){
      const html=svg({breed:breed.id,styleId,mood,accessory:'glasses',variant:{shape:'fox',pattern:'patches',coatColor:'#66584f',patternColor:'#f9eddf'}});
      check(html.includes('data-cosmetic="glasses"'),`${breed.id}/${mood}/${styleId} accessory retained`);
      check(!/NaN|undefined|Infinity/.test(html),`${breed.id}/${mood}/${styleId} variant geometry valid`);
    }
  }
  check(animated.size===30,'All30 2D breeds render differently');
  check(svg({breed:'not-a-breed'})===svg({breed:'pomeranian'}),'Unknown pixel breed uses safe fallback');
  check(svg({breed:'not-a-breed'},AnimatedDog)===svg({breed:'pomeranian'},AnimatedDog),'Unknown2D breed uses safe fallback');
  for(const breed of ['classic','fluffy','animated-2d']) check(svg({breed:'chowchow',styleId:breed}).includes('#8580bf'),`Chow blue tongue ${breed}`);
  for(const styleId of ['classic','fluffy','animated-2d']){
    check(svg({breed:'schnauzer',styleId}).includes('data-breed-detail="beard"'),`Schnauzer beard ${styleId}`);
    check(svg({breed:'dalmatian',styleId}).includes('data-breed-marking="dalmatian-'),`Dalmatian spots ${styleId}`);
    check(svg({breed:'shihtzu',styleId}).includes('data-breed-detail="topknot"'),`ShihTzu topknot ${styleId}`);
  }
  for(const styleId of ['classic','fluffy']){
    const variant={shape:'original',coatColor:'#393633',patternColor:'#D8A775',pattern:'solid'};
    const plain=await raster({breed:'shiba',styleId,variant}), blacktan=await raster({breed:'shiba',styleId,variant:{...variant,pattern:'tuxedo'}});
    const forehead=(20*64+32)*4;
    check(plain.subarray(forehead,forehead+4).equals(blacktan.subarray(forehead,forehead+4)),`Shiba blacktan ${styleId} forehead remains solid`);
    check(hash(plain)!==hash(blacktan),`Shiba blacktan ${styleId} adds tan muzzle and brows`);
  }
  fs.mkdirSync(output,{recursive:true});
  for(const styleId of ['classic','fluffy','animated-2d'])await preview(styleId);
  await presetPreview();
  console.log(`PASS ${checks} breed-art checks; 30-breed classic/fluffy/animated and10 Shiba previews saved under backend/build.`);
})().catch(error=>{console.error(error.message);process.exitCode=1;});
