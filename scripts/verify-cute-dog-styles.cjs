'use strict';
// Exercise the actual Aseprite rows, live renderer, native transparency and appearance parser.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const {createRequire}=require('node:module'), requireFrontend=createRequire(path.resolve(__dirname,'../frontend/package.json'));
const React=requireFrontend('react'), {renderToStaticMarkup}=requireFrontend('react-dom/server'), sharp=requireFrontend('sharp');
const {loadFrontend}=require('./frontend-loader.cjs');
const {cuteDogStyles,cuteDogFamilies,cuteDogBodies}=loadFrontend('src/lib/cute-dog-styles.ts');
const {validateCutePuppySprites}=loadFrontend('src/lib/cute-puppy-sprite-data.ts');
const {PixelDog}=loadFrontend('src/components/pixel-dog.tsx');
const {dogBreeds}=loadFrontend('src/lib/dog-breeds.ts');
const {dogStyles,pixelDogStyles,resolveDogStyle,defaultAppearance,activeDogStyles}=loadFrontend('src/lib/dog-styles.ts');
const {premiumDogStyles}=loadFrontend('src/lib/premium-dog-styles.ts');
const {originalArtDogStyles}=loadFrontend('src/lib/original-art-dog-styles.ts');
const {art16SceneStyles}=loadFrontend('src/lib/art16-scene-styles.ts');
const {spSceneStyles}=loadFrontend('src/lib/sp-scene-styles.ts');
const {parseAppearance}=loadFrontend('src/lib/dog-appearance.ts');
const source=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../frontend/src/lib/generated/cute-puppy-sprites.json'),'utf8'));
const data=validateCutePuppySprites(source), root=path.resolve(__dirname,'..');
const moods=['idle','love','eat','play','sleep','typing','excited','scroll','drag','walk'];
const accessories=['ribbon','scarf','crown','bow-blue','bow-lilac','party-hat','flower','glasses','halo','angel-wings'];
let checks=0;
const check=(value,message)=>{assert.ok(value,message);checks++;};
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
const svg=props=>renderToStaticMarkup(React.createElement(PixelDog,{breed:'pomeranian',groundShadow:false,...props})).replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" ');
const raster=props=>sharp(Buffer.from(svg(props))).ensureAlpha().raw().toBuffer();
const alpha=raw=>Buffer.from(raw.filter((_,i)=>i%4===3));

(async()=>{
  check(cuteDogStyles.length===16 && cuteDogFamilies.length===4 && cuteDogBodies.length===4,'Four selected families × four real body silhouettes');
  check(pixelDogStyles.length===67+premiumDogStyles.length+originalArtDogStyles.length+art16SceneStyles.length+spSceneStyles.length && dogStyles.length===pixelDogStyles.length+1,'Existing51 pixel styles retained +16 body styles +full-resolution collections +animated2D');
  for(const family of cuteDogFamilies)for(const body of cuteDogBodies)check(activeDogStyles(defaultAppearance).some(style=>style.id===`${family.id}-${body.id}`),`${family.id}/${body.id} remains selectable in the unified administrator list`);
  check(!activeDogStyles({...defaultAppearance,deletedStyles:['cozy-chubby']}).some(style=>style.id==='cozy-chubby'),'Deleted style stays absent from unified choices');
  for(const broken of [null,{}, {...source,schemaVersion:2}, {...source,sprites:{...source.sprites,'cozy-chubby':undefined}},
    {...source,sprites:{...source.sprites,'cozy-chubby':{...source.sprites['cozy-chubby'],rows:['invalid']}}}]) {
    assert.throws(()=>validateCutePuppySprites(broken)); checks++;
  }
  const allStylePixels=new Set();
  for(const style of cuteDogStyles) {
    const id=style.id, sprite=data[id], plain=await raster({styleId:id}), markup=svg({styleId:id});
    check(markup.includes(`data-dog-style="${id}"`),`${id} routes to its real Aseprite renderer`);
    check(!/NaN|Infinity|undefined|<image\b/.test(markup),`${id} contains valid native pixels, no generic bitmap fallback`);
    const native=await sharp(path.join(root,`local-assets/site/images/cute-puppies-v1/${id}.png`)).ensureAlpha().raw().toBuffer();
    check(alpha(plain).equals(alpha(native)),`${id} live geometry preserves exact source transparency`);
    check(!alpha(plain).some(value=>value!==0&&value!==255),`${id} clean opaque pixels without interpolation`);
    check(sprite.roles.includes('coat'),`${id} coat color can actually be changed`);
    allStylePixels.add(digest(plain));
    const varietyId='b82adbe3-7df2-4e09-ab4e-1c3da800add1';
    const config=parseAppearance({...defaultAppearance,defaultStyle:id,breedStyles:{poodle:id},varieties:[{id:varietyId,breed:'shiba',name:'귀여운 종류',style:id,shape:'original',pattern:'solid',coatColor:null,patternColor:'#ffffff'}],breedVarieties:{shiba:varietyId}});
    for(const breed of ['pomeranian','poodle','shiba'])check(resolveDogStyle(config,breed)===id,`${id}/${breed} global/breed/variety selection resolves`);
    const breeds=new Set();
    for(const breed of dogBreeds)breeds.add(digest(await raster({styleId:id,breed:breed.id})));
    check(breeds.size===30,`${id} all30 breed palettes/markings remain distinct`);
    for(const mood of moods) {
      const pose=svg({styleId:id,mood,frame:1,look:1});
      check(pose.includes(`pixel-${mood}`)&&! /NaN|Infinity/.test(pose),`${id}/${mood} motion and expression hooks retained`);
    }
    check(digest(await raster({styleId:id,mood:'walk',frame:0}))!==digest(await raster({styleId:id,mood:'walk',frame:1})),`${id} walk frame changes pose`);
    check(digest(await raster({styleId:id,look:0}))!==digest(await raster({styleId:id,look:1})),`${id} mouse-look response changes pose`);
    check(digest(await raster({styleId:id,eyes:'#fa1234'}))!==digest(await raster({styleId:id,eyes:'#1245ab'})),`${id} custom eye color is visible`);
    for(const accessory of accessories) {
      const art=await raster({styleId:id,accessory});
      check(svg({styleId:id,accessory}).includes(`data-cosmetic="${accessory}"`)&&!art.equals(plain),`${id}/${accessory} existing cosmetic is visible`);
    }
    const variants=new Set();
    for(const shape of ['original','teddy','fox'])for(const pattern of ['solid','tuxedo','patches','freckles','socks','blaze']) {
      const varied=await raster({styleId:id,variant:{shape,pattern,coatColor:'#ba976b',patternColor:'#583320'}});
      variants.add(digest(varied));
      if(shape==='original')check(alpha(varied).equals(alpha(native)),`${id}/${pattern} pattern never paints outside original fur`);
    }
    check(variants.size===18,`${id} all18 variety shapes/patterns render distinct choices`);
  }
  check(allStylePixels.size===16,'All16 new body/family sprites are visibly distinct');
  check(Math.ceil(cuteDogStyles.length/12)===2 && cuteDogStyles.slice(0,12).length===12 && cuteDogStyles.slice(12).length===4,'New style pages contain12 and4 choices');
  for(const family of cuteDogFamilies)check(cuteDogStyles.filter(style=>style.family===family.id).length===4,`${family.source} has four body choices`);
  console.log(`PASS ${checks} cute-style checks:16 actual Aseprite sprites,${pixelDogStyles.length} pixel choices,30 breeds,10 moods,10 cosmetics,18 varieties and protected native transparency.`);
})().catch(error=>{console.error(error.stack);process.exitCode=1;});

