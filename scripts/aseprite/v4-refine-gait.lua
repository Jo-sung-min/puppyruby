-- Isolated revision-2 limb articulation. Never opens revision-3 artwork.
local input=assert(app.params.input)
local metadata=assert(app.params.metadata)
local output=assert(app.params.output)
assert(input:find('revision%-2/final/akita%-v4%.aseprite$'),'Revision-2 baseline required')
local master=assert(app.open(input))
local w,h=master.width,master.height
assert(w==179 and h==188 and #master.frames==64 and #master.layers==31)
local file=assert(io.open(metadata,'r'));local manifest=json.decode(file:read('*a'));file:close()
assert(manifest.revision==2 and manifest.width==w and manifest.height==h)
local pc=app.pixelColor
local function full(layer,frame)
  local image=Image(w,h,ColorMode.RGB);local cel=layer:cel(frame)
  if cel then image:drawImage(cel.image,cel.position) end
  return image
end
local function save(image,name)
  local s=Sprite(image.width,image.height,ColorMode.RGB)
  s:newCel(s.layers[1],1,image,Point(0,0));s:saveCopyAs(output..'/'..name);s:close()
end
local originals={};local signatures={}
for f=1,64 do
  originals[f]=full(master.layers[1],f);signatures[f]={}
  for l=1,31 do signatures[f][l]=full(master.layers[l],f).bytes end
end
local reference=originals[51]
local limbs={
  farFore={root={66,146},foot={41,174},polygon={{52,146},{63,150},{72,156},{67,163},{58,176},{47,180},{32,180},{28,174},{30,167},{42,154}}},
  farHind={root={142,146},foot={153,173},polygon={{143,141},{154,145},{161,155},{165,166},{166,176},{158,179},{145,179},{139,175},{141,167},{134,156}}},
  nearFore={root={77,143},foot={83,177},polygon={{60,140},{76,136},{92,137},{98,150},{92,156},{99,166},{98,177},{91,183},{75,183},{70,177},{70,171},{73,166},{68,158},{62,151}}},
  nearHind={root={128,139},foot={110,177},polygon={{117,133},{143,133},{146,145},{135,155},{130,168},{124,177},{116,184},{103,184},{97,178},{98,169},{104,159},{111,150}}}
}
local poses={
  [2]={
    farFore={root={66,143},foot={85,161}},farHind={root={141,143},foot={118,173}},
    nearFore={root={77,140},foot={65,177}},nearHind={root={128,136},foot={145,160}}
  },
  [4]={
    farFore={root={65,143},foot={78,173}},farHind={root={140,143},foot={155,158}},
    nearFore={root={76,140},foot={60,158}},nearHind={root={127,136},foot={129,177}}
  }
}
local function inside(poly,x,y)
  local hit=false;local j=#poly
  for i=1,#poly do
    local a,b=poly[i],poly[j]
    if (a[2]>y)~=(b[2]>y) and x<(b[1]-a[1])*(y-a[2])/(b[2]-a[2])+a[1] then hit=not hit end
    j=i
  end
  return hit
end
local function articulate(id,target)
  local definition=limbs[id];local image=Image(w,h,ColorMode.RGB)
  local footHeight=9
  local sourceAnkle=definition.foot[2]-footHeight
  local targetAnkle=target.foot[2]-footHeight
  local syScale=(targetAnkle-target.root[2])/(sourceAnkle-definition.root[2])
  assert(syScale>0.1 and syScale<1.6)
  local rootDx=target.root[1]-definition.root[1]
  local footDx=target.foot[1]-definition.foot[1]-rootDx
  for y=0,h-1 do for x=0,w-1 do
    local sy=y>=targetAnkle and (sourceAnkle+y-targetAnkle) or (definition.root[2]+(y-target.root[2])/syScale)
    local t=math.max(0,math.min(1,(sy-definition.root[2])/(sourceAnkle-definition.root[2])))
    local sx=x-rootDx-footDx*t
    local ix,iy=math.floor(sx+.5),math.floor(sy+.5)
    if ix>=0 and iy>=0 and ix<w and iy<h and inside(definition.polygon,sx,sy) then
      local p=reference:getPixel(ix,iy)
      if pc.rgbaA(p)==255 then image:drawPixel(x,y,p) end
    end
  end end
  return image
end
local function flip(image)
  local result=Image(w,h,ColorMode.RGB)
  for y=0,h-1 do for x=0,w-1 do result:drawPixel(w-1-x,y,image:getPixel(x,y)) end end
  return result
end
local protectedY=140
local left={}
local audit={schemaVersion=1,revision=4,baseRevision=2,method='Native Aseprite limb-only inverse-mapped articulation from revision-2 frame 51',
  width=w,height=h,frames=64,layers=31,eyeStyles=30,unchangedContactFrames={49,51},
  protectedUpperRows={0,protectedY-1},changedFrames={},frameComparisons={},poses={{frame=2,limbs=poses[2]},{frame=4,limbs=poses[4]}},
  limbSources=limbs,untouchedFrames=0,unchangedEyeCels=0,scope='Prototype only; no final/review/source catalog changes'}
for n=1,4 do
  local original=originals[48+n]
  if not poses[n] then left[n]=Image(original)
  else
    local result=Image(w,h,ColorMode.RGB)
    result:drawImage(articulate('farFore',poses[n].farFore))
    result:drawImage(articulate('farHind',poses[n].farHind))
    -- Restore the lower torso between the leg sockets. No new color or body texture.
    for y=protectedY,151 do for x=87,123 do
      local p=original:getPixel(x,y);if pc.rgbaA(p)==255 then result:drawPixel(x,y,p) end
    end end
    result:drawImage(articulate('nearHind',poses[n].nearHind))
    result:drawImage(articulate('nearFore',poses[n].nearFore))
    -- The original bib joins the shifted foreleg through one smooth native contour.
    -- This bounded nine-row seam replaces the clipped shoulder's horizontal ledge.
    local seam=n==2 and {44,45,46,47,48,50,52,54,56} or {44,45,46,47,48,49,50,51,52}
    for index,leftX in ipairs(seam) do
      local y=139+index;local first=95
      for x=40,94 do if pc.rgbaA(result:getPixel(x,y))==255 then first=x;break end end
      local interior=result:getPixel(math.min(94,first+5),y)
      for x=40,leftX-1 do result:drawPixel(x,y,0) end
      for x=leftX,math.max(leftX+2,first+2) do
        if x<leftX+2 then result:drawPixel(x,y,pc.rgba(49,30,18,255))
        else
          local p=original:getPixel(x,y)
          if pc.rgbaA(p)==0 or pc.rgbaR(p)+pc.rgbaG(p)+pc.rgbaB(p)<260 then p=interior end
          result:drawPixel(x,y,p)
        end
      end
    end
    -- Every upper-body pixel is copied verbatim, including transparent pixels.
    for y=0,protectedY-1 do for x=0,w-1 do result:drawPixel(x,y,original:getPixel(x,y)) end end
    left[n]=result
  end
end
local updates={{id='walk',first=9,mirror=false},{id='walk-left',first=49,mirror=false},{id='walk-right',first=53,mirror=true}}
for _,update in ipairs(updates) do
  local strip=Image(w*4,h,ColorMode.RGB);local composite=Image(w*4,h,ColorMode.RGB)
  for n=1,4 do
    local f=update.first+n-1;local image=update.mirror and flip(left[n]) or Image(left[n])
    if not poses[n] then image=Image(originals[f]) end
    if update.mirror then
      for y=0,protectedY-1 do for x=0,w-1 do image:drawPixel(x,y,originals[f]:getPixel(x,y)) end end
    end
    for y=0,protectedY-1 do for x=0,w-1 do assert(image:getPixel(x,y)==originals[f]:getPixel(x,y),'Upper body changed at frame '..f) end end
    local changed=0
    for y=0,h-1 do for x=0,w-1 do if image:getPixel(x,y)~=originals[f]:getPixel(x,y) then changed=changed+1 end end end
    if changed>0 then audit.changedFrames[#audit.changedFrames+1]=f end
    audit.frameComparisons[#audit.frameComparisons+1]={frame=f,changedPixels=changed,upperBodyByteIdentical=true}
    master:deleteCel(assert(master.layers[1]:cel(f)));master:newCel(master.layers[1],f,image,Point(0,0))
    strip:drawImage(image,Point((n-1)*w,0))
    local shown=Image(image);shown:drawImage(full(master.layers[2],f));composite:drawImage(shown,Point((n-1)*w,0))
  end
  manifest.actions[update.id].source='akita-v4-revision-4-native-passing-leg-articulation'
  save(strip,'v4-refine-gait-'..update.id..'.png')
  save(composite,'v4-refine-gait-'..update.id..'-preview.png')
end
for f=1,64 do
  local target=(f>=9 and f<=12) or (f>=49 and f<=56)
  if not target then
    for l=1,31 do assert(full(master.layers[l],f).bytes==signatures[f][l],'Unrelated frame/layer changed') end
    audit.untouchedFrames=audit.untouchedFrames+1
  end
  for l=2,31 do assert(full(master.layers[l],f).bytes==signatures[f][l],'Eye cel changed');audit.unchangedEyeCels=audit.unchangedEyeCels+1 end
end
assert(audit.untouchedFrames==52 and audit.unchangedEyeCels==1920)
master:saveCopyAs(output..'/v4-refine-gait.aseprite')
manifest.revision=4;manifest.master='v4-refine-gait.aseprite';manifest.provenance.base='Akita v4 revision 2'
manifest.provenance.gait='Native limb-only passing-phase articulation; original contact poses and all 30 eye layers retained'
local f=assert(io.open(output..'/v4-refine-gait.json','w'));f:write(json.encode(manifest));f:close()
local f=assert(io.open(output..'/v4-refine-gait-audit.json','w'));f:write(json.encode(audit));f:close()
local contact=Image(w*6,h*6,ColorMode.RGB)
for n=1,4 do
  local shown=Image(left[n]);shown:drawImage(full(master.layers[2],48+n))
  local ox=((n-1)%2)*w*3;local oy=math.floor((n-1)/2)*h*3
  for y=0,h-1 do for x=0,w-1 do for yy=0,2 do for xx=0,2 do contact:drawPixel(ox+x*3+xx,oy+y*3+yy,shown:getPixel(x,y)) end end end end
end
save(contact,'v4-refine-gait-contact-3x.png')
master:close()
print(json.encode({complete=true,changedFrames=audit.changedFrames,preservedFrames=52,preservedEyeCels=1920,protectedUpperRows=protectedY}))
