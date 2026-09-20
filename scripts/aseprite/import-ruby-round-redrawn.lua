-- Import an independently redrawn 8 x 8 atlas at its native pixel resolution.
-- Each consecutive group of four cells is one action. This script does not
-- synthesize poses, resize bodies, mirror frames, draw props, or add paw pads.
-- Optional anchors JSON: {sourceSha256:"...", frames:[{eyeMode:"shared",
-- anchors:[{x:40,y:32,width:16,height:16}],translation:{x:0,y:0}}, ...]}.
-- Anchor coordinates are cell-local BEFORE integer registration. Omit an entry
-- to detect cyan sentinels. eyeMode can be shared, baked-closed, or hidden.
-- A reviewed closed/winking eye can specify cyanNeutralizeRegions rectangles
-- in cell-local coordinates; only cyan pixels in those rectangles are converted
-- to gray at their original luminance and alpha. All edits are audited.
local input=assert(app.params.input,"input required")
local output=assert(app.params.output,"output required")
local id=assert(app.params.id,"breed id required")
local eyesDirectory=assert(app.params.eyes,"eyes directory required")
local sourceSha256=assert(app.params.sourceSha256,"original SHA256 required")
local background=app.params.background or "border-magenta"
local fringeAlphaMax=tonumber(app.params.fringeAlphaMax or "8")
assert(fringeAlphaMax and fringeAlphaMax>=1 and fringeAlphaMax<=48 and fringeAlphaMax==math.floor(fringeAlphaMax),"Reviewed fringe alpha limit must be an integer from 1 to 48")
assert(background=="transparent" or background=="border-magenta" or background=="transparent-artifacts","Unsupported background")
local names={"idle","side","walk","happy","sleep","typing","petting","eat","belly","stretch","wag","scratch","walk-left","walk-right","walk-up","walk-down"}
local durations={320,240,140,180,650,140,260,220,220,260,150,180,140,140,140,140}
local labels={}
if app.params.spec then local f=assert(io.open(app.params.spec,"r"));local spec=json.decode(f:read("*a"));f:close();for _,action in ipairs(spec.actions) do labels[action.id]=action end end
local manual={}
if app.params.anchors and app.params.anchors~="" then
  local f=assert(io.open(app.params.anchors,"r"));manual=json.decode(f:read("*a"));f:close()
  assert(manual.sourceSha256 and string.lower(manual.sourceSha256)==string.lower(sourceSha256),"Manual anchors belong to a different source atlas")
end
local source=assert(app.open(input),"Could not open redrawn atlas")
app.activeSprite=source;app.command.ChangePixelFormat{ui=false,format="rgb"}
local original=Image(source)
local pc=app.pixelColor
local function isMagenta(p,strong)
  local r,g,b=pc.rgbaR(p),pc.rgbaG(p),pc.rgbaB(p)
  -- Balanced red and blue excludes warm pink pads, tongues and ears.
  if pc.rgbaA(p)==0 or b<r*.72 or r<b*.72 then return false end
  if strong then return r>=160 and b>=160 and g<=120 and math.min(r,b)-g>=90 end
  return r>=24 and b>=24 and g<=120 and math.min(r,b)-g>=20
end
local function lowAlphaArtifact(p)
  return background=="transparent-artifacts" and pc.rgbaA(p)>0 and pc.rgbaA(p)<=fringeAlphaMax
