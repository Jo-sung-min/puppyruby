-- Akita trial: minimal exterior cleanup and one existing-pixel inner outline.
-- Does not expand the silhouette, redraw poses or modify any shared eye layer.
local input=assert(app.params.input,"input master required")
local metadata=assert(app.params.metadata,"metadata required")
local out=assert(app.params.out,"out directory required")
local outline=app.params.outline or "503726"
assert(outline:match("^[0-9a-fA-F]+$") and #outline==6,"outline must be six hex digits")
local speckleArea=tonumber(app.params.speckleArea or "2")
local spurPasses=tonumber(app.params.spurPasses or "1")
assert(speckleArea>=0 and speckleArea<=3 and speckleArea==math.floor(speckleArea),"Speckle cleanup limited to 0..3 pixels")
assert(spurPasses==0 or spurPasses==1,"Only one minimal spur pass is allowed")
local f=assert(io.open(metadata,"r"));local meta=json.decode(f:read("*a"));f:close()
assert(meta.breed=="akita" and #meta.actionOrder==16,"Akita 16-action metadata required")
local sprite=assert(app.open(input));local pc=app.pixelColor;local w,h=sprite.width,sprite.height
assert(w==179 and h==188 and #sprite.frames==64 and #sprite.layers==31 and #sprite.tags==16,"Akita native master required")
local ink=pc.rgba(tonumber(outline:sub(1,2),16),tonumber(outline:sub(3,4),16),tonumber(outline:sub(5,6),16),255)
local function rgba(p) return pc.rgbaR(p),pc.rgbaG(p),pc.rgbaB(p),pc.rgbaA(p) end
local function celFingerprint(cel)
  if not cel then return "none" end
  assert(type(cel.image.bytes)=="string","Native Image.bytes API required for fast exact eye-layer checks")
  return cel.position.x..","..cel.position.y..":"..cel.image.width..","..cel.image.height..":"..cel.image.bytes
end
local eyes={}
for layer=2,31 do
  eyes[layer]={}
  for frame=1,64 do eyes[layer][frame]=celFingerprint(sprite.layers[layer]:cel(frame)) end
end
local names={};for _,name in ipairs(meta.actionOrder) do names[#names+1]=name end
local beforeFrames,afterFrames={},{}
local report={version=1,breed="akita",source=input,nativeWidth=w,nativeHeight=h,frames=64,layers=31,tags=16,
  settings={outline="#"..outline,speckleArea=speckleArea,spurPasses=spurPasses},
  policy="Remove <=2px isolated exterior speckles and a single low-neighbor spur pass; recolor only retained 4-neighbor exterior boundary pixels. Never add opaque pixels or paint an outside stroke.",
  protected="Interior RGB, shared eye layers, eye/nose neighborhoods, pink ears/pads, lowest 4px of feet geometry, and conservative keyboard/bowl/petting-hand zones.",
  totals={specklesRemoved=0,spursRemoved=0,boundaryRecolored=0,opaqueAdded=0,interiorRgbChanged=0,protectedPixelsChanged=0},perFrame={}}
local neighbors4={{-1,0},{1,0},{0,-1},{0,1}}
local function imageFromBody(frame)
  local image=Image(w,h,ColorMode.RGB);local cel=assert(sprite.layers[1]:cel(frame));image:drawImage(cel.image,cel.position);return image
end
for frame=1,64 do
  local name=names[math.floor((frame-1)/4)+1];local localFrame=(frame-1)%4+1
  local before=imageFromBody(frame);beforeFrames[frame]=before
  local pixels,mask,protected={}, {}, {};local bottom=0;local countBefore=0
  for y=0,h-1 do for x=0,w-1 do
    local p=before:getPixel(x,y);local k=y*w+x+1;local r,g,b,a=rgba(p)
    assert(a==0 or a==255,"Input body must already have binary alpha")
    pixels[k]=p;mask[k]=a>0
    if a>0 then bottom=math.max(bottom,y);countBefore=countBefore+1 end
    -- Pink details and props retain their exact native pixels, including outlines.
    protected[k]=(a>0 and r>100 and r-g>=12 and b-g>=5)
      or (name=="typing" and x>=18 and x<=160 and y>=144)
      or (name=="eat" and x>=42 and x<=136 and y>=146)
      or (name=="petting" and x>=65 and y<=78)
  end end
  for _,a in ipairs(meta.actions[name].eyes[localFrame]) do
    for y=math.max(0,a.y-8),math.min(h-1,a.y+a.height+10) do
      for x=math.max(0,a.x-12),math.min(w-1,a.x+a.width+12) do protected[y*w+x+1]=true end
    end
  end
  local function occupied(x,y)
    return x>=0 and y>=0 and x<w and y<h and mask[y*w+x+1] or false
  end
  local row={frame=frame,action=name,actionFrame=localFrame,opaqueBefore=countBefore,specklesRemoved=0,spursRemoved=0,boundaryRecolored=0,opaqueAdded=0,interiorRgbChanged=0,protectedPixelsChanged=0}
  if speckleArea>0 then
    local visited={}
    for y=0,h-1 do for x=0,w-1 do
      local k=y*w+x+1
      if mask[k] and not visited[k] then
        local group={k};local head=1;visited[k]=true;local keep=false
        while head<=#group do
          local current=group[head];head=head+1;local xx=(current-1)%w;local yy=math.floor((current-1)/w)
          if protected[current] or yy>=bottom-3 then keep=true end
          for dy=-1,1 do for dx=-1,1 do
            local nx,ny=xx+dx,yy+dy;local nextIndex=ny*w+nx+1
            if occupied(nx,ny) and not visited[nextIndex] then visited[nextIndex]=true;group[#group+1]=nextIndex end
          end end
        end
        if #group<=speckleArea and not keep then
          for _,index in ipairs(group) do mask[index]=false;row.specklesRemoved=row.specklesRemoved+1 end
        end
      end
    end end
  end
  if spurPasses==1 then
    local remove={}
    for y=1,h-2 do for x=1,w-2 do
      local k=y*w+x+1
      if mask[k] and not protected[k] and y<bottom-3 then
        local n4,n8=0,0
        for _,d in ipairs(neighbors4) do if occupied(x+d[1],y+d[2]) then n4=n4+1 end end
        if n4<=1 then
          for dy=-1,1 do for dx=-1,1 do if (dx~=0 or dy~=0) and occupied(x+dx,y+dy) then n8=n8+1 end end end
          if n8<=3 then remove[#remove+1]=k end
        end
      end
    end end
    for _,k in ipairs(remove) do mask[k]=false;row.spursRemoved=row.spursRemoved+1 end
  end
  local after=Image(w,h,ColorMode.RGB);local countAfter=0
  for y=0,h-1 do for x=0,w-1 do
    local k=y*w+x+1;local value=mask[k] and pixels[k] or 0
    if mask[k] then
      countAfter=countAfter+1
      local boundary=false
      for _,d in ipairs(neighbors4) do if not occupied(x+d[1],y+d[2]) then boundary=true;break end end
      if boundary and not protected[k] and value~=ink then value=ink;row.boundaryRecolored=row.boundaryRecolored+1 end
      if not boundary then assert(value==pixels[k],"Interior RGB changed") end
    end
    assert(pc.rgbaA(value)==0 or pc.rgbaA(value)==255,"Alpha became fractional")
    if pc.rgbaA(pixels[k])==0 then assert(pc.rgbaA(value)==0,"Outer stroke or opaque pixel added") end
    if protected[k] then assert(value==pixels[k],"Protected native artwork changed") end
    after:drawPixel(x,y,value)
  end end
  row.opaqueAfter=countAfter;row.opaqueRemoved=countBefore-countAfter
  assert(row.opaqueRemoved<=math.max(48,countBefore*.005),"Contour cleanup removed more than 0.5% of the figure")
  afterFrames[frame]=after
  local old=sprite.layers[1]:cel(frame);sprite:deleteCel(old);sprite:newCel(sprite.layers[1],frame,after,Point(0,0))
  report.perFrame[#report.perFrame+1]=row
  for key in pairs(report.totals) do report.totals[key]=report.totals[key]+row[key] end
end
for layer=2,31 do for frame=1,64 do assert(celFingerprint(sprite.layers[layer]:cel(frame))==eyes[layer][frame],"Shared eye pixels were modified") end end
app.activeSprite=sprite;sprite:saveAs(out.."/akita-edge-polished.aseprite")
local reopened=assert(app.open(out.."/akita-edge-polished.aseprite"))
assert(#reopened.frames==64 and #reopened.layers==31 and #reopened.tags==16,"Saved master structure changed")
for layer=2,31 do for frame=1,64 do assert(celFingerprint(reopened.layers[layer]:cel(frame))==eyes[layer][frame],"Saved shared eye layer differs") end end
for n,tag in ipairs(reopened.tags) do assert(tag.name==sprite.tags[n].name and tag.fromFrame.frameNumber==sprite.tags[n].fromFrame.frameNumber and tag.toFrame.frameNumber==sprite.tags[n].toFrame.frameNumber,"Saved action tags changed") end
reopened:close()
report.savedMasterVerified=true;report.shared30EyeLayersUnchanged=true;report.frame38ClosedMetadataPreserved=meta.actions.stretch.eyeModeByFrame[2]=="baked-closed"
assert(report.frame38ClosedMetadataPreserved,"Frame38 must remain a closed expression")
local function savePng(image,path,twice)
  local s=Sprite(image.width,image.height,ColorMode.RGB);s:newCel(s.layers[1],1,image,Point(0,0));app.activeSprite=s
  if twice then app.command.SpriteSize{ui=false,width=image.width*2,height=image.height*2,method="nearest"} end
  s:saveCopyAs(path);s:close()
end
local function compose(image,frame)
  local result=Image(image);local cel=sprite.layers[2]:cel(frame);if cel then result:drawImage(cel.image,cel.position) end;return result
end
for n,name in ipairs(names) do
  local strip=Image(w*4,h,ColorMode.RGB)
  for col=1,4 do strip:drawImage(afterFrames[(n-1)*4+col],Point((col-1)*w,0)) end
  savePng(strip,out.."/"..name..".png")
end
local chosen={1,2,3,4,9,10,11,12,13,14,15,16,21,22,23,24,33,34,35,36,37,38,39,40}
for _,background in ipairs({{name="dark",color=pc.rgba(24,25,31,255)},{name="light",color=pc.rgba(248,246,239,255)}}) do
  local board=Image(w*4,h*6,ColorMode.RGB)
  for it in board:pixels() do it(background.color) end
  for i,frame in ipairs(chosen) do board:drawImage(compose(afterFrames[frame],frame),Point((i-1)%4*w,math.floor((i-1)/4)*h)) end
  savePng(board,out.."/selected-"..background.name..".png")
  savePng(board,out.."/selected-"..background.name.."-2x.png",true)
  local compare=Image(w*4,h*3,ColorMode.RGB)
  for it in compare:pixels() do it(background.color) end
  for i,frame in ipairs({1,5,21,35,38,61}) do
    local x=((i-1)%2)*w*2;local y=math.floor((i-1)/2)*h
    compare:drawImage(compose(beforeFrames[frame],frame),Point(x,y));compare:drawImage(compose(afterFrames[frame],frame),Point(x+w,y))
  end
  savePng(compare,out.."/before-after-"..background.name..".png")
  savePng(compare,out.."/before-after-"..background.name.."-2x.png",true)
end
local file=assert(io.open(out.."/edge-polish-report.json","w"));file:write(json.encode(report));file:close()
sprite:close();print(json.encode({complete=true,out=out,totals=report.totals,shared30EyeLayersUnchanged=true}))
