-- Akita v4 revision 2: four-paw gait and anatomically correct upright greeting.
-- Works on an isolated trial master. Shared eyes remain independently editable.
local function read(path) local f=assert(io.open(path,'r'));local o=json.decode(f:read('*a'));f:close();return o end
local function write(path,o) local f=assert(io.open(path,'w'));f:write(json.encode(o));f:close() end
local out=assert(app.params.output)
local sourceMeta=read(assert(app.params.metadata))
local names={'idle','side','walk','happy','sleep','typing','petting','eat','belly','stretch','wag','scratch','walk-left','walk-right','walk-up','walk-down'}
local meta={schemaVersion=1,trialVersion=4,revision=2,breed='akita',width=179,height=188,actionOrder=names,actions={},provenance={scope='Akita review only',base='Akita v4 revision 1',anatomy='Redrawn four-paw walk and two-raised-plus-two-grounded-paw greeting',rightWalk='Mirrored left gait',assembly='Native Aseprite, separate 30 eye layers',outline='Exterior-only cleanup follows the anatomy import'}}
for _,id in ipairs(names) do
  local a=sourceMeta.actions[id];local item={id=id,name=a.name,description=a.description,frames=4,frameMs=a.frameMs,eyeMode=a.eyeMode,kind=a.kind,source=a.source,png=id..'.png',eyes={},eyeModeByFrame={}}
  for n=1,4 do
    item.eyeModeByFrame[n]=a.eyeModeByFrame[n];item.eyes[n]={}
    for _,e in ipairs(a.eyes[n]) do item.eyes[n][#item.eyes[n]+1]={x=e.x,y=e.y,width=e.width,height=e.height} end
  end
  meta.actions[id]=item
end
local master=assert(app.open(assert(app.params.master)))
local w,h=master.width,master.height;local pc=app.pixelColor
assert(w==179 and h==188 and #master.frames==64 and #master.layers==31 and #master.tags==16)
local function rgb(r,g,b) return pc.rgba(r,g,b,255) end
local function full(layer,frame) local image=Image(w,h,ColorMode.RGB);local cel=layer:cel(frame);if cel then image:drawImage(cel.image,cel.position) end;return image end
local function save(image,path) local s=Sprite(image.width,image.height,ColorMode.RGB);s:newCel(s.layers[1],1,image,Point(0,0));s:saveCopyAs(path);s:close() end
local preserved={}
for frame=1,64 do if not(frame>=9 and frame<=16 or frame>=49 and frame<=56) then preserved[frame]=full(master.layers[1],frame).bytes end end
local function bounds(image,left,right)
  local box={left=right,top=image.height,right=left,bottom=0}
  for y=0,image.height-1 do for x=left,right do
    if pc.rgbaA(image:getPixel(x,y))>=128 then box.left=math.min(box.left,x);box.right=math.max(box.right,x);box.top=math.min(box.top,y);box.bottom=math.max(box.bottom,y) end
  end end
  assert(box.right>box.left and box.bottom>box.top,'Empty source cell');return box
end
local audit={scope='Akita revision 2 only',width=w,height=h,actions=16,frames=64,layers=31,redrawnFrames=16,retainedBeforeEdgePolish=48,resampling='nearest neighbor with binary alpha',poses={}}
local function extract(path,kind,maxWidth,maxHeight)
  local s=assert(app.open(path));local src=Image(s);local boxes={};local maxW,maxH=0,0
  for n=1,4 do
    boxes[n]=bounds(src,math.floor((n-1)*s.width/4),math.floor(n*s.width/4)-1)
    local b=boxes[n];maxW=math.max(maxW,b.right-b.left+1);maxH=math.max(maxH,b.bottom-b.top+1)
  end
  local scale=math.min(maxWidth/maxW,maxHeight/maxH);local result={};local report={source=path,scale=scale,frames={}}
  for n=1,4 do
    local b=boxes[n];local sw,sh=b.right-b.left+1,b.bottom-b.top+1
    local dw,dh=math.floor(sw*scale+.5),math.floor(sh*scale+.5)
    local ox=math.floor((w-dw)/2);local bob=(kind=='walk' and (n==2 or n==4)) and 2 or 0;local oy=181-dh-bob
    local im=Image(w,h,ColorMode.RGB)
    for y=0,dh-1 do for x=0,dw-1 do
      local p=src:getPixel(b.left+math.min(sw-1,math.floor(x/scale)),b.top+math.min(sh-1,math.floor(y/scale)))
      if pc.rgbaA(p)>=128 then im:drawPixel(ox+x,oy+y,rgb(pc.rgbaR(p),pc.rgbaG(p),pc.rgbaB(p))) end
    end end
    local bands=kind=='walk' and {{.11,.23,.27,.40}} or {{.23,.46,.23,.34},{.54,.79,.23,.34}}
    -- Reviewed source-space cores keep the happy eye windows away from the nose,
    -- whose upper edge is on the same scanlines as the eyes.
    local happyCores={{{203,239,232,270},{307,239,337,270}},{{746,239,776,270},{850,239,880,270}},{{1286,239,1316,270},{1391,239,1420,270}},{{1830,239,1859,270},{1934,239,1964,270}}}
    local anchors,repairs={},{}
    for eye,band in ipairs(bands) do
      local el,et,er,eb,count=w,h,0,0,0
      local xl,xr,yt,yb=ox+math.floor(dw*band[1]),ox+math.floor(dw*band[2]),oy+math.floor(dh*band[3]),oy+math.floor(dh*band[4])
      if kind=='happy' then local c=happyCores[n][eye];xl=ox+math.floor((c[1]-b.left)*scale)-1;xr=ox+math.ceil((c[3]-b.left)*scale)+1;yt=oy+math.floor((c[2]-b.top)*scale)-1;yb=oy+math.ceil((c[4]-b.top)*scale)+1 end
      for y=yt,yb do for x=xl,xr do
        local p=im:getPixel(x,y)
        if pc.rgbaA(p)==255 and math.max(pc.rgbaR(p),pc.rgbaG(p),pc.rgbaB(p))<100 then el=math.min(el,x);er=math.max(er,x);et=math.min(et,y);eb=math.max(eb,y);count=count+1 end
      end end
      assert(count>=8 and er-el<13 and eb-et<13,'Review '..kind..' eye '..eye..' frame '..n..' count='..count..' box='..el..','..et..','..er..','..eb)
      local l,t,r,bottom=el-2,et-2,er+2,eb+2;local original=Image(im)
      for y=t,bottom do
        local lp,rp=original:getPixel(l-1,y),original:getPixel(r+1,y)
        assert(pc.rgbaA(lp)==255 and pc.rgbaA(rp)==255,'Eye repair crosses silhouette')
        for x=l,r do
          local k=(x-l+1)/(r-l+2)
          im:drawPixel(x,y,rgb(math.floor(pc.rgbaR(lp)*(1-k)+pc.rgbaR(rp)*k+.5),math.floor(pc.rgbaG(lp)*(1-k)+pc.rgbaG(rp)*k+.5),math.floor(pc.rgbaB(lp)*(1-k)+pc.rgbaB(rp)*k+.5)))
        end
      end
      anchors[eye]={x=math.floor((el+er)/2+.5)-8,y=math.floor((et+eb)/2+.5)-8,width=16,height=16}
      repairs[eye]={x=l,y=t,width=r-l+1,height=bottom-t+1,darkPixels=count}
    end
    local dx=kind=='walk' and 34-anchors[1].x or math.floor(89-(anchors[1].x+anchors[2].x+16)/2+.5)
    local positioned=Image(w,h,ColorMode.RGB);positioned:drawImage(im,Point(dx,0));im=positioned
    local separated=0
    if kind=='walk' and n==3 then
      -- Native-size visual review found only a dark outline bridge between the
      -- two central paws. Open the existing slit without removing cream paw fur.
      local seam={{166,100,100},{167,100,100},{168,99,100},{169,99,100},{170,99,100},{171,98,99},{172,98,99},{173,97,98},{174,97,98},{175,98,98}}
      for _,row in ipairs(seam) do for x=row[2],row[3] do
        local p=im:getPixel(x,row[1]);assert(pc.rgbaA(p)==255 and math.max(pc.rgbaR(p),pc.rgbaG(p),pc.rgbaB(p))<110,'Reviewed paw seam changed')
        im:drawPixel(x,row[1],0);separated=separated+1
      end end
      assert(separated==17)
    end
    for _,a in ipairs(anchors) do a.x=a.x+dx end
    for _,r in ipairs(repairs) do r.x=r.x+dx end
    result[n]={body=im,eyes=anchors}
    report.frames[n]={bounds=b,nativeBounds={x=ox+dx,y=oy,width=dw,height=dh},registrationDx=dx,eyeRepairs=repairs,eyeAnchors=anchors,pawOutlineBridgePixelsRemoved=separated}
  end
  s:close();audit.poses[kind]=report;return result
end
local walks=extract(assert(app.params.walk),'walk',154,132)
local greetings=extract(assert(app.params.happy),'happy',115,158)
local eyes={}
for style=1,30 do local s=assert(app.open(app.params.eyes..string.format('/eye-%02d.png',style)));eyes[style]=Image(s);s:close() end
local function flip(image) local o=Image(w,h,ColorMode.RGB);for y=0,h-1 do for x=0,w-1 do o:drawPixel(w-1-x,y,image:getPixel(x,y)) end end;return o end
for _,r in ipairs({{id='walk',start=9,poses=walks,ms=150},{id='happy',start=13,poses=greetings,ms=180},{id='walk-left',start=49,poses=walks,ms=150},{id='walk-right',start=53,poses=walks,ms=150,flip=true}}) do
  local item=meta.actions[r.id];item.frameMs=r.ms;item.eyeMode='shared';item.source='akita-v4-revision-2-four-paw-redraw';item.eyes={};item.eyeModeByFrame={}
  for n=1,4 do
    local frame=r.start+n-1;local pose=r.poses[n];local body=r.flip and flip(pose.body) or pose.body
    master:deleteCel(assert(master.layers[1]:cel(frame)));master:newCel(master.layers[1],frame,body,Point(0,0));master.frames[frame].duration=r.ms/1000
    item.eyes[n]={};item.eyeModeByFrame[n]='shared'
    for _,a in ipairs(pose.eyes) do item.eyes[n][#item.eyes[n]+1]={x=r.flip and w-a.x-a.width or a.x,y=a.y,width=16,height=16} end
    for style=1,30 do
      local layer=master.layers[style+1];local old=layer:cel(frame);if old then master:deleteCel(old) end
      local image=Image(w,h,ColorMode.RGB)
      for eye,a in ipairs(item.eyes[n]) do for yy=0,15 do for xx=0,15 do image:drawPixel(a.x+xx,a.y+yy,eyes[style]:getPixel((eye-1)*16+xx,yy)) end end end
      master:newCel(layer,frame,image,Point(0,0))
    end
  end
end
for frame,bytes in pairs(preserved) do assert(full(master.layers[1],frame).bytes==bytes,'Unrelated pose changed at '..frame) end
for layer=2,31 do assert(not master.layers[layer]:cel(38),'Closed stretch frame gained eye overlay') end
master:saveAs(out..'/akita-v4.aseprite')
for _,r in ipairs({{id='walk-left',start=49},{id='walk-right',start=53},{id='happy',start=13}}) do
  local strip=Image(w*4,h,ColorMode.RGB);local body=Image(w*4,h,ColorMode.RGB)
  for n=1,4 do local image=full(master.layers[1],r.start+n-1);body:drawImage(image,Point((n-1)*w,0));image:drawImage(full(master.layers[2],r.start+n-1));strip:drawImage(image,Point((n-1)*w,0)) end
  save(strip,out..'/'..r.id..'-preview.png');save(body,out..'/'..r.id..'.png')
end
write(out..'/manifest.json',meta);write(out..'/anatomy-import-audit.json',audit)
master:close();print(json.encode({complete=true,output=out,revision=2,redrawnFrames=16,retainedFrames=48}))
