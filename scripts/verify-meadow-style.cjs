'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),crypto=require('node:crypto');
const {createRequire}=require('node:module'), req=createRequire(path.resolve(__dirname,'../frontend/package.json'));
const React=req('react'),{renderToStaticMarkup}=req('react-dom/server'),sharp=req('sharp');
const {loadFrontend}=require('./frontend-loader.cjs');
const {PixelDog}=loadFrontend('src/components/pixel-dog.tsx'),{MeadowPixelDog}=loadFrontend('src/components/meadow-pixel-dog.tsx');
const {dogBreeds}=loadFrontend('src/lib/dog-breeds.ts');
const output=path.resolve(__dirname,'../local-assets/work/meadow-review'), moods=['idle','love','eat','play','sleep','typing','excited','scroll','drag','walk'];
const accessories=['ribbon','scarf','crown','bow-blue','bow-lilac','party-hat','flower','glasses','halo','angel-wings'];
const patterns=['solid','tuxedo','patches','freckles','socks','blaze'],shapes=['original','teddy','fox'];
let count=0;
const check=(v,m)=>{assert.ok(v,m);count++;},digest=data=>crypto.createHash('sha256').update(data).digest('hex');
function svg(props={},component=PixelDog){return renderToStaticMarkup(React.createElement(component,{breed:'samoyed',styleId:'meadow',groundShadow:false,...props})).replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" ');}
async function pixels(props){return sharp(Buffer.from(svg(props))).resize(64,64,{kernel:'nearest'}).ensureAlpha().raw().toBuffer();}
async function bounds(markup){const padded=await sharp(Buffer.from(markup.replace('viewBox="0 0 64 64"','viewBox="-8 -8 80 80"'))).resize(80,80,{kernel:'nearest'}).ensureAlpha().raw().toBuffer();let outside=0;for(let y=0;y<80;y++)for(let x=0;x<80;x++)if((x<8||x>=72||y<8||y>=72)&&padded[(y*80+x)*4+3])outside++;return outside;}
async function preview(){
  const cell=192,rows=5,cols=6,layers=[];
  for(let i=0;i<dogBreeds.length;i++){
    const b=dogBreeds[i],x=i%cols*cell,y=Math.floor(i/cols)*cell+58;
    const art=await sharp(Buffer.from(svg({breed:b.id}))).resize(144,144,{kernel:'nearest'}).png().toBuffer();
    layers.push({input:art,left:x+24,top:y});
    layers.push({input:Buffer.from(`<svg width="192" height="42"><text x="96" y="19" font-family="Malgun Gothic,sans-serif" font-size="12" text-anchor="middle" fill="#3b302a">${b.id==='westie'?'웨스티':b.name}</text><text x="96" y="35" font-family="sans-serif" font-size="10" text-anchor="middle" fill="#817569">${b.id}</text></svg>`),left:x,top:y+145});
  }
  layers.push({input:Buffer.from('<svg width="1152" height="58"><text x="24" y="35" font-family="sans-serif" font-size="22" font-weight="700" fill="#3b302a">Puppy Ruby · Meadow pixel · 30 breeds</text></svg>'),left:0,top:0});
  await sharp({create:{width:cell*cols,height:cell*rows+58,channels:4,background:'#f4eee2'}}).composite(layers).png().toFile(path.join(output,'meadow-breeds-30.png'));
  const samoyed=svg();fs.writeFileSync(path.join(output,'meadow-samoyed.svg'),samoyed);
  await sharp(Buffer.from(samoyed)).resize(512,512,{kernel:'nearest'}).png().toFile(path.join(output,'meadow-samoyed.png'));
  const details=[];
  for(let i=0;i<accessories.length;i++){
    const art=await sharp(Buffer.from(svg({accessory:accessories[i]}))).resize(128,128,{kernel:'nearest'}).png().toBuffer();
    details.push({input:art,left:i%5*160+16,top:Math.floor(i/5)*164+34});
    details.push({input:Buffer.from(`<svg width="160" height="24"><text x="80" y="16" font-family="sans-serif" font-size="12" text-anchor="middle" fill="#3b302a">${accessories[i]}</text></svg>`),left:i%5*160,top:Math.floor(i/5)*164+164});
  }
  await sharp({create:{width:800,height:366,channels:4,background:'#f4eee2'}}).composite(details).png().toFile(path.join(output,'meadow-accessories.png'));
}
(async()=>{
  check(dogBreeds.length===30,'All30 catalog breeds remain available');
  const rendered=new Set();
  for(const b of dogBreeds){
    const props={breed:b.id},markup=svg(props),raw=await pixels(props);
    check(markup.includes('data-dog-style="meadow"'),`${b.id} routes to the new renderer`);
    check(markup.includes(`data-dog-breed="${b.id}"`),`${b.id} no generic breed fallback`);
    check(markup.includes('class="pixel-dog pixel-idle dog-style-meadow'),`${b.id} aura/mood classes retained`);
    check((markup.match(/data-dog-part="(?:near|far)-(?:front|rear)-paw"/g)||[]).length===4,`${b.id} four separate legs`);
    check(markup.includes('data-dog-part="curled-tail"'),`${b.id} raised curled tail`);
    check(!/<image\b|<text\b|NaN|Infinity|undefined/.test(markup),`${b.id} native geometry with no baked scene`);
    check(await bounds(markup)===0,`${b.id} whole native sprite fits64px`);
    check(raw.some((value,i)=>i%4===3&&value===255),`${b.id} visible opaque silhouette`);
    check(!raw.some((value,i)=>i%4===3&&value!==0&&value!==255),`${b.id} exact hard pixel edges`);
    check(raw[3]===0&&raw[(63*64+63)*4+3]===0,`${b.id} transparent outside puppy`);
    rendered.add(digest(raw));
    for(const mood of moods){
      const html=svg({...props,mood,frame:1});
      check(html.includes(`pixel-${mood}`),`${b.id}/${mood} existing motion hooks`);
      check(!/NaN|Infinity|undefined/.test(html),`${b.id}/${mood} valid pose`);
    }
    const look=await pixels({...props,look:2});check(digest(raw)!==digest(look),`${b.id} face follows mouse look`);
    check(digest(await pixels({...props,mood:'walk',frame:0}))!==digest(await pixels({...props,mood:'walk',frame:1})),`${b.id} walking alternates four paws`);
    const colored=svg({...props,fur:'#123456',eyes:'#abcdef',variant:{shape:'original',pattern:'solid',coatColor:'#ff0000',patternColor:'#ffffff'}});
    check(colored.includes('fill="#123456"'),`${b.id} explicit coat wins over variety`);
    check(colored.includes('fill="#abcdef"'),`${b.id} explicit eye color retained`);
    for(const accessory of accessories){
      const html=svg({...props,accessory});
      check(html.includes(`data-cosmetic="${accessory}"`),`${b.id}/${accessory} retained`);
      check(digest(await pixels({...props,accessory}))!==digest(raw),`${b.id}/${accessory} is actually visible`);
      check(await bounds(html)===0,`${b.id}/${accessory} accessory stays on canvas`);
    }
    check(digest(await pixels({...props,accessory:'glasses',eyes:'#ff0000'}))!==digest(await pixels({...props,accessory:'glasses',eyes:'#0000ff'})),`${b.id} glasses leave transparent eye openings`);
    const variants=new Set();
    for(const shape of shapes)for(const pattern of patterns){
      const variant={shape,pattern,coatColor:'#b7a387',patternColor:'#f4eada'},html=svg({...props,variant});
      check(html.includes(`data-dog-shape="${shape}"`),`${b.id}/${shape}/${pattern} silhouette selection`);
      if(pattern!=='solid')check(html.includes(`data-coat-pattern="${pattern}"`)&&html.includes('clip-path="url(#coat-'),`${b.id}/${shape}/${pattern} markings are clipped to coat`);
      check(await bounds(html)===0,`${b.id}/${shape}/${pattern} fits native canvas`);
      variants.add(digest(await pixels({...props,variant})));
    }
    check(variants.size===18,`${b.id} all18 shape/pattern choices differ`);
  }
  check(rendered.size===30,'30 actual breed sprites differ');
  check(svg({breed:'invalid'})===svg({breed:'pomeranian'}),'Unknown breed safely resolves to catalog first breed');
  check(svg({look:NaN,frame:Infinity})===svg({look:0,frame:0}),'Invalid animation numbers cannot poison SVG');
  check(svg({decorative:true}).includes('aria-hidden="true"')&&!svg({decorative:true}).includes('aria-label='),'Decorative accessibility mode');
  check(svg({className:'extra-class'}).includes('extra-class'),'Caller sizing class preserved');
  check(svg({groundShadow:true}).includes('opacity=".14"')&&!svg().includes('opacity=".14"'),'Ground shadow independently removable');
  check(svg({},MeadowPixelDog).includes('data-dog-style="meadow"'),'Standalone renderer matches routing');
  fs.mkdirSync(output,{recursive:true});await preview();
  console.log(`PASS ${count} meadow checks:30 breeds,10moods,18variants,10cosmetics,64pxbounds and transparent glasses. Previews saved under local-assets/work/meadow-review/meadow-*.png.`);
})().catch(error=>{console.error(error.message);process.exitCode=1;});