end
local function key(p) return pc.rgbaA(p)==0 or lowAlphaArtifact(p) or (background=="border-magenta" and isMagenta(p,true)) end
local function cyan(p) return pc.rgbaA(p)>0 and math.min(pc.rgbaG(p),pc.rgbaB(p))-pc.rgbaR(p)>=12 end
local function markerCore(p) return pc.rgbaA(p)>=128 and pc.rgbaG(p)>=150 and pc.rgbaB(p)>=150 and pc.rgbaR(p)<=110 and math.min(pc.rgbaG(p),pc.rgbaB(p))-pc.rgbaR(p)>=90 end
local function equal(a,b) return a==b or (pc.rgbaA(a)==0 and pc.rgbaA(b)==0) end
local function cuts(length,count,vertical,a,b)
  local result={0}
  for n=1,count-1 do
    local center=math.floor(length*n/count);local radius=math.floor(length/count*.45)
    local start,best,bestLength=nil,nil,0
    for x=math.max(0,center-radius),math.min(length-1,center+radius) do
      local clear=true
      for y=a,b-1 do if not key(vertical and original:getPixel(x,y) or original:getPixel(y,x)) then clear=false;break end end
      if clear then
        if not start then start=x end
        if x-start+1>bestLength then best=start;bestLength=x-start+1 end
      else start=nil end
    end
    assert(best and bestLength>=2,"No clean source gutter at "..(vertical and "column" or "row").." division "..n.." within "..a..".."..b.."; atlas must have eight separated rows and columns")
    result[#result+1]=best+math.floor(bestLength/2)
  end
  result[#result+1]=length;return result
end
local yCuts,xCutsByRow,sourceCells={},{},{}
local width,height=0,0
if manual.cells then
  assert(#manual.cells==64,"Reviewed manual cell rectangles must cover all 64 source frames")
  local owner={}
  for frame,rect in ipairs(manual.cells) do
    local x,y,w,h=rect.x,rect.y,rect.width,rect.height
    assert(x==math.floor(x) and y==math.floor(y) and w==math.floor(w) and h==math.floor(h) and x>=0 and y>=0 and w>=64 and h>=64 and x+w<=source.width and y+h<=source.height,"Invalid reviewed source rectangle "..frame)
    sourceCells[frame]={x=x,y=y,width=w,height=h};width=math.max(width,w);height=math.max(height,h)
    for yy=y,y+h-1 do for xx=x,x+w-1 do
      if not key(original:getPixel(xx,yy)) then
        local index=yy*source.width+xx+1
        assert(not owner[index],"Reviewed source rectangles duplicate visible artwork at "..xx..","..yy)
        owner[index]=frame
      end
    end end
  end
  for y=0,source.height-1 do for x=0,source.width-1 do
    assert(key(original:getPixel(x,y)) or owner[y*source.width+x+1],"Reviewed source rectangles omit visible artwork at "..x..","..y)
  end end
else
  yCuts=cuts(source.height,8,false,0,source.width)
  for row=1,8 do
    xCutsByRow[row]=cuts(source.width,8,true,yCuts[row],yCuts[row+1])
    for col=1,8 do
      local x,y=xCutsByRow[row][col],yCuts[row]
      local w,h=xCutsByRow[row][col+1]-x,yCuts[row+1]-y
      sourceCells[#sourceCells+1]={x=x,y=y,width=w,height=h};width=math.max(width,w);height=math.max(height,h)
    end
  end
end
assert(width>=64 and height>=64,"Native atlas cells must be at least 64px")
local bodyFrames,eyeAnchors,eyeModes,rectangles={},{},{},{}
local function bounds(group)
  local l,t,r,b=width,height,-1,-1
  for _,p in ipairs(group) do l=math.min(l,p.x);t=math.min(t,p.y);r=math.max(r,p.x);b=math.max(b,p.y) end
  return l,t,r,b
end
for frame=1,64 do
  local row=math.floor((frame-1)/8)+1;local col=(frame-1)%8+1
  local action=names[math.floor((frame-1)/4)+1]
  local supplied=manual.frames and (manual.frames[frame] or manual.frames[tostring(frame)])
  local markerMergeDistance=supplied and supplied.markerMergeDistance or 4
  assert(markerMergeDistance>=0 and markerMergeDistance<=8 and markerMergeDistance==math.floor(markerMergeDistance),"Reviewed marker merge distance must be an integer from 0 to 8")
  local rect=sourceCells[frame]
  local sx,sy,cw,ch=rect.x,rect.y,rect.width,rect.height
  local cell=Image(width,height,ColorMode.RGB);local removed=0;local transparentArtifactEdits={}
  for y=0,ch-1 do for x=0,cw-1 do
    local p=original:getPixel(sx+x,sy+y)
    if pc.rgbaA(p)==0 or (background=="border-magenta" and isMagenta(p,true)) then if pc.rgbaA(p)>0 then removed=removed+1 end else cell:drawPixel(x,y,p) end
  end end
  if background=="transparent-artifacts" then
    local visited,queue={},{}
    local function visit(x,y)
      if x<0 or y<0 or x>=width or y>=height then return end
      local k=y*width+x+1;if visited[k] then return end;visited[k]=true
      local p=cell:getPixel(x,y)
      if pc.rgbaA(p)==0 or lowAlphaArtifact(p) then queue[#queue+1]={x=x,y=y} end
    end
    for y=0,height-1 do for x=0,width-1 do if pc.rgbaA(cell:getPixel(x,y))==0 then visit(x,y) end end end
    local head=1
    while head<=#queue do
      local p=queue[head];head=head+1;local value=cell:getPixel(p.x,p.y)
      if lowAlphaArtifact(value) then transparentArtifactEdits[#transparentArtifactEdits+1]={x=p.x,y=p.y,before=value};cell:drawPixel(p.x,p.y,0) end
      for yy=p.y-1,p.y+1 do for xx=p.x-1,p.x+1 do visit(xx,yy) end end
    end
  end
  local outerEdits={}
  if background=="border-magenta" then
    local visited,queue={},{}
    local function visit(x,y)
      if x<0 or y<0 or x>=width or y>=height then return end
      local k=y*width+x+1;if visited[k] then return end;visited[k]=true
      local p=cell:getPixel(x,y)
      if pc.rgbaA(p)==0 or isMagenta(p,false) then queue[#queue+1]={x=x,y=y} end
    end
    for y=0,height-1 do for x=0,width-1 do if pc.rgbaA(cell:getPixel(x,y))==0 then visit(x,y) end end end
    local head=1
    while head<=#queue do
      local p=queue[head];head=head+1;local value=cell:getPixel(p.x,p.y)
      if isMagenta(value,false) then outerEdits[#outerEdits+1]={x=p.x,y=p.y,before=value};cell:drawPixel(p.x,p.y,0) end
      for yy=p.y-1,p.y+1 do for xx=p.x-1,p.x+1 do visit(xx,yy) end end
    end
  end
  local groups,visited={},{}
  for y=0,ch-1 do for x=0,cw-1 do
    local first=y*width+x+1
    if not visited[first] and markerCore(cell:getPixel(x,y)) then
      local queue={{x=x,y=y}};local head=1;visited[first]=true
      while head<=#queue do
        local p=queue[head];head=head+1
        for _,d in ipairs({{-1,0},{1,0},{0,-1},{0,1}}) do
          local xx,yy=p.x+d[1],p.y+d[2];local k=yy*width+xx+1
          if xx>=0 and yy>=0 and xx<cw and yy<ch and not visited[k] and markerCore(cell:getPixel(xx,yy)) then visited[k]=true;queue[#queue+1]={x=xx,y=yy} end
        end
      end
      groups[#groups+1]=queue
    end
  end end
  local merged=true
  while merged do
    merged=false
    for a=1,#groups-1 do
      if merged then break end
      local l,t,r,b=bounds(groups[a])
      for c=a+1,#groups do
        local ll,tt,rr,bb=bounds(groups[c])
        if math.max(l,ll)-math.min(r,rr)<=markerMergeDistance and math.max(t,tt)-math.min(b,bb)<=markerMergeDistance then
          for _,p in ipairs(groups[c]) do groups[a][#groups[a]+1]=p end
          table.remove(groups,c);merged=true;break
        end
      end
    end
  end
  local centers,changes,regions={},{},{}
  for _,group in ipairs(groups) do
    assert(#group<=512,"Cyan marker unexpectedly large in frame "..frame)
    local cl,ct,cr,cb=bounds(group)
    local ml,mt,mr,mb=math.max(0,cl-4),math.max(0,ct-4),math.min(cw-1,cr+4),math.min(ch-1,cb+4)
    local samples,reds,greens,blues={},{},{},{}
    for yy=math.max(0,mt-3),math.min(ch-1,mb+3) do for xx=math.max(0,ml-3),math.min(cw-1,mr+3) do
      if xx<ml or xx>mr or yy<mt or yy>mb then
        local q=cell:getPixel(xx,yy)
        if pc.rgbaA(q)>=240 and not cyan(q) and not isMagenta(q,false) then
          samples[#samples+1]=q;reds[#reds+1]=pc.rgbaR(q);greens[#greens+1]=pc.rgbaG(q);blues[#blues+1]=pc.rgbaB(q)
        end
      end
    end end
    assert(#samples>0,"No uncontaminated fur ring around marker in frame "..frame)
    table.sort(reds);table.sort(greens);table.sort(blues)
    local median=math.floor((#samples+1)/2);local fill,best=nil,math.huge
    for _,q in ipairs(samples) do
      local distance=math.abs(pc.rgbaR(q)-reds[median])+math.abs(pc.rgbaG(q)-greens[median])+math.abs(pc.rgbaB(q)-blues[median])
      if distance<best then fill=q;best=distance end
    end
    for yy=mt,mb do for xx=ml,mr do
      local before=cell:getPixel(xx,yy)
      -- A generated sentinel can contain a black pupil or black edge enclosed
      -- by its cyan core. Remove that complete tight core rectangle, otherwise
      -- shifted custom eyes would reveal a second fixed black pupil underneath.
      if (xx>=cl and xx<=cr and yy>=ct and yy<=cb) or cyan(before) then
        if not equal(before,fill) then changes[#changes+1]={x=xx,y=yy,before=before,after=fill};cell:drawPixel(xx,yy,fill) end
      end
    end end
    local mx,my=0,0;for _,p in ipairs(group) do mx=mx+p.x;my=my+p.y end
    centers[#centers+1]={x=math.floor(mx/#group+.5),y=math.floor(my/#group+.5)}
    regions[#regions+1]={kind="cyan-eye-sentinel",core={left=cl,top=ct,right=cr,bottom=cb},repair={left=ml,top=mt,right=mr,bottom=mb},fill=fill,cleanSamples=#samples,coreIncludesEnclosedInk=true,markerMergeDistance=markerMergeDistance}
  end
  for _,region in ipairs(supplied and supplied.cyanNeutralizeRegions or {}) do
    local l,t,r,b=region.left,region.top,region.right,region.bottom
    assert(l==math.floor(l) and t==math.floor(t) and r==math.floor(r) and b==math.floor(b) and l>=0 and t>=0 and r<cw and b<ch and r>=l and b>=t,"Reviewed eye rectangle outside source cell "..frame)
    assert(r-l<=32 and b-t<=32,"Reviewed closed-eye rectangle must stay tightly bounded")
    local count=0
    for yy=t,b do for xx=l,r do
      local before=cell:getPixel(xx,yy)
      if cyan(before) then
        local gray=math.floor(pc.rgbaR(before)*.2126+pc.rgbaG(before)*.7152+pc.rgbaB(before)*.0722+.5)
        local after=pc.rgba(gray,gray,gray,pc.rgbaA(before))
        changes[#changes+1]={x=xx,y=yy,before=before,after=after};cell:drawPixel(xx,yy,after);count=count+1
      end
    end end
    regions[#regions+1]={kind="reviewed-closed-eye-neutralization",repair={left=l,top=t,right=r,bottom=b},method="preserve luminance and alpha; neutralize cyan hue only",pixels=count,sourceSha256=sourceSha256}
  end
  table.sort(centers,function(a,b) return a.x<b.x end)
  local eyeMode=supplied and supplied.eyeMode or nil
  if not eyeMode then
    if action=="walk-up" then eyeMode="hidden"
    else eyeMode=#centers==0 and "baked-closed" or "shared" end
  end
  assert(eyeMode=="shared" or eyeMode=="baked-closed" or eyeMode=="hidden","Invalid eye mode in frame "..frame)
  if action=="walk-up" then assert(eyeMode=="hidden" and #centers==0,"Rear view cannot have visible eyes") end
  if eyeMode=="hidden" or eyeMode=="baked-closed" then assert(#centers==0,"Baked/hidden eye frame unexpectedly contains cyan markers: "..frame) end
  local anchors={}
  if supplied and supplied.anchors then
    for _,a in ipairs(supplied.anchors) do anchors[#anchors+1]={x=a.x,y=a.y,width=a.width,height=a.height} end
  elseif eyeMode=="shared" then
    assert(#centers>=1 and #centers<=2,"Expected one or two cyan eye markers in frame "..frame.." ("..action.."); got "..#centers)
    -- Keep one native 16px eye tile throughout the atlas. Per-frame pupil
    -- spacing must never toggle the integer tile scale during animation.
    -- Explicit manual anchor dimensions support deliberately different sizes.
    local eyeSize=16
    for _,p in ipairs(centers) do anchors[#anchors+1]={x=p.x-math.floor(eyeSize/2),y=p.y-math.floor(eyeSize/2),width=eyeSize,height=eyeSize} end
  end
  assert(eyeMode=="shared" and #anchors>=1 and #anchors<=2 or (eyeMode=="hidden" or eyeMode=="baked-closed") and #anchors==0,"Eye anchor/mode mismatch at frame "..frame)
  local l,t,r,b=width,height,-1,-1;local visible=0
  for y=0,height-1 do for x=0,width-1 do if pc.rgbaA(cell:getPixel(x,y))>0 then l=math.min(l,x);t=math.min(t,y);r=math.max(r,x);b=math.max(b,y);visible=visible+1 end end end
  assert(visible>200 and l>0 and t>0 and r<cw-1 and b<ch-1,"Incomplete or clipped source frame "..frame)
  local dx=math.floor((width-(r-l+1))/2)-l
  local dy=height-1-math.max(4,math.floor(height*.04))-b
  if supplied and supplied.translation then dx=supplied.translation.x;dy=supplied.translation.y end
  assert(dx==math.floor(dx) and dy==math.floor(dy),"Registration must use integer translation")
  assert(l+dx>=0 and r+dx<width and t+dy>=0 and b+dy<height,"Registration clips frame "..frame)
  local aligned=Image(width,height,ColorMode.RGB);aligned:drawImage(cell,Point(dx,dy))
  for _,a in ipairs(anchors) do
    assert(a.x==math.floor(a.x) and a.y==math.floor(a.y) and a.width>0 and a.height>0 and a.width%16==0 and a.height%16==0,"Eye anchors must use integer coordinates and 16px scale")
    a.x=a.x+dx;a.y=a.y+dy
    assert(a.x>=0 and a.y>=0 and a.x+a.width<=width and a.y+a.height<=height,"Eye anchor is outside registered frame "..frame)
  end
  bodyFrames[frame]=aligned;eyeAnchors[frame]=anchors;eyeModes[frame]=eyeMode
  rectangles[frame]={index=frame,action=action,actionFrame=(frame-1)%4+1,x=sx,y=sy,width=cw,height=ch,translation={x=dx,y=dy},sourceBounds={left=l,top=t,width=r-l+1,height=b-t+1},bounds={left=l+dx,top=t+dy,width=r-l+1,height=b-t+1},retainedVisiblePixels=visible,removedKeyPixels=removed,outerMagentaEdits=outerEdits,transparentArtifactEdits=transparentArtifactEdits,markerEdits=changes,markerRegions=regions,eyeMode=eyeMode}
end
source:close()
local eyeSprites={}
for n=1,30 do local eye=assert(app.open(eyesDirectory..string.format("/eye-%02d.png",n)));eyeSprites[n]=Image(eye);eye:close() end
local function renderEyes(frame,style)
  local image=Image(width,height,ColorMode.RGB)
  if eyeModes[frame]=="hidden" or eyeModes[frame]=="baked-closed" then return image end
  for side,a in ipairs(eyeAnchors[frame]) do
    for y=0,a.height-1 do for x=0,a.width-1 do
      local p=eyeSprites[style]:getPixel((side-1)*16+math.floor(x*16/a.width),math.floor(y*16/a.height))
      if pc.rgbaA(p)>0 then image:drawPixel(a.x+x,a.y+y,p) end
    end end
  end
  return image
end
local function writeMaster(count,path)
  local sprite=Sprite(width,height,ColorMode.RGB);sprite.layers[1].name="Body - independently redrawn native artwork"
  for frame=1,count do
    if frame>1 then sprite:newEmptyFrame() end
    sprite:newCel(sprite.layers[1],frame,bodyFrames[frame],Point(0,0));sprite.frames[frame].duration=durations[math.floor((frame-1)/4)+1]/1000
  end
  for n=1,count/4 do local tag=sprite:newTag((n-1)*4+1,n*4);tag.name=names[n] end
  for style=1,30 do
    local layer=sprite:newLayer();layer.name=string.format("Eyes - ruby-eye-%02d",style);layer.isVisible=style==1
    for frame=1,count do sprite:newCel(layer,frame,renderEyes(frame,style),Point(0,0)) end
  end
  sprite:saveAs(path);sprite:close()
  local reopened=assert(app.open(path));assert(#reopened.frames==count and #reopened.tags==count/4 and #reopened.layers==31,"Master lost editable layers/frames/tags")
  for n=1,count/4 do assert(reopened.tags[n].name==names[n],"Master tag order changed") end
  for frame=1,count do
    local cel=assert(reopened.layers[1]:cel(frame));local restored=Image(width,height,ColorMode.RGB);restored:drawImage(cel.image,cel.position)
    for y=0,height-1 do for x=0,width-1 do assert(equal(bodyFrames[frame]:getPixel(x,y),restored:getPixel(x,y)),"Aseprite body pixels changed at frame "..frame) end end
  end
  reopened:close()
end
writeMaster(64,output.."/"..id.."-16-actions.aseprite")
writeMaster(20,output.."/"..id..".aseprite")
local function savePng(image,path)
  local sprite=Sprite(image.width,image.height,ColorMode.RGB);sprite:newCel(sprite.layers[1],1,image,Point(0,0));sprite:saveCopyAs(path);sprite:close()
end
local actions,scenes={},{}
for n,name in ipairs(names) do
  local body=Image(width*4,height,ColorMode.RGB);local composed=Image(width*4,height,ColorMode.RGB);local anchors,modes={},{}
  for col=1,4 do
    local frame=(n-1)*4+col;local point=Point((col-1)*width,0)
    body:drawImage(bodyFrames[frame],point);composed:drawImage(bodyFrames[frame],point);composed:drawImage(renderEyes(frame,1),point)
    anchors[col]=eyeAnchors[frame];modes[col]=eyeModes[frame]
  end
  savePng(body,output.."/"..name..".png")
  local prefix="/images/ruby-round-v1/"..id.."/"..(n<=5 and "" or "actions/")
  local mode="shared"
  if name=="sleep" or name=="belly" then mode="closed" elseif name=="walk-up" then mode="hidden" end
  local record={id=name,png=prefix..name..".png",frames=4,frameMs=durations[n],eyeMode=mode,eyeModeByFrame=modes,eyes=anchors,kind="redrawn",source="independently-redrawn-atlas"}
  if labels[name] then record.name=labels[name].name;record.description=labels[name].description end
  actions[name]=record
  if n<=5 then
    savePng(composed,output.."/"..name.."-default.png")
    local desktopFrames=name=="walk" and 4 or 1
    local desktop=Image(width*desktopFrames,height,ColorMode.RGB);desktop:drawImage(composed,Point(0,0));savePng(desktop,output.."/"..name.."-desktop.png")
    scenes[name]={png=record.png,desktopPng=prefix..name.."-desktop.png",desktopFrames=desktopFrames,frames=4,frameMs=durations[n],eyes=anchors,eyeMode=mode,eyeModeByFrame=modes}
  end
end
local common={breed=id,style="ruby-round-scenes",version=3,pipelineRevision=2,width=width,height=height,frames=64,framesPerAction=4,eyeStyles=30,editableLayers=31,actions=actions,scenes=scenes,actionOrder=names,aseprite="/downloads/ruby-round-v1/"..id.."-16-actions.aseprite",legacyAseprite="/downloads/ruby-round-v1/"..id..".aseprite",compatibilityAseprite="/downloads/ruby-round-v1/"..id..".aseprite",compatibilityFrames=20,sourceSha256=sourceSha256,sourceKind="independently-redrawn-64-frame-atlas",artworkOrigin="independent-source-atlas",sourceGrid={columns=8,rows=8},sourceInput="source-input.png",cellRectangles=rectangles,gridMode=manual.cells and "reviewed-source-rectangles" or "detected-gutters",manualSourceCoverageVerified=manual.cells and true or false,gridBoundaries={xByRow=xCutsByRow,y=yCuts},originalWidth=original.width,originalHeight=original.height,resized=false,quantized=false,fabricatedFrames=false,derivedFromOldPoses=false,reusedLegacyFrames=false,mirroredFrames=false,rotatedFrames=false,bodyRegistration="integer translation only",retainedArtworkRgbaUnchanged=true,editableRgbaVerified=true,backgroundMode=background,markerCleanup="Tight cyan core rectangles including enclosed generated pupils replaced by clean surrounding fur; expanded4px cyan-only fringe repaired; optional source-hash-reviewed closed-eye cyan neutralization preserves luminance and alpha; all modified RGBA pixels recorded",fringeAlphaMax=fringeAlphaMax,transparentArtifactCleanup="Only alpha 1 through "..fringeAlphaMax..", any RGB, flood-connected to alpha 0 through pixels at or below the reviewed alpha limit using 8-neighbor connectivity; every removed RGBA recorded",artworkExceptions={"magenta background removal","cyan eye sentinel cleanup","reviewed low-alpha fringe removal connected to transparency"}}
local function report(path,value) local f=assert(io.open(path,"w"));f:write(json.encode(value));f:close() end
report(output.."/motion-conversion.json",common)
common.frames=20;common.aseprite=common.legacyAseprite;common.motionAseprite="/downloads/ruby-round-v1/"..id.."-16-actions.aseprite"
report(output.."/conversion.json",common)
print(json.encode({breed=id,actions=16,frames=64,layers=31,width=width,height=height,sourceKind="independently-redrawn-64-frame-atlas"}))
