-- Akita-only review revision. Native Aseprite editing; all source masters stay intact.
local input=assert(app.params.input); local output=assert(app.params.output)
local function read(p) local f=assert(io.open(p,'r'));local o=json.decode(f:read('*a'));f:close();return o end
local meta=read(assert(app.params.metadata));local s=assert(app.open(input));local pc=app.pixelColor
local w,h=s.width,s.height;assert(w==179 and h==188 and #s.frames==64 and #s.layers==31)
local names={'idle','side','walk','happy','sleep','typing','petting','eat','belly','stretch','wag','scratch','walk-left','walk-right','walk-up','walk-down'}
local function rgb(r,g,b) return pc.rgba(math.floor(r+.5),math.floor(g+.5),math.floor(b+.5),255) end
local function full(layer,n) local im=Image(w,h,ColorMode.RGB);local c=layer:cel(n);if c then im:drawImage(c.image,c.position) end;return im end
local function save(im,p) local sp=Sprite(im.width,im.height,ColorMode.RGB);sp:newCel(sp.layers[1],1,im);sp:saveCopyAs(p);sp:close() end
-- Closed eyelid bounding boxes reviewed at native size. The nose/mouth are excluded.
local closed={
 ['idle:3']={{68,102,79,106},{99,101,109,106}},
 ['typing:3']={{69,99,79,103},{100,98,110,103}},
 ['petting:2']={{67,94,77,99},{97,89,108,95}},['petting:3']={{66,94,77,99},{97,97,107,101}},['petting:4']={{61,91,71,96},{92,94,102,99}},
 ['eat:1']={{67,131,78,137},{99,131,108,136}},['eat:2']={{66,126,76,132},{96,126,107,132}},
 ['belly:3']={{64,109,70,117},{57,133,63,143}},['belly:4']={{63,111,68,120},{57,137,62,146}},
 ['scratch:1']={{60,101,69,107},{89,93,98,99}},['scratch:2']={{59,107,68,115},{83,88,91,97}},['scratch:3']={{59,100,70,105},{89,105,99,110}},['scratch:4']={{68,98,78,103},{98,100,108,104}},
 ['sleep:2']={{55,150,66,154},{86,148,95,153}},['sleep:3']={{56,151,66,156},{86,151,95,155}},['sleep:4']={{57,151,67,155},{86,151,96,155}},
 ['stretch:2']={{52,149,61,153},{80,149,89,153}},['stretch:3']={{55,148,64,152},{83,147,92,152}},['wag:4']={{67,103,77,108},{97,103,107,107}}
}
local eyeClosed=s:newLayer();eyeClosed.name='Eyes.Closed (independent)'
local coatMap=s:newLayer();coatMap.name='CoatMap (R=role G=tone)';coatMap.isVisible=false
-- Snapshot the side gait before editing; standing side uses a four-paw contact pose.
local fourPaw=full(s.layers[1],50)
local function restore(im,box)
 local l,t,r,b=box[1],box[2],box[3],box[4];local pixels={}
 -- Harmonic interpolation from surrounding fur, not a painted white eye socket.
 for y=t-1,b+1 do for x=l-1,r+1 do
  local p=im:getPixel(x,y);assert(pc.rgbaA(p)>0,'Eye repair crosses silhouette')
  pixels[y*w+x]={pc.rgbaR(p),pc.rgbaG(p),pc.rgbaB(p)}
 end end
 for y=t,b do for x=l,r do
  local a,z=pixels[(t-1)*w+x],pixels[(b+1)*w+x];local k=(y-t+1)/(b-t+2)
  pixels[y*w+x]={a[1]*(1-k)+z[1]*k,a[2]*(1-k)+z[2]*k,a[3]*(1-k)+z[3]*k}
 end end
 for pass=1,180 do for y=t,b do for x=l,r do local k=y*w+x;local a,b,c,d=pixels[k-1],pixels[k+1],pixels[k-w],pixels[k+w];pixels[k]={(a[1]+b[1]+c[1]+d[1])/4,(a[2]+b[2]+c[2]+d[2])/4,(a[3]+b[3]+c[3]+d[3])/4} end end end
 for y=t,b do for x=l,r do local c=pixels[y*w+x];im:drawPixel(x,y,rgb(c[1],c[2],c[3])) end end
end
local function protect(id,x,y)
 if id=='typing' and y>=153 then return true end
 if id=='eat' and y>=158 and x>=47 and x<=129 then return true end
 if id=='petting' then local e={{68,55},{77,64},{87,62},{96,72},{106,70},{120,59},{150,27}};for i=1,#e-1 do local a,b=e[i],e[i+1];if x>=a[1] and x<=b[1] and y<=a[2]+(b[2]-a[2])*(x-a[1])/(b[1]-a[1]) then return true end end end
 return false
end
local manifest={schemaVersion=1,revision='akita-clean-body-r2',breed='akita',width=w,height=h,actions={},source=input,tool='Aseprite'}
local board=Image(w*4,h*16,ColorMode.RGB);local audit={frames=0,eyeRepairs=0,exteriorBlackPixels=0,partialAlpha=0,otherBreedsChanged=false}
for ai,id in ipairs(names) do
 local rawStrip,maskStrip,closedStrip,composedStrip=Image(w*4,h,ColorMode.RGB),Image(w*4,h,ColorMode.RGB),Image(w*4,h,ColorMode.RGB),Image(w*4,h,ColorMode.RGB)
 local m={frames=4,frameMs=meta.actions[id].frameMs,eyes={},eyeModes={},name=meta.actions[id].name}
 for f=1,4 do
  local n=(ai-1)*4+f;local im=id=='side' and Image(fourPaw) or full(s.layers[1],n);local ce=Image(w,h,ColorMode.RGB)
  local sm=id=='side' and meta.actions['walk-left'] or meta.actions[id];local sf=id=='side' and 2 or f
  local mode=sm.eyeModeByFrame[sf];local anchors={};for _,a in ipairs(sm.eyes[sf]) do anchors[#anchors+1]={x=a.x,y=a.y,width=a.width,height=a.height} end
  m.eyes[f]=anchors;m.eyeModes[f]=mode=='baked-closed' and 'closed' or mode
  if mode=='shared' then
   for _,a in ipairs(anchors) do restore(im,{a.x+1,a.y+2,a.x+14,a.y+13});audit.eyeRepairs=audit.eyeRepairs+1 end
  elseif mode=='baked-closed' then
   for _,b in ipairs(assert(closed[id..':'..f],'Missing eyelid boxes '..id..':'..f)) do
    for y=b[2]-1,b[4]+1 do for x=b[1]-1,b[3]+1 do local p=im:getPixel(x,y);if math.max(pc.rgbaR(p),pc.rgbaG(p),pc.rgbaB(p))<175 then ce:drawPixel(x,y,p) end end end
    restore(im,{b[1]-2,b[2]-2,b[3]+2,b[4]+2});audit.eyeRepairs=audit.eyeRepairs+1
   end
  end
  -- Crisp one-pixel black exterior. Preserve interior coat texture and facial details.
  local solid=Image(w,h,ColorMode.RGB)
  for y=0,h-1 do for x=0,w-1 do local p=im:getPixel(x,y);if pc.rgbaA(p)>=128 then solid:drawPixel(x,y,rgb(pc.rgbaR(p),pc.rgbaG(p),pc.rgbaB(p))) end end end
  for y=0,h-1 do for x=0,w-1 do if pc.rgbaA(solid:getPixel(x,y))>0 then
   local edge=false;for _,d in ipairs({{-1,0},{1,0},{0,-1},{0,1}}) do local xx,yy=x+d[1],y+d[2];if xx<0 or xx>=w or yy<0 or yy>=h or pc.rgbaA(solid:getPixel(xx,yy))==0 then edge=true end end
   im:drawPixel(x,y,edge and rgb(0,0,0) or solid:getPixel(x,y));if edge then audit.exteriorBlackPixels=audit.exteriorBlackPixels+1 end
  else im:drawPixel(x,y,0) end end end
  local map=Image(w,h,ColorMode.RGB)
  for y=0,h-1 do for x=0,w-1 do local p=im:getPixel(x,y);local r,g,b,a=pc.rgbaR(p),pc.rgbaG(p),pc.rgbaB(p),pc.rgbaA(p);local role=0
   if a>0 and r>=105 and g>=70 and not protect(id,x,y) then if r>=210 and r-g<=25 and g-b<=35 and g>=b then role=2 elseif r>=g and g-b>=12 and r-g>=3 then role=1 end end
   map:drawPixel(x,y,pc.rgba(role,math.floor((54*r+183*g+19*b+128)/256),0,255))
  end end
  local old=s.layers[1]:cel(n);if old then s:deleteCel(old) end;s:newCel(s.layers[1],n,im)
  s:newCel(eyeClosed,n,ce)
  s:newCel(coatMap,n,map)
  if id=='side' then for li=2,31 do local old=s.layers[li]:cel(n);if old then s:deleteCel(old) end;local eye=full(s.layers[li],50);s:newCel(s.layers[li],n,eye) end end
  rawStrip:drawImage(im,Point((f-1)*w,0));maskStrip:drawImage(map,Point((f-1)*w,0));closedStrip:drawImage(ce,Point((f-1)*w,0))
  local composed=Image(im);composed:drawImage(full(s.layers[2],n));composed:drawImage(ce);composedStrip:drawImage(composed,Point((f-1)*w,0));board:drawImage(composed,Point((f-1)*w,(ai-1)*h));audit.frames=audit.frames+1
 end
 manifest.actions[id]=m
 save(rawStrip,output..'/'..id..'.png');save(maskStrip,output..'/'..id..'-mask.png');save(closedStrip,output..'/'..id..'-closed.png');save(composedStrip,output..'/'..id..'-preview.png')
 local anim=Sprite(w,h,ColorMode.RGB)
 for f=1,4 do if f>1 then anim:newEmptyFrame() end;local cel=Image(w,h,ColorMode.RGB);cel:drawImage(composedStrip,Point(-(f-1)*w,0));anim:newCel(anim.layers[1],f,cel);anim.frames[f].duration=m.frameMs/1000 end
 anim:saveCopyAs(output..'/'..id..'.gif');anim:close()
end
s.layers[1].name='Body.Eyeless';eyeClosed.isVisible=true;s:saveAs(output..'/akita-clean-body-r2.aseprite')
save(board,output..'/all-actions.png')
for name,data in pairs({manifest=manifest,audit=audit}) do local f=assert(io.open(output..'/'..name..'.json','w'));f:write(json.encode(data));f:close() end
print('Akita native revision: 64 frames, eyeless body, separate closed eyelids, black exterior.')
