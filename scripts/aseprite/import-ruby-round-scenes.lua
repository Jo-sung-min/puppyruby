-- Native-resolution generated poses with hand-authored interchangeable eyes.
-- No resizing, quantization, recoloring of retained artwork, or synthetic gait.
local input=assert(app.params.input,"input required")
local output=assert(app.params.output,"output required")
local id=assert(app.params.id,"breed id required")
local eyesDirectory=assert(app.params.eyes,"shared eyes directory required")
local mode=app.params.background or "border-magenta"
local anchorsPath=app.params.anchors or ""
local overrides={}
if app.params.overrides then local f=assert(io.open(app.params.overrides,"r"));overrides=json.decode(f:read("*a"))[id] or {};f:close() end
local source=assert(app.open(input),"Could not open source atlas")
app.activeSprite=source;app.command.ChangePixelFormat{ui=false,format="rgb"}
local original=Image(source)
local pc=app.pixelColor
local function key(p)
  return pc.rgbaA(p)==0 or (mode=="border-magenta" and pc.rgbaR(p)>=160 and pc.rgbaB(p)>=160 and pc.rgbaG(p)<=120 and pc.rgbaR(p)-pc.rgbaG(p)>=90 and pc.rgbaB(p)-pc.rgbaG(p)>=90)
