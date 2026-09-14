'use strict';
// Independent, read-only validation of generated source pixels and editable files.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const crypto=require('node:crypto'),zlib=require('node:zlib'),{createRequire}=require('node:module');
const {inspectCleanup,selfTest}=require('./ruby-round-cleanup-quality.cjs');
const root=path.resolve(__dirname,'..'),sharp=createRequire(path.join(root,'frontend/package.json'))('sharp');
const breeds=[...fs.readFileSync(path.join(root,'frontend/src/lib/dog-breeds.ts'),'utf8').matchAll(/id: "([a-z]+)"/g)].map(x=>x[1]);
const cleanupOverrides=JSON.parse(fs.readFileSync(path.join(__dirname,'ruby-round-cleanup-overrides.json'),'utf8'));
const requested=process.argv.find(x=>x.startsWith('--breed='))?.slice(8),partial=process.argv.includes('--partial');
const sceneNames=['idle','side','walk','happy','sleep'],durations=[320,240,140,180,650];
const sha=x=>crypto.createHash('sha256').update(x).digest('hex').toUpperCase();
let checks=0;
function check(value,label){assert.ok(value,label);checks++;}
function identical(a,b){if(a.length!==b.length)return false;for(let i=0;i<a.length;i+=4)if(a[i+3]!==b[i+3]||(a[i+3]&&(a[i]!==b[i]||a[i+1]!==b[i+1]||a[i+2]!==b[i+2])))return false;return true;}
function colorAt(bytes,p){return (bytes[p]|bytes[p+1]<<8|bytes[p+2]<<16|bytes[p+3]<<24)>>>0;}
function setColor(bytes,p,c){bytes[p]=c&255;bytes[p+1]=(c>>>8)&255;bytes[p+2]=(c>>>16)&255;bytes[p+3]=(c>>>24)&255;}
const key=(bytes,p)=>!bytes[p+3]||(bytes[p]>=160&&bytes[p+2]>=160&&bytes[p+1]<=120&&bytes[p]-bytes[p+1]>=90&&bytes[p+2]-bytes[p+1]>=90);
function decodeBody(bytes,proof){
  check(bytes.readUInt32LE(0)===bytes.length&&bytes.readUInt16LE(4)===0xa5e0,'valid Aseprite file');
  check(bytes.readUInt16LE(6)===20&&bytes.readUInt16LE(8)===proof.width&&bytes.readUInt16LE(10)===proof.height&&bytes.readUInt16LE(12)===32,'native 20 frame RGBA master');
  let offset=128,layers=0,tags=0;const frames=[];
  for(let f=0;f<20;f++){
    const frameStart=offset,end=offset+bytes.readUInt32LE(offset);check(bytes.readUInt16LE(offset+4)===0xf1fa&&bytes.readUInt16LE(offset+8)===durations[Math.floor(f/4)],'Aseprite timing');
    let count=bytes.readUInt16LE(offset+6);if(count===0xffff)count=bytes.readUInt32LE(offset+12);offset+=16;
    let body=null;
    for(let chunk=0;chunk<count;chunk++){
      const length=bytes.readUInt32LE(offset),type=bytes.readUInt16LE(offset+4),b=offset+6;check(length>=6&&offset+length<=end,'bounded editable chunk');
      if(type===0x2004)layers++;
      if(type===0x2018)tags+=bytes.readUInt16LE(b);
      if(type===0x2005&&bytes.readUInt16LE(b)===0){
        const x=bytes.readInt16LE(b+2),y=bytes.readInt16LE(b+4),kind=bytes.readUInt16LE(b+7);
        if(kind===1){body=Buffer.from(frames[bytes.readUInt16LE(b+16)]);}
        else{
          check(kind===0||kind===2,'independent native body cel');
          const w=bytes.readUInt16LE(b+16),h=bytes.readUInt16LE(b+18),raw=bytes.subarray(b+20,offset+length),pixels=kind===2?zlib.inflateSync(raw):raw;
          check(w*h*4===pixels.length&&x>=0&&y>=0&&x+w<=proof.width&&y+h<=proof.height,'body cel bounds');
          body=Buffer.alloc(proof.width*proof.height*4);for(let yy=0;yy<h;yy++)pixels.copy(body,((y+yy)*proof.width+x)*4,yy*w*4,(yy+1)*w*4);
        }
      }
      offset+=length;
    }
    check(offset===end&&end>frameStart&&body,'complete editable frame');frames.push(body);
  }
  check(offset===bytes.length&&layers===31&&tags===5,'31 editable body/eye layers and 5 animation tags');return frames;
}
async function main(){
  check(selfTest()===7,'quality checks reject real dark/pale cyan and enclosed matte regressions');
  check(!requested||breeds.includes(requested),'registered requested breed');
  const complete=[];const allHashes=new Set();
  for(const breed of requested?[requested]:breeds){
    const dir=path.join(root,'local-assets/work/ruby-round-v1/processed',breed),proofFile=path.join(dir,'conversion.json');
    if(partial&&!fs.existsSync(proofFile))continue;
    check(fs.existsSync(proofFile),`${breed}: conversion exists`);
    const proof=JSON.parse(fs.readFileSync(proofFile,'utf8'));
    check(proof.breed===breed&&proof.frames===20&&proof.eyeStyles===30&&proof.pipelineRevision===6&&!proof.resized&&!proof.quantized&&!proof.fabricatedFrames&&proof.retainedArtworkRgbaUnchanged&&proof.editableRgbaVerified,`${breed}: native conversion contract`);
    const sourceFile=path.join(root,'local-assets/work/ruby-round-v1/originals',breed+'.png'),sourceBytes=fs.readFileSync(sourceFile);
    check(sha(sourceBytes)===proof.sourceSha256&&sha(fs.readFileSync(path.join(dir,'source-input.png')))===proof.sourceSha256,`${breed}: immutable source preserved`);
    check(!allHashes.has(proof.sourceSha256),`${breed}: independently generated atlas`);allHashes.add(proof.sourceSha256);
    const source=await sharp(sourceBytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const aseBytes=fs.readFileSync(path.join(dir,breed+'.aseprite'));check(sha(aseBytes)===proof.asepriteSha256,`${breed}: editable hash`);
    const editable=decodeBody(aseBytes,proof);
    const referencePair=proof.scenes.idle.eyes[0];
    for(const scene of ['idle','happy']) for(const pair of proof.scenes[scene].eyes) {
      check(pair.length===2&&referencePair.length===2,`${breed}/${scene}: frontal view has exactly one eye pair`);
      check(pair[1].x-pair[0].x===referencePair[1].x-referencePair[0].x&&pair[1].y-pair[0].y===referencePair[1].y-referencePair[0].y,`${breed}/${scene}: eye spacing remains fixed across the full animation`);
      check(pair.every((eye,index)=>eye.width===referencePair[index].width&&eye.height===referencePair[index].height),`${breed}/${scene}: eyes cannot resize independently`);
    }
    for(let row=0;row<5;row++){
      const scene=sceneNames[row],spec=proof.scenes[scene],bytes=fs.readFileSync(path.join(dir,scene+'.png'));
      check(spec.frames===4&&spec.frameMs===durations[row]&&spec.eyes.length===4,`${breed}/${scene}: four registered animation frames`);
      check(sha(bytes)===proof.pngSha256[scene],`${breed}/${scene}: PNG hash`);
      const png=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
      check(png.info.width===proof.width*4&&png.info.height===proof.height,`${breed}/${scene}: native strip dimensions`);
      const identities=new Set();
      for(let col=0;col<4;col++){
        const index=row*4+col,rect=proof.cellRectangles[index],expected=Buffer.alloc(proof.width*proof.height*4),actual=Buffer.alloc(expected.length);
        const edits=new Map((rect.markerEdits??[]).map(e=>[e.y*proof.width+e.x,e]));
        const outer=new Map((rect.outerMagentaEdits??[]).map(e=>[e.y*proof.width+e.x,e]));
        const cyanCores=(rect.markerEdits??[]).filter(e=>{const r=e.before&255,g=(e.before>>>8)&255,b=(e.before>>>16)&255;return g>=150&&b>=150&&r<=110&&Math.min(g,b)-r>=90;});
        for(const edit of edits.values()){
          const reviewed=cleanupOverrides[breed];
          const insideReviewed=reviewed?.sourceSha256===proof.sourceSha256&&reviewed.regions.some(r=>r.frame===index+1&&edit.x+rect.x>=r.left&&edit.x+rect.x<=r.right&&edit.y+rect.y>=r.top&&edit.y+rect.y<=r.bottom);
          check(insideReviewed||cyanCores.some(core=>Math.abs(core.x-edit.x)<=8&&Math.abs(core.y-edit.y)<=8),`${breed}/${scene}/${col}: repaired pixel ${edit.x},${edit.y} must be near a cyan core or an explicitly reviewed source region`);
        }
        for(let y=0;y<rect.height;y++)for(let x=0;x<rect.width;x++){
          const sp=((rect.y+y)*source.info.width+rect.x+x)*4,c=colorAt(source.data,sp),edit=edits.get(y*proof.width+x),matte=outer.get(y*proof.width+x);
          if(edit)check(c===edit.before&&((edit.after>>>24)&255)===255,'audited cyan marker repair');
          if(matte)check(c===matte.before,'audited exterior matte removal');
          if((proof.backgroundMode==='border-magenta'?key(source.data,sp):!source.data[sp+3])||matte)continue;
          const xx=x+rect.translation.x,yy=y+rect.translation.y;
          check(xx>=0&&yy>=0&&xx<proof.width&&yy<proof.height,'retained artwork cannot be clipped');
          setColor(expected,(yy*proof.width+xx)*4,edit?edit.after:c);
        }
        for(let y=0;y<proof.height;y++)png.data.copy(actual,y*proof.width*4,(y*png.info.width+col*proof.width)*4,(y*png.info.width+(col+1)*proof.width)*4);
        check(identical(expected,actual),`${breed}/${scene}/${col}: source pixels retained exactly`);
        check(identical(editable[index],actual),`${breed}/${scene}/${col}: editable body equals exported PNG`);
        check(Array.isArray(rect.markerRegions),`${breed}/${scene}/${col}: bounded eye cleanup audit exists`);
        const cleanupRegions=rect.markerRegions.map(region=>({left:region.repair.left+rect.translation.x,top:region.repair.top+rect.translation.y,right:region.repair.right+rect.translation.x,bottom:region.repair.bottom+rect.translation.y}));
        const qualityIssues=inspectCleanup(actual,proof.width,proof.height,cleanupRegions);
        check(!qualityIssues.length,`${breed}/${scene}/${col}: residual cleanup defect ${JSON.stringify(qualityIssues.slice(0,3))}`);
        identities.add(sha(actual));
        for(const a of spec.eyes[col])check(a.x>=0&&a.y>=0&&a.x+a.width<=proof.width&&a.y+a.height<=proof.height&&a.width%16===0&&a.height%16===0,'integer eye anchors inside canvas');
      }
      check(identities.size===4,`${breed}/${scene}: four distinct source poses`);
      const defaultBytes=fs.readFileSync(path.join(dir,scene+'-default.png'));
      check(sha(defaultBytes)===proof.pngSha256[scene+'-default'],`${breed}/${scene}: default-eye fallback hash`);
      const desktopBytes=fs.readFileSync(path.join(dir,scene+'-desktop.png')),desktop=await sharp(desktopBytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
      const defaultPng=await sharp(defaultBytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
      check(spec.desktopFrames===(scene==='walk'?4:1)&&desktop.info.width===proof.width*spec.desktopFrames&&desktop.info.height===proof.height,`${breed}/${scene}: installed desktop-compatible dimensions`);
      check(sha(desktopBytes)===proof.pngSha256[scene+'-desktop'],`${breed}/${scene}: desktop fallback hash`);
      for(let y=0;y<proof.height;y++)check(identical(desktop.data.subarray(y*desktop.info.width*4,(y+1)*desktop.info.width*4),defaultPng.data.subarray(y*defaultPng.info.width*4,(y*defaultPng.info.width+desktop.info.width)*4)),`${breed}/${scene}: desktop frame equals native default eyes`);
    }
    complete.push(breed);
  }
  const eyeDir=path.join(root,'local-assets/work/ruby-round-v1/eyes'),eyeHashes=new Set();
  for(let id=1;id<=30;id++){
    const bytes=fs.readFileSync(path.join(eyeDir,`eye-${String(id).padStart(2,'0')}.png`));const png=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    check(png.info.width===32&&png.info.height===16,'each shared eye pair is32x16');eyeHashes.add(sha(png.data));
  }
  check(eyeHashes.size===30,'30 visually distinct eye designs');
  check(partial||requested||complete.length===30,'all registered breed sets available');
  console.log(JSON.stringify({passed:true,breeds:complete.length,scenes:complete.length*5,frames:complete.length*20,eyes:30,checks}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
