-- Akita-only review master: imported walking artwork plus the cleaned native 16-action master.
-- No production catalogs or v3 files are modified. The right-facing cycle intentionally mirrors the left.
local function read(path) local f=assert(io.open(path,'r'));local v=json.decode(f:read('*a'));f:close();return v end
local function write(path,value) local f=assert(io.open(path,'w'));f:write(json.encode(value));f:close() end
local output=assert(app.params.output)
local inputManifest=read(assert(app.params.manifest))
-- Aseprite's decoded JSON containers are userdata; copy the contract into ordinary
-- Lua tables so nested actions survive json.encode instead of becoming null.
local manifest={width=inputManifest.width,height=inputManifest.height,actions={}}
for _,id in ipairs({'idle','side','walk','happy','sleep','typing','petting','eat','belly','stretch','wag','scratch','walk-left','walk-right','walk-up','walk-down'}) do
  local a=inputManifest.actions[id];local item={id=id,frames=a.frames,frameMs=a.frameMs,name=a.name,description=a.description,eyeMode=a.eyeMode,kind=a.kind,source=a.source,eyes={},eyeModeByFrame={}}
  for n=1,4 do
    item.eyeModeByFrame[n]=a.eyeModeByFrame[n];item.eyes[n]={}
    for _,eye in ipairs(a.eyes[n]) do item.eyes[n][#item.eyes[n]+1]={x=eye.x,y=eye.y,width=eye.width,height=eye.height} end
  end
  manifest.actions[id]=item
end
local source=assert(app.open(assert(app.params.input)))
local sourceImage=Image(source)
local master=assert(app.open(assert(app.params.master)))
local w,h=master.width,master.height
assert(w==179 and h==188 and #master.frames==64 and #master.layers==31)
local pc=app.pixelColor
local function rgba(r,g,b) return pc.rgba(r,g,b,255) end
local function save(image,path)
  local s=Sprite(image.width,image.height,ColorMode.RGB);s:newCel(s.layers[1],1,image,Point(0,0));s:saveCopyAs(path);s:close()
end
local function full(layer,frame)
  local im=Image(w,h,ColorMode.RGB);local cel=layer:cel(frame);if cel then im:drawImage(cel.image,cel.position) end;return im
end
local untouched={}
for frame=1,64 do
  if not (frame>=9 and frame<=12 or frame>=49 and frame<=56 or frame==38) then untouched[frame]=full(master.layers[1],frame) end
end
-- In the v3 import a false cyan marker had erased part of this closed eyelid.
-- Reuse the intact opposite closed eyelid and its immediate matching cream fur,
-- confined to a reviewed 14x10 patch above/right of the nose; never add shared eyes here.
local stretch=full(master.layers[1],38);local stretchBefore=Image(stretch)
for y=145,154 do for x=78,91 do stretch:drawPixel(x,y,stretchBefore:getPixel(141-x,y)) end end
master:deleteCel(assert(master.layers[1]:cel(38)));master:newCel(master.layers[1],38,stretch,Point(0,0))
local bounds,maxW,maxH={},0,0
for n=1,4 do
  local from=math.floor((n-1)*source.width/4);local to=math.floor(n*source.width/4)-1
  local l,t,r,b=to,source.height,from,0
  for y=0,source.height-1 do for x=from,to do
    if pc.rgbaA(sourceImage:getPixel(x,y))>=128 then l=math.min(l,x);r=math.max(r,x);t=math.min(t,y);b=math.max(b,y) end
  end end
  assert(r>l and b>t,'Missing walk frame')
  bounds[n]={left=l,top=t,right=r,bottom=b};maxW=math.max(maxW,r-l+1);maxH=math.max(maxH,b-t+1)
end
local scale=math.min(154/maxW,132/maxH)
local walking,anchors,audit={},{},{source=app.params.input,scale=scale,frames={},alpha='binary 0 or 255',resampling='nearest neighbor',rightCycle='horizontal mirror of the selected left cycle',newActions={'walk','walk-left','walk-right'}}
for n=1,4 do
  local box=bounds[n];local sw,sh=box.right-box.left+1,box.bottom-box.top+1
  local dw,dh=math.floor(sw*scale+.5),math.floor(sh*scale+.5)
  local ox=math.floor((w-dw)/2);local oy=181-dh-((n==2 or n==4) and 2 or 0)
  local im=Image(w,h,ColorMode.RGB)
  for y=0,dh-1 do for x=0,dw-1 do
    local p=sourceImage:getPixel(box.left+math.min(sw-1,math.floor(x/scale)),box.top+math.min(sh-1,math.floor(y/scale)))
    if pc.rgbaA(p)>=128 then im:drawPixel(ox+x,oy+y,rgba(pc.rgbaR(p),pc.rgbaG(p),pc.rgbaB(p))) end
  end end
  -- The only dark island in this tightly bounded upper-muzzle region is the generated open eye.
  local el,et,er,eb=w,h,0,0;local count=0
  for y=oy+math.floor(dh*.27),oy+math.floor(dh*.40) do for x=ox+math.floor(dw*.11),ox+math.floor(dw*.23) do
    local p=im:getPixel(x,y)
    if pc.rgbaA(p)>0 and math.max(pc.rgbaR(p),pc.rgbaG(p),pc.rgbaB(p))<100 then
      el=math.min(el,x);er=math.max(er,x);et=math.min(et,y);eb=math.max(eb,y);count=count+1
    end
  end end
  assert(count>=8 and er-el<13 and eb-et<13,'Review generated eye detection for frame '..n)
  local l,t,r,b=el-2,et-2,er+2,eb+2
  local original=Image(im)
  -- Rebuild just the generated eye from the adjacent fur on each scanline; no permanent eye ink remains.
  for y=t,b do
    local lp,rp=original:getPixel(l-1,y),original:getPixel(r+1,y)
    assert(pc.rgbaA(lp)==255 and pc.rgbaA(rp)==255,'Eye repair crosses silhouette')
    for x=l,r do
      local k=(x-l+1)/(r-l+2)
      im:drawPixel(x,y,rgba(math.floor(pc.rgbaR(lp)*(1-k)+pc.rgbaR(rp)*k+.5),math.floor(pc.rgbaG(lp)*(1-k)+pc.rgbaG(rp)*k+.5),math.floor(pc.rgbaB(lp)*(1-k)+pc.rgbaB(rp)*k+.5)))
    end
  end
  local anchor={x=math.floor((el+er)/2+.5)-8,y=math.floor((et+eb)/2+.5)-8,width=16,height=16}
  -- Register by the head, not the changing reach of the paws, to avoid whole-body horizontal jitter.
  local dx=34-anchor.x
  local registered=Image(w,h,ColorMode.RGB);registered:drawImage(im,Point(dx,0));im=registered;anchor.x=anchor.x+dx
  walking[n]=im;anchors[n]=anchor
  audit.frames[n]={sourceBounds=box,bodyBounds={x=ox+dx,y=oy,width=dw,height=dh},removedEye={x=l+dx,y=t,width=r-l+1,height=b-t+1,pixels=count},registrationDx=dx,anchor=anchor}
end
if app.params.inspectwalk=='true' then
  local strip=Image(w*4,h,ColorMode.RGB)
  for n=1,4 do strip:drawImage(walking[n],Point((n-1)*w,0)) end
  save(strip,output..'/walk-body-preview.png');write(output..'/walk-import-audit.json',audit)
  source:close();master:close();print('Walk extraction preview ready');return
end
local eyes={}
for style=1,30 do local s=assert(app.open(app.params.eyes..string.format('/eye-%02d.png',style)));eyes[style]=Image(s);s:close() end
local function flip(im) local out=Image(w,h,ColorMode.RGB);for y=0,h-1 do for x=0,w-1 do out:drawPixel(w-x-1,y,im:getPixel(x,y)) end end;return out end
for _,replacement in ipairs({{id='walk',start=9},{id='walk-left',start=49},{id='walk-right',start=53,flip=true}}) do
  local item=manifest.actions[replacement.id];item.eyes={};item.eyeModeByFrame={};item.frames=4;item.frameMs=150;item.eyeMode='shared';item.kind='redrawn';item.source='akita-v4-generated-walk-with-editable-eyes'
  for n=1,4 do
    local frame=replacement.start+n-1;local im=replacement.flip and flip(walking[n]) or walking[n]
    local a=anchors[n];a={x=replacement.flip and w-a.x-a.width or a.x,y=a.y,width=a.width,height=a.height}
    local old=master.layers[1]:cel(frame);if old then master:deleteCel(old) end
    master:newCel(master.layers[1],frame,im,Point(0,0));master.frames[frame].duration=.15
    item.eyes[n]={a};item.eyeModeByFrame[n]='shared'
    for style=1,30 do
      local layer=master.layers[style+1];local oldEye=layer:cel(frame);if oldEye then master:deleteCel(oldEye) end
      local eye=Image(w,h,ColorMode.RGB)
      for yy=0,15 do for xx=0,15 do eye:drawPixel(a.x+xx,a.y+yy,eyes[style]:getPixel(xx,yy)) end end
      master:newCel(layer,frame,eye,Point(0,0))
    end
  end
end
manifest.schemaVersion=1;manifest.trialVersion=4;manifest.breed='akita';manifest.width=w;manifest.height=h
manifest.provenance={scope='Akita only, not a production release',base='ruby-round-v3',walk='AI redrawn four phase cycle, cleaned and assembled in Aseprite',rightWalk='mirrored left cycle',nativeCanvasPreserved=true}
local names={'idle','side','walk','happy','sleep','typing','petting','eat','belly','stretch','wag','scratch','walk-left','walk-right','walk-up','walk-down'}
manifest.actionOrder=names
local board=Image(w*4,h*16,ColorMode.RGB)
local partial=0
for action,id in ipairs(names) do
  local strip=Image(w*4,h,ColorMode.RGB);local composed=Image(w*4,h,ColorMode.RGB)
  local animation=Sprite(w,h,ColorMode.RGB)
  manifest.actions[id].png=id..'.png'
  for n=1,4 do
    local frame=(action-1)*4+n;local im=full(master.layers[1],frame)
    for y=0,h-1 do for x=0,w-1 do local a=pc.rgbaA(im:getPixel(x,y));if a>0 and a<255 then partial=partial+1 end end end
    strip:drawImage(im,Point((n-1)*w,0))
    im:drawImage(full(master.layers[2],frame));composed:drawImage(im,Point((n-1)*w,0));board:drawImage(im,Point((n-1)*w,(action-1)*h))
    if n>1 then animation:newEmptyFrame() end
    animation:newCel(animation.layers[1],n,im,Point(0,0));animation.frames[n].duration=master.frames[frame].duration
  end
  save(strip,output..'/'..id..'.png');save(composed,output..'/'..id..'-preview.png')
  animation:saveCopyAs(output..'/'..id..'.gif');animation:close()
end
assert(partial==0,'Trial body must have binary alpha, no magenta-key fringe')
master:saveAs(output..'/akita-v4.aseprite')
local saved=assert(app.open(output..'/akita-v4.aseprite'))
assert(#saved.frames==64 and #saved.layers==31 and #saved.tags==16,'Saved master contract changed')
local preserved=0
for frame,before in pairs(untouched) do
  local after=full(saved.layers[1],frame)
  for y=0,h-1 do for x=0,w-1 do
    assert(before:getPixel(x,y)==after:getPixel(x,y),'Non-walk body changed at frame '..frame)
  end end
  preserved=preserved+1
end
assert(preserved==51 and manifest.actions.stretch.eyeModeByFrame[2]=='baked-closed' and #manifest.actions.stretch.eyes[2]==0)
for layer=2,31 do assert(not saved.layers[layer]:cel(38),'Closed stretch frame regained a second eye overlay') end
saved:close()
save(board,output..'/all-16-actions.png')
audit.framesPerAction=4;audit.actions=16;audit.partialAlphaPixels=partial;audit.editableLayers=#master.layers;audit.totalFrames=#master.frames;audit.unchangedOtherFrames=preserved;audit.savedMasterVerified=true
audit.closedEyelidRepair={frame=38,source={x=50,y=145,width=14,height=10},destination={x=78,y=145,width=14,height=10},method='mirror intact native closed eyelid and neighboring cream fur, outside nose'}
write(output..'/manifest.json',manifest);write(output..'/walk-import-audit.json',audit)
master:close();source:close();print(json.encode({complete=true,output=output,partialAlphaPixels=partial}))
