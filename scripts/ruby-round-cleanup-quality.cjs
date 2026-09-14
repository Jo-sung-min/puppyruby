'use strict';
const assert=require('node:assert/strict');
const cyan=(r,g,b,a)=>a>0&&Math.min(g,b)-r>=12;
const strictKey=(r,g,b,a)=>a>0&&r>=160&&b>=160&&g<=120&&r-g>=90&&b-g>=90;
const matte=(r,g,b,a)=>a>0&&r>=30&&b>=30&&g<=100&&r-g>=12&&b-g>=12;
function inspectCleanup(pixels,width,height,regions=[]){
  const issues=[];
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const p=(y*width+x)*4,r=pixels[p],g=pixels[p+1],b=pixels[p+2],a=pixels[p+3];
    if(strictKey(r,g,b,a))issues.push({kind:'opaque-magenta-key',x,y});
    else if(matte(r,g,b,a)){
      let touchesTransparency=false;
      for(let yy=Math.max(0,y-1);yy<=Math.min(height-1,y+1);yy++)for(let xx=Math.max(0,x-1);xx<=Math.min(width-1,x+1);xx++)if(!pixels[(yy*width+xx)*4+3])touchesTransparency=true;
      if(touchesTransparency)issues.push({kind:'matte-next-to-transparency-including-enclosed-holes',x,y});
    }
  }
  for(const region of regions)for(let y=region.top;y<=region.bottom;y++)for(let x=region.left;x<=region.right;x++){
    assert(x>=0&&y>=0&&x<width&&y<height,'Cleanup region must be within the native canvas');
    const p=(y*width+x)*4;
    if(cyan(pixels[p],pixels[p+1],pixels[p+2],pixels[p+3]))issues.push({kind:'cyan-in-repaired-eye-region',x,y});
  }
  return issues;
}
function selfTest(){
  const make=()=>Buffer.from(Array.from({length:25},()=>[210,180,145,255]).flat());
  const put=(b,x,y,c)=>c.forEach((v,i)=>b[(y*5+x)*4+i]=v);
  const region=[{left:1,top:1,right:3,bottom:3}];let checks=0;
  for(const bad of [[15,136,145,255],[52,120,131,255],[205,225,228,255]]){
    const b=make();put(b,2,2,bad);assert(inspectCleanup(b,5,5,region).some(x=>x.kind==='cyan-in-repaired-eye-region'));checks++;
  }
  const hole=make();put(hole,2,2,[0,0,0,0]);put(hole,3,2,[72,5,58,255]);assert(inspectCleanup(hole,5,5).some(x=>x.kind==='matte-next-to-transparency-including-enclosed-holes'));checks++;
  const key=make();put(key,2,2,[255,0,255,255]);assert(inspectCleanup(key,5,5).some(x=>x.kind==='opaque-magenta-key'));checks++;
  const clean=make();put(clean,2,2,[38,30,29,255]);assert.deepEqual(inspectCleanup(clean,5,5,region),[]);checks++;
  const tongue=make();put(tongue,2,2,[105,34,100,255]);assert.deepEqual(inspectCleanup(tongue,5,5),[]);checks++;
  return checks;
}
if(require.main===module)console.log(JSON.stringify({passed:true,qualityRegressionChecks:selfTest()}));
module.exports={inspectCleanup,selfTest};
