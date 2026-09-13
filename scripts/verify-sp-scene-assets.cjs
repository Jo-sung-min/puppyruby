'use strict';
// Read-only comparison of source atlases, native PNGs, and decoded editable cels.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const crypto = require('node:crypto'), zlib = require('node:zlib');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
const sharp = createRequire(path.join(root, 'frontend/package.json'))('sharp');
const breeds = [...fs.readFileSync(path.join(root, 'frontend/src/lib/dog-breeds.ts'), 'utf8').matchAll(/id: "([a-z]+)"/g)].map(match => match[1]);
const partial = process.argv.includes('--partial');
const requestedStyle = process.argv.find(arg => arg.startsWith('--style='))?.slice(8);
const requestedBreed = process.argv.find(arg => arg.startsWith('--breed='))?.slice(8);
const styles = requestedStyle ? [requestedStyle] : ['sp08', 'sp15'];
const requestedBreeds = requestedBreed ? [requestedBreed] : breeds;
const specs = {idle:[0],side:[1],happy:[2],sleep:[3],walk:[4,5,6,7,8,9,10,11],wag:[12,13,14,15]};
const durations = [600,600,600,1000,...Array(8).fill(125),...Array(4).fill(150)];
const sha = data => crypto.createHash('sha256').update(data).digest('hex').toUpperCase();
let checks = 0;
const check = (value, label) => { assert.ok(value, label); checks++; };
function samePixels(a,b) {
  if (a.length !== b.length) return false;
  for (let p=0;p<a.length;p+=4) if (a[p+3] !== b[p+3] || (a[p+3] && (a[p] !== b[p] || a[p+1] !== b[p+1] || a[p+2] !== b[p+2]))) return false;
  return true;
}
const strictKey = (bytes,p) => bytes[p]>=180 && bytes[p+2]>=180 && bytes[p+1]<=100 && bytes[p]-bytes[p+1]>=100 && bytes[p+2]-bytes[p+1]>=100;
const outerKey = (bytes,p) => bytes[p+3]>0 && bytes[p]>=120 && bytes[p+2]>=120 && bytes[p+1]<=80 && bytes[p]-bytes[p+1]>=90 && bytes[p+2]-bytes[p+1]>=90;
function exteriorKeyMask(bytes,width,height) {
  const visited=new Uint8Array(width*height),mask=new Uint8Array(width*height),queue=new Int32Array(width*height);
  let head=0,tail=0;
  const add=(x,y)=>{
    if(x<0||y<0||x>=width||y>=height)return;
    const p=y*width+x;if(visited[p])return;visited[p]=1;
    if(!bytes[p*4+3]||outerKey(bytes,p*4))queue[tail++]=p;
  };
  for(let x=0;x<width;x++){add(x,0);add(x,height-1);}
  for(let y=1;y<height-1;y++){add(0,y);add(width-1,y);}
  while(head<tail){const p=queue[head++],x=p%width,y=Math.floor(p/width);if(outerKey(bytes,p*4))mask[p]=1;add(x-1,y);add(x+1,y);add(x,y-1);add(x,y+1);}
  return mask;
}
function readAseprite(bytes, proof, id) {
  check(bytes.readUInt32LE(0) === bytes.length && bytes.readUInt16LE(4) === 0xa5e0 && bytes.readUInt16LE(6) === 16, `${id}: complete 16-frame editable file`);
  check(bytes.readUInt16LE(8) === proof.width && bytes.readUInt16LE(10) === proof.height && bytes.readUInt16LE(12) === 32, `${id}: native RGBA editable canvas`);
  let frameOffset=128, layers=0;
  const frames=[];
  for (let frame=0;frame<16;frame++) {
    check(bytes.readUInt16LE(frameOffset+4) === 0xf1fa && bytes.readUInt16LE(frameOffset+8) === durations[frame], `${id}/${frame}: scene frame and timing`);
    let count=bytes.readUInt16LE(frameOffset+6);
    if (count === 0xffff) count=bytes.readUInt32LE(frameOffset+12);
    const end=frameOffset+bytes.readUInt32LE(frameOffset), canvas=Buffer.alloc(proof.width*proof.height*4);
    let offset=frameOffset+16, celCount=0;
    for (let chunk=0;chunk<count;chunk++) {
      const length=bytes.readUInt32LE(offset),type=bytes.readUInt16LE(offset+4),body=offset+6;
      check(length >= 6 && offset+length <= end, `${id}/${frame}: bounded editable chunk`);
      if (type === 0x2004) {
        layers++;
        check(bytes.readUInt16LE(body+2) === 0 && bytes.readUInt16LE(body+4) === 0 && bytes[body+12] === 255, `${id}: visible native artwork layer`);
      } else if (type === 0x2005) {
        celCount++;
        const layer=bytes.readUInt16LE(body),x=bytes.readInt16LE(body+2),y=bytes.readInt16LE(body+4),opacity=bytes[body+6],celType=bytes.readUInt16LE(body+7);
        check(layer === 0 && opacity === 255 && (celType === 0 || celType === 2), `${id}/${frame}: independent drawn RGBA cel`);
        const width=bytes.readUInt16LE(body+16),height=bytes.readUInt16LE(body+18),payload=bytes.subarray(body+20,offset+length);
        const data=celType === 2 ? zlib.inflateSync(payload) : payload;
        check(data.length === width*height*4 && x >= 0 && y >= 0 && x+width <= proof.width && y+height <= proof.height, `${id}/${frame}: uncropped aligned editable cel`);
        for (let row=0;row<height;row++) data.copy(canvas,((y+row)*proof.width+x)*4,row*width*4,(row+1)*width*4);
      }
      offset+=length;
    }
    check(offset === end && celCount === 1, `${id}/${frame}: exactly one complete artwork cel`);
    frames.push(canvas);frameOffset=end;
  }
  check(layers === 1 && frameOffset === bytes.length, `${id}: one original-art layer across all 16 frames`);
  return frames;
}
async function main() {
  check(styles.every(style=>['sp08','sp15'].includes(style)) && requestedBreeds.every(breed=>breeds.includes(breed)), 'Requested styles and breeds are registered');
  const results=[],sourceHashes=new Set();
  for (const style of styles) for (const breed of requestedBreeds) {
    const id=`${style}/${breed}`,directory=path.join(root,'local-assets/work/sp-scenes-v1',style,'processed',breed),proofFile=path.join(directory,'conversion.json');
    if (partial && !fs.existsSync(proofFile)) continue;
    check(fs.existsSync(proofFile), `${id}: completed conversion exists`);
    const proof=JSON.parse(fs.readFileSync(proofFile,'utf8'));
    check(proof.style === style && proof.breed === breed && proof.frames === 16 && proof.uniqueWalkFrames === 8 && proof.uniqueWagFrames === 4, `${id}: six source scenes`);
    check(proof.exactVisibleRgba && proof.editableRgbaVerified && proof.sourcePreserved && !proof.resized && !proof.quantized && !proof.recolored && !proof.fabricatedFrames, `${id}: lossless source conversion`);
    check(partial || !!proof.outerMagentaCleanup, `${id}: final exterior-key cleanup is recorded`);
    const sourceBytes=fs.readFileSync(path.join(root,'local-assets/work/sp-scenes-v1',style,'originals',`${breed}.png`));
    check(sha(sourceBytes) === proof.sourceSha256 && sha(fs.readFileSync(path.join(directory,'source-input.png'))) === proof.sourceSha256, `${id}: preserved original source bytes`);
    check(!sourceHashes.has(proof.sourceSha256), `${id}: independently generated source atlas`);sourceHashes.add(proof.sourceSha256);
    const source=await sharp(sourceBytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const ase=fs.readFileSync(path.join(root,'local-assets/site',proof.aseprite));
    check(sha(ase) === proof.asepriteSha256, `${id}: verified editable file hash`);
    const editable=readAseprite(ase,proof,id),sceneHashes={walk:[],wag:[]},sceneMasks={walk:[],wag:[]};
    let retained=0,keyRemaining=0,removedOuter=0;
    for (const [scene,indexes] of Object.entries(specs)) {
      const spec=proof.scenes[scene],png=fs.readFileSync(path.join(root,'local-assets/site',spec.png));
      check(sha(png) === proof.pngSha256[scene] && spec.frames === indexes.length && spec.frameMs === durations[indexes[0]], `${id}/${scene}: verified scene strip`);
      const exported=await sharp(png).ensureAlpha().raw().toBuffer({resolveWithObject:true});
      check(exported.info.width === proof.width*indexes.length && exported.info.height === proof.height, `${id}/${scene}: native dimensions retained`);
      for (let frame=0;frame<indexes.length;frame++) {
        const rect=proof.cellRectangles[indexes[frame]],canvas=Buffer.alloc(proof.width*proof.height*4),mask=Buffer.alloc(proof.width*proof.height);
        const removedMask=new Uint8Array(proof.width*proof.height);
        if (proof.outerMagentaCleanup) {
          check(proof.outerMagentaCleanup.method === 'exterior-connected-saturated-magenta' && proof.outerMagentaCleanup.rMin === 120 && proof.outerMagentaCleanup.bMin === 120 && proof.outerMagentaCleanup.gMax === 80 && proof.outerMagentaCleanup.differenceMin === 90 && proof.outerMagentaCleanup.afterRegistration, `${id}/${scene}/${frame}: explicit exterior-only key mask`);
          const before=Buffer.alloc(proof.width*proof.height*4);
          let invalidBefore=0;
          for(let sy=rect.y;sy<rect.y+rect.height;sy++)for(let sx=rect.x;sx<rect.x+rect.width;sx++){
            const p=(sy*source.info.width+sx)*4;
            if(!source.data[p+3]||strictKey(source.data,p))continue;
            const x=sx-rect.x+rect.translation.x,y=sy-rect.y+rect.translation.y;
            if(!(x>=0&&y>=0&&x<proof.width&&y<proof.height)){invalidBefore++;continue;}
            source.data.copy(before,(y*proof.width+x)*4,p,p+4);
          }
          check(invalidBefore === 0,`${id}/${scene}/${frame}: pre-cleanup artwork remains in the native canvas`);
          const expectedMask=proof.backgroundMode === 'border-magenta' ? exteriorKeyMask(before,proof.width,proof.height) : new Uint8Array(before.length/4);
          let count=0,duplicates=0;
          for(const run of Array.isArray(rect.outerMagentaRemovedRuns)?rect.outerMagentaRemovedRuns:[]){
            check(Number.isInteger(run.x)&&Number.isInteger(run.y)&&Number.isInteger(run.length)&&run.length>0&&run.x>=0&&run.y>=0&&run.x+run.length<=proof.width&&run.y<proof.height,`${id}/${scene}/${frame}: bounded exterior key run`);
            for(let x=run.x;x<run.x+run.length;x++){const p=run.y*proof.width+x;if(removedMask[p])duplicates++;removedMask[p]=1;count++;}
          }
          check(duplicates === 0&&Buffer.from(removedMask).equals(Buffer.from(expectedMask))&&count === rect.removedOuterMagentaPixels&&rect.originalRetainedVisiblePixels-rect.retainedVisiblePixels === count,`${id}/${scene}/${frame}: exact source-derived exterior key mask; interior colors preserved`);
          removedOuter+=count;
        }
        let visible=0,edge=0,changed=0,invalid=0,left=proof.width,top=proof.height,right=-1,bottom=-1;
        for (let y=0;y<proof.height;y++) for (let x=0;x<proof.width;x++) {
          const p=(y*exported.info.width+frame*proof.width+x)*4,t=(y*proof.width+x)*4;
          if (!exported.data[p+3]) continue;
          visible++;left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);
          if (!x || !y || x === proof.width-1 || y === proof.height-1) edge++;
          const sx=rect.x+x-rect.translation.x,sy=rect.y+y-rect.translation.y;
          if (!(sx >= rect.x && sy >= rect.y && sx < rect.x+rect.width && sy < rect.y+rect.height)) { invalid++;continue; }
          const s=(sy*source.info.width+sx)*4;
          for (let c=0;c<4;c++) { if (source.data[s+c] !== exported.data[p+c]) changed++;canvas[t+c]=exported.data[p+c]; }
          mask[y*proof.width+x]=exported.data[p+3];
          const r=exported.data[p],g=exported.data[p+1],b=exported.data[p+2];
          if (r >= 180 && b >= 180 && g <= 100 && r-g >= 100 && b-g >= 100) keyRemaining++;
        }
        check(invalid === 0 && changed === 0 && visible === rect.retainedVisiblePixels, `${id}/${scene}/${frame}: every retained source RGBA pixel survives exactly`);
        if (proof.backgroundMode === 'border-magenta') {
          let missing=0;
          for (let sy=rect.y;sy<rect.y+rect.height;sy++) for (let sx=rect.x;sx<rect.x+rect.width;sx++) {
            const p=(sy*source.info.width+sx)*4,r=source.data[p],g=source.data[p+1],b=source.data[p+2];
            if (!source.data[p+3] || (r >= 180 && b >= 180 && g <= 100 && r-g >= 100 && b-g >= 100)) continue;
            const x=sx-rect.x+rect.translation.x,y=sy-rect.y+rect.translation.y;
            if (x < 0 || y < 0 || x >= proof.width || y >= proof.height) { missing++;continue; }
            if (removedMask[y*proof.width+x]) continue;
            const t=(y*proof.width+x)*4;
            for(let c=0;c<4;c++) if (source.data[p+c] !== canvas[t+c]) missing++;
          }
          check(missing === 0, `${id}/${scene}/${frame}: all non-key artwork retained`);
        }
        const bounds=proof.frameBounds[scene][frame];
        check(edge === 0 && bounds.x === left && bounds.y === top && bounds.width === right-left+1 && bounds.height === bottom-top+1, `${id}/${scene}/${frame}: unclipped artwork and exact attachment bounds`);
        if (scene !== 'wag') {
          const floor=proof.height-1-Math.max(8,Math.floor(proof.height*0.04));
          if(proof.outerMagentaCleanup){const originalBounds=rect.boundsBeforeOuterMagentaCleanup;check(originalBounds.top+originalBounds.height-1 === floor&&bottom<=floor&&bottom>=floor-3,`${id}/${scene}/${frame}: original registration unchanged by removal of the outer key fringe`);}
          else check(bottom === floor, `${id}/${scene}/${frame}: registered floor`);
        }
        check(samePixels(canvas,editable[indexes[frame]]), `${id}/${scene}/${frame}: editable Aseprite cel exactly matches PNG`);
        retained+=visible;
        if (sceneHashes[scene]) { sceneHashes[scene].push(sha(canvas));sceneMasks[scene].push(sha(mask)); }
      }
    }
    for (const [scene,count] of [['walk',8],['wag',4]]) check(new Set(sceneHashes[scene]).size === count && new Set(sceneMasks[scene]).size === count, `${id}: ${count} distinct ${scene} silhouettes`);
    if (proof.wagRegisteredByEyes) {
      const centers=proof.eyeDetection.slice(12,16).map(detection=>({x:Math.round((detection.eyes[0].x+detection.eyes[1].x)/2),y:Math.round((detection.eyes[0].y+detection.eyes[1].y)/2)}));
      check(centers.every(center=>center.x === centers[0].x && center.y === centers[0].y), `${id}: wag head center remains fixed across every drawn frame`);
    }
    if (proof.backgroundMode === 'border-magenta') check(keyRemaining === 0, `${id}: no explicit key background remains`);
    if(proof.outerMagentaCleanup)check(removedOuter === proof.removedOuterMagentaPixels,`${id}: exact exterior fringe removal count`);
    results.push({style,breed,width:proof.width,height:proof.height,scenes:6,frames:16,wagRegisteredByEyes:!!proof.wagRegisteredByEyes,retainedRgbaPixels:retained,removedOuterMagentaPixels:removedOuter,remainingStrongMagentaPixels:keyRemaining});
  }
  check(results.length > 0 && (partial || results.length === styles.length*requestedBreeds.length), 'Requested style/breed sets are complete');
  const report={checks,sets:results.length,scenes:results.length*6,frames:results.length*16,partial,allRetainedRgbaExact:true,editableRgbaExact:true,results};
  const suffix=[requestedStyle,requestedBreed,partial?'partial':null].filter(Boolean).join('-');
  fs.writeFileSync(path.join(root,'local-assets/work/sp-scenes-v1',`verification${suffix?'-'+suffix:''}.json`),JSON.stringify(report,null,2));
  console.log(JSON.stringify({...report,results:undefined,retainedRgbaPixels:results.reduce((n,result)=>n+result.retainedRgbaPixels,0)}));
}
main().catch(error=>{console.error(error.stack||error.message);process.exitCode=1;});