end
-- Detect sentinel centers strictly; clean their pale AND dark cyan fringe only
-- inside the center's bounded repair region. A brightness floor misses dark teal.
local function cyan(p) return pc.rgbaA(p)>0 and math.min(pc.rgbaG(p),pc.rgbaB(p))-pc.rgbaR(p)>=12 end
local function markerCore(p) return pc.rgbaA(p)>0 and pc.rgbaG(p)>=150 and pc.rgbaB(p)>=150 and pc.rgbaR(p)<=110 and math.min(pc.rgbaG(p),pc.rgbaB(p))-pc.rgbaR(p)>=90 end
local function equal(a,b) return a==b or (pc.rgbaA(a)==0 and pc.rgbaA(b)==0) end
local function cuts(length,count,vertical,a,b)
  local result={0}
  for n=1,count-1 do
    local center=math.floor(length*n/count);local radius=math.floor(length/count*.16)
    local start,best,bestLength=nil,nil,0
    for x=center-radius,center+radius do
      local clear=true
      for y=a,b-1 do if not key(vertical and original:getPixel(x,y) or original:getPixel(y,x)) then clear=false;break end end
      if clear then
        if not start then start=x end
        if x-start+1>bestLength then best=start;bestLength=x-start+1 end
      else start=nil end
    end
    assert(best and bestLength>=2,"No clear gutter at division "..n)
    result[#result+1]=best+math.floor(bestLength/2)
  end
  result[#result+1]=length;return result
end
local yCuts=cuts(source.height,5,false,0,source.width)
local xCutsByRow={};local width,height=0,0
for row=1,5 do
  xCutsByRow[row]=cuts(source.width,4,true,yCuts[row],yCuts[row+1])
  for c=1,4 do width=math.max(width,xCutsByRow[row][c+1]-xCutsByRow[row][c]) end
  height=math.max(height,yCuts[row+1]-yCuts[row])
end
assert(width>=160 and height>=160,"Native source cells must be at least 160px")
local manual=nil
if anchorsPath~="" then local f=assert(io.open(anchorsPath,"r"));manual=json.decode(f:read("*a"));f:close() end
local names={"idle","side","walk","happy","sleep"}
local durations={320,240,140,180,650}
local images,rectangles,scenes,eyeAnchors={},{},{},{}
for i=1,20 do
  local row=math.floor((i-1)/4)+1;local col=(i-1)%4+1
  local sx,sy=xCutsByRow[row][col],yCuts[row]
  local cw,ch=xCutsByRow[row][col+1]-sx,yCuts[row+1]-sy
  local cell=Image(width,height,ColorMode.RGB)
  local removed=0
  for y=0,ch-1 do for x=0,cw-1 do
    local p=original:getPixel(sx+x,sy+y)
    if key(p) then if pc.rgbaA(p)>0 then removed=removed+1 end else cell:drawPixel(x,y,p) end
  end end
  -- Remove the generator's magenta matte only where it touches transparency.
  -- Dark neutral outline and warm brown fur cannot satisfy this hue predicate.
  local outerEdits,outerVisited,outerQueue={},{},{}
  local function outerCandidate(p)
    return pc.rgbaA(p)>0 and pc.rgbaR(p)>=30 and pc.rgbaB(p)>=30 and pc.rgbaG(p)<=100 and pc.rgbaR(p)-pc.rgbaG(p)>=12 and pc.rgbaB(p)-pc.rgbaG(p)>=12
  end
  local function visitOuter(x,y)
    if x<0 or y<0 or x>=width or y>=height then return end
    local k=y*width+x+1;if outerVisited[k] then return end;outerVisited[k]=true
    local p=cell:getPixel(x,y)
    if pc.rgbaA(p)==0 or outerCandidate(p) then outerQueue[#outerQueue+1]={x=x,y=y} end
  end
  -- Transparent holes inside curled tails and between legs are also background.
  -- Seed every transparent pixel, not only the outside border of the canvas.
  for y=0,height-1 do for x=0,width-1 do if pc.rgbaA(cell:getPixel(x,y))==0 then visitOuter(x,y) end end end
  local outerHead=1
  while outerHead<=#outerQueue do
    local p=outerQueue[outerHead];outerHead=outerHead+1
    local value=cell:getPixel(p.x,p.y)
    if outerCandidate(value) then outerEdits[#outerEdits+1]={x=p.x,y=p.y,before=value};cell:drawPixel(p.x,p.y,0) end
    for yy=p.y-1,p.y+1 do for xx=p.x-1,p.x+1 do visitOuter(xx,yy) end end
  end
  local markerGroups,visited={},{}
  for y=0,ch-1 do for x=0,cw-1 do
    local first=y*width+x+1
    if not visited[first] and markerCore(cell:getPixel(x,y)) then
      local queue={{x=x,y=y}};local head=1;visited[first]=true
      while head<=#queue do
        local p=queue[head];head=head+1
        for _,d in ipairs({{-1,0},{1,0},{0,-1},{0,1}}) do
          local xx,yy=p.x+d[1],p.y+d[2]
          local k=yy*width+xx+1
          if xx>=0 and yy>=0 and xx<cw and yy<ch and not visited[k] and markerCore(cell:getPixel(xx,yy)) then visited[k]=true;queue[#queue+1]={x=xx,y=yy} end
        end
      end
      markerGroups[#markerGroups+1]=queue
    end
  end end
  -- A strongly cyan center can contain two close islands in generated pixels.
  local function bounds(group)
    local l,t,r,b=width,height,-1,-1
    for _,p in ipairs(group) do l=math.min(l,p.x);t=math.min(t,p.y);r=math.max(r,p.x);b=math.max(b,p.y) end
    return l,t,r,b
  end
  local merged=true
  while merged do
    merged=false
    for a=1,#markerGroups-1 do
      if merged then break end
      local l,t,r,b=bounds(markerGroups[a])
      for c=a+1,#markerGroups do
        local ll,tt,rr,bb=bounds(markerGroups[c])
        if math.max(l,ll)-math.min(r,rr)<=4 and math.max(t,tt)-math.min(b,bb)<=4 then
          for _,p in ipairs(markerGroups[c]) do markerGroups[a][#markerGroups[a]+1]=p end
          table.remove(markerGroups,c);merged=true;break
        end
      end
    end
  end
  local changes,centers,markerRegions={},{},{}
  local function cleanFurRing(ml,mt,mr,mb)
    local samples,reds,greens,blues={},{},{},{}
    local sl,st,sr,sb=math.max(0,ml-3),math.max(0,mt-3),math.min(width-1,mr+3),math.min(height-1,mb+3)
    for yy=st,sb do for xx=sl,sr do
      if xx<ml or xx>mr or yy<mt or yy>mb then
        local q=cell:getPixel(xx,yy)
        if pc.rgbaA(q)==255 and not cyan(q) and not outerCandidate(q) then
          samples[#samples+1]=q;reds[#reds+1]=pc.rgbaR(q);greens[#greens+1]=pc.rgbaG(q);blues[#blues+1]=pc.rgbaB(q)
        end
      end
    end end
    assert(#samples>0,"No uncontaminated fur ring around cyan marker")
    table.sort(reds);table.sort(greens);table.sort(blues)
    local median=math.floor((#samples+1)/2);local fill,best=nil,math.huge
    for _,q in ipairs(samples) do
      local distance=math.abs(pc.rgbaR(q)-reds[median])+math.abs(pc.rgbaG(q)-greens[median])+math.abs(pc.rgbaB(q)-blues[median])
      if distance<best then fill=q;best=distance end
    end
    assert(fill and not cyan(fill),"Replacement fur must not contain cyan matte")
    return fill,{left=sl,top=st,right=sr,bottom=sb},#samples
  end
  for _,group in ipairs(markerGroups) do
    assert(#group<=512,"Cyan marker unexpectedly large")
    local mx,my=0,0
    for _,p in ipairs(group) do mx=mx+p.x;my=my+p.y end
    local cl,ct,cr,cb=bounds(group)
    local ml,mt,mr,mb=math.max(0,cl-4),math.max(0,ct-4),math.min(width-1,cr+4),math.min(height-1,cb+4)
    local repair={}
    for yy=mt,mb do for xx=ml,mr do if cyan(cell:getPixel(xx,yy)) then repair[#repair+1]={x=xx,y=yy} end end end
    -- Sample a clean exterior fur ring. Cyan at ANY brightness is excluded,
    -- including the dark teal matte that used to be selected as the fill color.
    -- Choose an existing ring color nearest the median, avoiding one dark nose
    -- color or one frequent cyan fringe overwhelming otherwise light facial fur.
    local fill,sampleRing,cleanSamples=cleanFurRing(ml,mt,mr,mb)
    for _,p in ipairs(repair) do
      changes[#changes+1]={x=p.x,y=p.y,before=cell:getPixel(p.x,p.y),after=fill}
      cell:drawPixel(p.x,p.y,fill)
    end
    for yy=mt,mb do for xx=ml,mr do assert(not cyan(cell:getPixel(xx,yy)),"Residual cyan in repaired eye region") end end
    centers[#centers+1]={x=math.floor(mx/#group+.5),y=math.floor(my/#group+.5)}
    markerRegions[#markerRegions+1]={kind="cyan-sentinel",core={left=cl,top=ct,right=cr,bottom=cb},repair={left=ml,top=mt,right=mr,bottom=mb},sampleRing=sampleRing,fill=fill,cleanSamples=cleanSamples}
  end
  for _,region in ipairs(overrides.regions or {}) do
    if region.frame==i then
      local ml,mt,mr,mb=region.left-sx,region.top-sy,region.right-sx,region.bottom-sy
      assert(ml>=0 and mt>=0 and mr<cw and mb<ch,"Reviewed source artifact is outside its expected atlas cell")
      local fill,sampleRing,cleanSamples=cleanFurRing(ml,mt,mr,mb)
      for yy=mt,mb do for xx=ml,mr do
        local before=cell:getPixel(xx,yy)
        if cyan(before) then changes[#changes+1]={x=xx,y=yy,before=before,after=fill};cell:drawPixel(xx,yy,fill) end
      end end
      markerRegions[#markerRegions+1]={kind="reviewed-source-cyan-artifact",repair={left=ml,top=mt,right=mr,bottom=mb},sampleRing=sampleRing,fill=fill,cleanSamples=cleanSamples,sourceSha256=overrides.sourceSha256}
    end
  end
  table.sort(centers,function(a,b) return a.x<b.x end)
  local l,t,r,b=width,height,-1,-1;local visible=0
  for y=0,height-1 do for x=0,width-1 do if pc.rgbaA(cell:getPixel(x,y))>0 then l=math.min(l,x);t=math.min(t,y);r=math.max(r,x);b=math.max(b,y);visible=visible+1 end end end
  assert(visible>800 and l>0 and t>0 and r<width-1 and b<height-1,"Incomplete/clipped generated cell "..i)
  local dx=math.floor((width-(r-l+1))/2)-l
  local dy=height-1-math.max(8,math.floor(height*.04))-b
  assert(t+dy>=0,"Registration clips source dog")
  local aligned=Image(width,height,ColorMode.RGB);aligned:drawImage(cell,Point(dx,dy))
  images[i]=aligned
  local anchors={}
  local supplied=manual and manual.frames and manual.frames[i]
  if supplied then
    for _,a in ipairs(supplied) do anchors[#anchors+1]={x=math.floor(a.x+dx),y=math.floor(a.y+dy),width=a.width,height=a.height} end
  else
    assert(#centers<=2 and (#centers>=1 or names[row]=="sleep"),"Need one or two cyan eye markers in source frame "..i.."; got "..#centers)
    local eyeSize=32
    if #centers==2 then eyeSize=math.max(16,math.min(48,math.floor((centers[2].x-centers[1].x)*.7/16+.5)*16)) end
    for _,p in ipairs(centers) do anchors[#anchors+1]={x=p.x+dx-math.floor(eyeSize/2),y=p.y+dy-math.floor(eyeSize/2),width=eyeSize,height=eyeSize} end
  end
  eyeAnchors[i]=anchors
  rectangles[i]={index=i,scene=names[row],x=sx,y=sy,width=cw,height=ch,translation={x=dx,y=dy},sourceBounds={left=l,top=t,width=r-l+1,height=b-t+1},bounds={left=l+dx,top=t+dy,width=r-l+1,height=b-t+1},retainedVisiblePixels=visible,removedKeyPixels=removed,outerMagentaEdits=outerEdits,markerEdits=changes,markerRegions=markerRegions}
end
source:close()
-- Keep frontal eyes a rigid pair: follow the head without changing eye spacing.
local frontalReference=eyeAnchors[1]
local function eyeCenter(pair,key,size)
  local sum=0;for _,a in ipairs(pair) do sum=sum+a[key]+a[size]/2 end
  return sum/#pair
end
if #frontalReference==2 then
  for _,row in ipairs({1,4}) do for col=1,4 do
    local i=(row-1)*4+col;local anchors=eyeAnchors[i]
    if #anchors==2 then
      local dx=math.floor(eyeCenter(anchors,"x","width")-eyeCenter(frontalReference,"x","width")+.5)
      local dy=math.floor(eyeCenter(anchors,"y","height")-eyeCenter(frontalReference,"y","height")+.5)
      local pair={};for _,a in ipairs(frontalReference) do pair[#pair+1]={x=a.x+dx,y=a.y+dy,width=a.width,height=a.height} end
      eyeAnchors[i]=pair
    end
  end end
end
for row=1,5 do for a=1,3 do for b=a+1,4 do
  local f=(row-1)*4+a;local g=(row-1)*4+b;local differs=false
  for y=0,height-1 do for x=0,width-1 do if not equal(images[f]:getPixel(x,y),images[g]:getPixel(x,y)) then differs=true;break end end if differs then break end end
  assert(differs,"Duplicate registered source frames in "..names[row])
end end end
local eyeSprites={}
for n=1,30 do local eye=assert(app.open(eyesDirectory..string.format("/eye-%02d.png",n)));eyeSprites[n]=Image(eye);eye:close() end
local function renderEyes(frame,style)
  local image=Image(width,height,ColorMode.RGB)
  local row=math.floor((frame-1)/4)+1
  local useStyle=row==5 and 10 or style
  for side,a in ipairs(eyeAnchors[frame]) do
    local crop=Image(16,16,ColorMode.RGB)
    for y=0,15 do for x=0,15 do crop:drawPixel(x,y,eyeSprites[useStyle]:getPixel((side-1)*16+x,y)) end end
    -- Eyes are code-native 16px sprites; integer nearest-neighbour scale only.
    assert(a.width%16==0 and a.height%16==0,"Eye anchors must use integer 16px scale")
    for y=0,a.height-1 do for x=0,a.width-1 do
      local p=crop:getPixel(math.floor(x*16/a.width),math.floor(y*16/a.height))
      if pc.rgbaA(p)>0 then image:drawPixel(a.x+x,a.y+y,p) end
    end end
  end
  return image
end
local sprite=Sprite(width,height,ColorMode.RGB);sprite.layers[1].name="Body - native generated eyeless artwork"
for i=1,20 do if i>1 then sprite:newEmptyFrame() end;sprite:newCel(sprite.layers[1],i,images[i],Point(0,0));sprite.frames[i].duration=durations[math.floor((i-1)/4)+1]/1000 end
for row,name in ipairs(names) do local tag=sprite:newTag((row-1)*4+1,row*4);tag.name=name end
for style=1,30 do
  local layer=sprite:newLayer();layer.name=string.format("Eyes - ruby-eye-%02d",style);layer.isVisible=style==1
  for frame=1,20 do sprite:newCel(layer,frame,renderEyes(frame,style),Point(0,0)) end
end
sprite:saveAs(output.."/"..id..".aseprite")
for row,name in ipairs(names) do
  local sheet=Image(width*4,height,ColorMode.RGB)
  local composed=Image(width*4,height,ColorMode.RGB)
  local eyes={}
  for col=1,4 do local i=(row-1)*4+col;sheet:drawImage(images[i],Point((col-1)*width,0));composed:drawImage(images[i],Point((col-1)*width,0));composed:drawImage(renderEyes(i,1),Point((col-1)*width,0));eyes[#eyes+1]=eyeAnchors[i] end
  for _,spec in ipairs({{image=sheet,file=name..".png"},{image=composed,file=name.."-default.png"}}) do
    local exported=Sprite(width*4,height,ColorMode.RGB);exported:newCel(exported.layers[1],1,spec.image,Point(0,0));exported:saveCopyAs(output.."/"..spec.file);exported:close()
  end
  local desktopFrames=name=="walk" and 4 or 1
  local desktopImage=Image(width*desktopFrames,height,ColorMode.RGB);desktopImage:drawImage(composed,Point(0,0))
  local desktop=Sprite(width*desktopFrames,height,ColorMode.RGB);desktop:newCel(desktop.layers[1],1,desktopImage,Point(0,0));desktop:saveCopyAs(output.."/"..name.."-desktop.png");desktop:close()
  scenes[name]={png="/images/ruby-round-v1/"..id.."/"..name..".png",desktopPng="/images/ruby-round-v1/"..id.."/"..name.."-desktop.png",desktopFrames=desktopFrames,frames=4,frameMs=durations[row],eyes=eyes}
end
sprite:close()
local reopened=assert(app.open(output.."/"..id..".aseprite"))
assert(#reopened.frames==20 and #reopened.tags==5 and #reopened.layers==31,"Aseprite master lost editable layers/frames/tags")
for i=1,20 do
  local cel=assert(reopened.layers[1]:cel(i));local restored=Image(width,height,ColorMode.RGB);restored:drawImage(cel.image,cel.position)
  for y=0,height-1 do for x=0,width-1 do assert(equal(images[i]:getPixel(x,y),restored:getPixel(x,y)),"Aseprite body pixels changed") end end
end
reopened:close()
local report={breed=id,style="ruby-round-scenes",version=1,pipelineRevision=6,width=width,height=height,frames=20,scenes=scenes,aseprite="/downloads/ruby-round-v1/"..id..".aseprite",cellRectangles=rectangles,gridBoundaries={xByRow=xCutsByRow,y=yCuts},originalWidth=original.width,originalHeight=original.height,resized=false,quantized=false,fabricatedFrames=false,retainedArtworkRgbaUnchanged=true,editableRgbaVerified=true,eyeStyles=30,backgroundMode=mode,markerCleanup="Strict cyan core bounding boxes expanded4px; all dark/pale cyan in bounds replaced by clean exterior fur ring median-nearest color; every old/new RGBA recorded"}
local file=assert(io.open(output.."/conversion.json","w"));file:write(json.encode(report));file:close()
print(json.encode({breed=id,scenes=5,frames=20,eyeStyles=30,width=width,height=height}))
