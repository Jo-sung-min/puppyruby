-- Akita-only contour cleanup: trim one exterior dark pixel only when a full
-- inward dark stroke remains. Never insert bright fur into the existing ink.
-- Params: input=<master>, metadata=<manifest>, out=<existing new directory>
-- Optional: outline=38291f, removeSpurs=1. No inner recoloring is performed.
local input=assert(app.params.input,'input required')
local metadata=assert(app.params.metadata,'metadata required')
local out=assert(app.params.out,'out required')
local outline=app.params.outline or '38291f'
assert(#outline==6 and outline:match('^[%da-fA-F]+$'),'six-digit outline required')
local removeSpurs=(app.params.removeSpurs or '1')=='1'
local f=assert(io.open(metadata,'r'));local meta=json.decode(f:read('*a'));f:close()
assert(meta.breed=='akita' and #meta.actionOrder==16,'Akita metadata required')
local sprite=assert(app.open(input));local w,h=179,188;local pc=app.pixelColor
assert(sprite.width==w and sprite.height==h and #sprite.frames==64 and #sprite.layers==31 and #sprite.tags==16,'Expected native Akita master')
assert(app.fs.isDirectory(out),'Create output directory first')
assert(input:gsub('\\','/'):lower()~=(out..'/akita-contour-refined.aseprite'):gsub('\\','/'):lower(),'Never overwrite input')
local ink=pc.rgba(tonumber(outline:sub(1,2),16),tonumber(outline:sub(3,4),16),tonumber(outline:sub(5,6),16),255)
local dirs={{-1,0},{1,0},{0,-1},{0,1}}
local function fingerprint(cel)
  if not cel then return 'none' end
  return cel.position.x..','..cel.position.y..':'..cel.image.width..','..cel.image.height..':'..cel.image.bytes
end
local eyeBefore={}
for layer=2,31 do eyeBefore[layer]={};for frame=1,64 do eyeBefore[layer][frame]=fingerprint(sprite.layers[layer]:cel(frame)) end end
local names={};for _,name in ipairs(meta.actionOrder) do names[#names+1]=name end
local beforeFrames,afterFrames={},{}
local totals={boundaryRecolored=0,haloTrimmed=0,specklesRemoved=0,spursRemoved=0,opaqueAdded=0,deepInteriorChanged=0,protectedPixelsChanged=0,partialAlpha=0}
local report={version=3,source=input,breed='akita',width=w,height=h,frames=64,layers=31,tags=16,settings={outline='#'..outline,removeSpurs=removeSpurs,maximumAlphaTrim=1},policy='Trim a single exterior dark pixel only when two further inward pixels are dark stroke. Normalize the remaining dark boundary. Never fill inner ink with bright fur; original depth3+ interior, protected details and all 30 eye styles stay exact.',totals=totals,perFrame={}}
for frame=1,64 do
  local name=names[math.floor((frame-1)/4)+1];local af=(frame-1)%4+1
  local before=Image(w,h,ColorMode.RGB);local cel=assert(sprite.layers[1]:cel(frame));before:drawImage(cel.image,cel.position);beforeFrames[frame]=before
  local px,mask,protect,depth={},{},{},{};local bottom=0
  for y=0,h-1 do for x=0,w-1 do
    local k=y*w+x+1;local p=before:getPixel(x,y);local r,g,b,a=pc.rgbaR(p),pc.rgbaG(p),pc.rgbaB(p),pc.rgbaA(p)
    assert(a==0 or a==255,'Input body alpha must be binary')
    px[k]=p;mask[k]=a==255;depth[k]=a==255 and 5 or 0;if a==255 then bottom=math.max(bottom,y) end
    protect[k]=(a==255 and r>100 and r-g>=12 and b-g>=5)
      or (name=='typing' and x>=18 and x<=160 and y>=144)
      or (name=='eat' and x>=42 and x<=136 and y>=146)
      or (name=='petting' and x>=65 and y<=78)
  end end
  local function inside(x,y) return x>=0 and x<w and y>=0 and y<h end
  local function occupied(x,y) return inside(x,y) and mask[y*w+x+1] or false end
  local function guard(cx,cy,rx,ry)
    for y=math.max(0,math.floor(cy-ry)),math.min(h-1,math.ceil(cy+ry)) do for x=math.max(0,math.floor(cx-rx)),math.min(w-1,math.ceil(cx+rx)) do protect[y*w+x+1]=true end end
  end
  local eyes=meta.actions[name].eyes[af]
  for _,e in ipairs(eyes) do guard(e.x+e.width/2,e.y+e.height/2,e.width/2+2,e.height/2+2) end
  if #eyes==1 then
    local e=eyes[1];local sign=name=='walk-right' and 1 or -1
    guard(e.x+e.width/2+sign*19,e.y+e.height/2+12,8,9)
  elseif #eyes==2 then
    local a,b=eyes[1],eyes[2];local ax,ay=a.x+a.width/2,a.y+a.height/2;local bx,by=b.x+b.width/2,b.y+b.height/2
    local dx,dy=bx-ax,by-ay;local len=math.sqrt(dx*dx+dy*dy)
    guard((ax+bx)/2-dy/len*14,(ay+by)/2+dx/len*14,9,9)
  end
  for y=0,h-1 do for x=0,w-1 do
    local k=y*w+x+1
    if mask[k] then for _,d in ipairs(dirs) do if not occupied(x+d[1],y+d[2]) then depth[k]=1;break end end end
  end end
  for level=2,4 do for y=0,h-1 do for x=0,w-1 do
    local k=y*w+x+1
    if depth[k]==5 then for _,d in ipairs(dirs) do local nx,ny=x+d[1],y+d[2];if inside(nx,ny) and depth[ny*w+nx+1]==level-1 then depth[k]=level;break end end end
  end end end
  local function dark(k)
    local p=px[k];return mask[k] and math.max(pc.rgbaR(p),pc.rgbaG(p),pc.rgbaB(p))<126
  end
  local row={frame=frame,action=name,actionFrame=af,boundaryRecolored=0,haloTrimmed=0,specklesRemoved=0,spursRemoved=0,opaqueAdded=0,deepInteriorChanged=0,protectedPixelsChanged=0,partialAlpha=0}
  -- Only detached <=2-pixel marks or one-pixel leaves can disappear. Never fill
  -- a notch, bridge a leg gap, erode a ground-contact row or peel repeatedly.
  if removeSpurs then
    local seen={};local remove={}
    for y=0,h-1 do for x=0,w-1 do
      local k=y*w+x+1
      if mask[k] and not seen[k] then
        local group={k};seen[k]=true;local head=1;local keep=false
        while head<=#group do
          local q=group[head];head=head+1;local qx=(q-1)%w;local qy=math.floor((q-1)/w)
          if protect[q] or qy>=bottom-3 or not dark(q) then keep=true end
          for dy=-1,1 do for dx=-1,1 do local nx,ny=qx+dx,qy+dy;local nk=ny*w+nx+1;if occupied(nx,ny) and not seen[nk] then seen[nk]=true;group[#group+1]=nk end end end
        end
        if #group<=2 and not keep then for _,q in ipairs(group) do remove[q]='specklesRemoved' end end
      end
    end end
    for y=1,h-2 do for x=1,w-2 do
      local k=y*w+x+1
      if depth[k]==1 and dark(k) and not protect[k] and y<bottom-3 and not remove[k] then
        local n4,n8=0,0;for _,d in ipairs(dirs) do if occupied(x+d[1],y+d[2]) then n4=n4+1 end end
        if n4<=1 then
          for dy=-1,1 do for dx=-1,1 do if (dx~=0 or dy~=0) and occupied(x+dx,y+dy) then n8=n8+1 end end end
          if n8<=2 then remove[k]='spursRemoved' end
        end
      end
    end end
    for k,reason in pairs(remove) do mask[k]=false;row[reason]=row[reason]+1 end
  end
  local trim={}
  for y=1,h-2 do for x=1,w-2 do
    local k=y*w+x+1
    if mask[k] and depth[k]==1 and dark(k) and not protect[k] and y<bottom-1 then
      for _,d in ipairs(dirs) do
        local x1,y1=x+d[1],y+d[2];local x2,y2=x+d[1]*2,y+d[2]*2
        local k1,k2=y1*w+x1+1,y2*w+x2+1
        if inside(x2,y2) and depth[k1]>=2 and depth[k2]>=3 and dark(k1) and dark(k2) and not protect[k1] then trim[#trim+1]=k;break end
      end
    end
  end end
  for _,k in ipairs(trim) do mask[k]=false;row.haloTrimmed=row.haloTrimmed+1 end
  local after=Image(w,h,ColorMode.RGB)
  for y=0,h-1 do for x=0,w-1 do
    local k=y*w+x+1;local p=px[k];local value=mask[k] and p or 0
    if mask[k] and not protect[k] then
      local boundary=false
      for _,d in ipairs(dirs) do if not occupied(x+d[1],y+d[2]) then boundary=true;break end end
      if boundary and dark(k) and value~=ink then value=ink;row.boundaryRecolored=row.boundaryRecolored+1 end
    end
    assert(pc.rgbaA(value)==0 or pc.rgbaA(value)==255,'Fractional alpha introduced')
    if depth[k]>=3 then assert(value==p,'Deep interior pixel changed') end
    if pc.rgbaA(p)>0 and math.max(pc.rgbaR(p),pc.rgbaG(p),pc.rgbaB(p))>=126 then assert(value==p,'Existing non-ink fur changed') end
    if protect[k] then assert(value==p,'Protected face/detail/prop changed') end
    if pc.rgbaA(p)==0 then assert(pc.rgbaA(value)==0,'Silhouette expanded') end
    after:drawPixel(x,y,value)
  end end
  assert(row.spursRemoved+row.specklesRemoved<=24,'Too much silhouette erosion')
  local old=sprite.layers[1]:cel(frame);sprite:deleteCel(old);sprite:newCel(sprite.layers[1],frame,after,Point(0,0));afterFrames[frame]=after
  for key in pairs(totals) do totals[key]=totals[key]+row[key] end;report.perFrame[#report.perFrame+1]=row
end
for layer=2,31 do for frame=1,64 do assert(fingerprint(sprite.layers[layer]:cel(frame))==eyeBefore[layer][frame],'Eye layer changed') end end
local masterPath=out..'/akita-contour-refined.aseprite';app.activeSprite=sprite;sprite:saveAs(masterPath)
local reopened=assert(app.open(masterPath));assert(#reopened.frames==64 and #reopened.layers==31 and #reopened.tags==16,'Saved structure differs')
for layer=2,31 do for frame=1,64 do assert(fingerprint(reopened.layers[layer]:cel(frame))==eyeBefore[layer][frame],'Saved eye pixels differ') end end
for i,tag in ipairs(reopened.tags) do local old=sprite.tags[i];assert(tag.name==old.name and tag.fromFrame.frameNumber==old.fromFrame.frameNumber and tag.toFrame.frameNumber==old.toFrame.frameNumber,'Saved tags differ') end
reopened:close();report.eyeLayersByteExact=true;report.savedMasterVerified=true
local function savePng(image,path,scale)
  local s=Sprite(image.width,image.height,ColorMode.RGB);s:newCel(s.layers[1],1,image,Point(0,0));app.activeSprite=s
  if scale then app.command.SpriteSize{ui=false,width=image.width*scale,height=image.height*scale,method='nearest'} end
  s:saveCopyAs(path);s:close()
end
local function composite(body,frame)
  local im=Image(body);local e=sprite.layers[2]:cel(frame);if e then im:drawImage(e.image,e.position) end;return im
end
for i,name in ipairs(names) do local strip=Image(w*4,h,ColorMode.RGB);for n=1,4 do strip:drawImage(afterFrames[(i-1)*4+n],Point((n-1)*w,0)) end;savePng(strip,out..'/'..name..'.png') end
local chosen={1,5,9,13,21,35,38,61}
for _,bg in ipairs({{id='dark',color=pc.rgba(24,25,31,255)},{id='light',color=pc.rgba(248,246,239,255)}}) do
  local board=Image(w*4,h*4,ColorMode.RGB);for it in board:pixels() do it(bg.color) end
  for i,frame in ipairs(chosen) do local x=((i-1)%2)*w*2;local y=math.floor((i-1)/2)*h;board:drawImage(composite(beforeFrames[frame],frame),Point(x,y));board:drawImage(composite(afterFrames[frame],frame),Point(x+w,y)) end
  savePng(board,out..'/before-after-'..bg.id..'.png');savePng(board,out..'/before-after-'..bg.id..'-2x.png',2)
  local overview=Image(w*4,h*4,ColorMode.RGB);for it in overview:pixels() do it(bg.color) end
  for i=1,16 do local frame=(i-1)*4+1;overview:drawImage(composite(afterFrames[frame],frame),Point((i-1)%4*w,math.floor((i-1)/4)*h)) end
  savePng(overview,out..'/all-actions-'..bg.id..'.png')
end
local output=assert(io.open(out..'/contour-refine-report.json','w'));output:write(json.encode(report));output:close()
sprite:close();print(json.encode({complete=true,output=out,totals=totals,eyeLayersByteExact=true}))
