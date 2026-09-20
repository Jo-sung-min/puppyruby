-- Expand a verified Ruby Round v1 master into an editable 16-action master.
-- Existing body frames are copied at native resolution. New actions are assembled
-- from those reviewed poses with integer-only motion and separate pixel prop layers.
local input=assert(app.params.input,"input required")
local proofPath=assert(app.params.proof,"proof required")
local specPath=assert(app.params.spec,"spec required")
local eyesDirectory=assert(app.params.eyes,"eyes directory required")
local output=assert(app.params.output,"output required")
local id=assert(app.params.id,"breed id required")
local function readJson(path) local f=assert(io.open(path,"r"));local value=json.decode(f:read("*a"));f:close();return value end
local proof=readJson(proofPath)
local contract=readJson(specPath)
assert(contract.schemaVersion==2 and contract.framesPerAction==4 and #contract.actions==16,"Expected the reviewed 16-action contract")
assert(proof.breed==id and proof.frames==20 and proof.eyeStyles==30,"Input proof is not a complete Ruby Round v1 master")
local source=assert(app.open(input),"Could not open Ruby Round v1 master")
assert(#source.frames==20 and #source.tags==5 and #source.layers==31,"Unexpected Ruby Round v1 master structure")
local width,height=source.width,source.height
assert(width==proof.width and height==proof.height,"Master and proof dimensions differ")
local pc=app.pixelColor
local rgba=pc.rgba
local transparent=rgba(0,0,0,0)
local unit=math.max(1,math.floor(math.min(width,height)/96))
local starts={idle=1,side=5,walk=9,happy=13,sleep=17}
local legacy={idle=true,side=true,walk=true,happy=true,sleep=true}
local durations={}
for _,action in ipairs(contract.actions) do
  assert(starts[action.source],"Unknown source scene: "..tostring(action.source))
  assert(action.eyeMode=="shared" or action.eyeMode=="closed" or action.eyeMode=="hidden" or action.eyeMode=="baked","Unknown eye mode")
  durations[action.id]=action.frameMs
end
for _,tag in ipairs(source.tags) do assert(starts[tag.name] and tag.fromFrame.frameNumber==starts[tag.name] and tag.toFrame.frameNumber==starts[tag.name]+3,"Legacy tags changed") end

local function fullCel(layer,frame)
  local result=Image(width,height,ColorMode.RGB)
  local cel=layer:cel(frame)
  if cel then result:drawImage(cel.image,cel.position) end
  return result
end
local function transformImage(image,dx,dy,flipX,flipY,scaleX,scaleY)
  scaleX=scaleX or 1;scaleY=scaleY or 1
  local result=Image(width,height,ColorMode.RGB)
  local centerX=width/2;local baseline=height*.96
  for ny=0,height-1 do for nx=0,width-1 do
    local tx=nx-dx;local ty=ny-dy
    if flipX then tx=width-1-tx end;if flipY then ty=height-1-ty end
    local sx=math.floor(centerX+(tx-centerX)/scaleX+.5);local sy=math.floor(baseline+(ty-baseline)/scaleY+.5)
    if sx>=0 and sy>=0 and sx<width and sy<height then local p=image:getPixel(sx,sy);if pc.rgbaA(p)>0 then result:drawPixel(nx,ny,p) end end
  end end
  return result
end
local function opaqueBounds(image)
  local left,top,right,bottom=width,height,-1,-1
  for y=0,height-1 do for x=0,width-1 do
    if pc.rgbaA(image:getPixel(x,y))>0 then
      if x<left then left=x end;if x>right then right=x end
      if y<top then top=y end;if y>bottom then bottom=y end
    end
  end end
  assert(right>=left and bottom>=top,"Expected visible artwork")
  return {left=left,top=top,right=right,bottom=bottom}
end
local function rotate180InBounds(image,bounds,dx,dy)
  local result=Image(width,height,ColorMode.RGB)
  for y=bounds.top,bounds.bottom do for x=bounds.left,bounds.right do
    local p=image:getPixel(x,y)
    if pc.rgbaA(p)>0 then
      local nx=bounds.left+bounds.right-x+dx
      local ny=bounds.top+bounds.bottom-y+dy
      if nx>=0 and ny>=0 and nx<width and ny<height then result:drawPixel(nx,ny,p) end
    end
  end end
  return result
end
local function transformedAnchor(a,dx,dy,flipX,flipY,scaleX,scaleY)
  scaleX=scaleX or 1;scaleY=scaleY or 1
  local centerX=width/2;local baseline=height*.96
  local x=centerX+(a.x-centerX)*scaleX;local y=baseline+(a.y-baseline)*scaleY
  local w=math.max(16,math.floor(a.width*scaleX/16+.5)*16);local h=math.max(16,math.floor(a.height*scaleY/16+.5)*16)
  x=math.floor(x+.5);y=math.floor(y+.5)
  if flipX then x=width-x-w end;if flipY then y=height-y-h end
  return {x=x+dx,y=y+dy,width=w,height=h}
end
local function copyAnchors(anchors,dx,dy,flipX,flipY,scaleX,scaleY)
  local result={}
  for _,a in ipairs(anchors) do result[#result+1]=transformedAnchor(a,dx,dy,flipX,flipY,scaleX,scaleY) end
  table.sort(result,function(a,b)return a.x<b.x end)
  return result
end
local function pixel(image,x,y,color)
  x=math.floor(x);y=math.floor(y)
  if x>=0 and y>=0 and x<width and y<height then image:drawPixel(x,y,color) end
end
local function rect(image,x,y,w,h,color)
  x=math.floor(x);y=math.floor(y);w=math.max(0,math.floor(w));h=math.max(0,math.floor(h))
  for yy=y,y+h-1 do for xx=x,x+w-1 do pixel(image,xx,yy,color) end end
end
local function ellipse(image,cx,cy,rx,ry,color)
  cx=math.floor(cx);cy=math.floor(cy);rx=math.max(1,math.floor(rx));ry=math.max(1,math.floor(ry))
  for y=-ry,ry do for x=-rx,rx do if (x*x)/(rx*rx)+(y*y)/(ry*ry)<=1 then pixel(image,cx+x,cy+y,color) end end end
end
local function maskedEllipse(image,mask,cx,cy,rx,ry,color)
  cx=math.floor(cx);cy=math.floor(cy);rx=math.max(1,math.floor(rx));ry=math.max(1,math.floor(ry))
  for y=-ry,ry do for x=-rx,rx do
    local px,py=cx+x,cy+y
    if (x*x)/(rx*rx)+(y*y)/(ry*ry)<=1 and px>=0 and py>=0 and px<width and py<height and pc.rgbaA(mask:getPixel(px,py))>0 then image:drawPixel(px,py,color) end
  end end
end
local function eraseFaceFeatures(image,body,cx,eyeY,fallback)
  local left,right=math.floor(cx-width*.12),math.floor(cx+width*.12)
  local top,bottom=math.floor(eyeY-height*.02),math.floor(eyeY+height*.17)
  local function feature(p)
    local r,g,b=pc.rgbaR(p),pc.rgbaG(p),pc.rgbaB(p);local light=(r+g+b)/3
    return pc.rgbaA(p)>0 and (light<105 or (r>150 and r>g*1.25 and r>b*1.15))
  end
  for y=math.max(0,top),math.min(height-1,bottom) do for x=math.max(0,left),math.min(width-1,right) do
    local p=body:getPixel(x,y)
    if feature(p) then
      local replacement=nil
      for radius=unit,12*unit,unit do
        for _,point in ipairs({{x-radius,y},{x+radius,y},{x,y-radius},{x-radius,y-radius},{x+radius,y-radius}}) do
          if point[1]>=0 and point[2]>=0 and point[1]<width and point[2]<height then
            local candidate=body:getPixel(point[1],point[2]);local light=(pc.rgbaR(candidate)+pc.rgbaG(candidate)+pc.rgbaB(candidate))/3
            if pc.rgbaA(candidate)>0 and light>=105 then replacement=candidate;break end
          end
        end
        if replacement then break end
      end
      image:drawPixel(x,y,replacement or fallback)
    end
  end end
end
local function line(image,x1,y1,x2,y2,thickness,color)
  x1=math.floor(x1);y1=math.floor(y1);x2=math.floor(x2);y2=math.floor(y2);thickness=math.max(1,math.floor(thickness))
  local dx=math.abs(x2-x1);local sx=x1<x2 and 1 or -1;local dy=-math.abs(y2-y1);local sy=y1<y2 and 1 or -1;local err=dx+dy
  while true do
    rect(image,x1-math.floor(thickness/2),y1-math.floor(thickness/2),thickness,thickness,color)
    if x1==x2 and y1==y2 then break end
    local e2=2*err;if e2>=dy then err=err+dy;x1=x1+sx end;if e2<=dx then err=err+dx;y1=y1+sy end
  end
end
local ink=rgba(56,48,46,255)
local softInk=rgba(111,100,95,255)
local cream=rgba(241,235,221,255)
local key=rgba(177,169,154,255)
local metal=rgba(113,108,103,255)
local pink=rgba(226,112,130,255)
local skin=rgba(255,203,178,255)
local skinShade=rgba(229,160,139,255)
local bowl=rgba(207,117,103,255)
local food=rgba(117,81,55,255)
local function heart(image,cx,cy,size)
  local s=math.max(1,math.floor(size));rect(image,cx-2*s,cy-s,s*2,s*2,pink);rect(image,cx+s,cy-s,s*2,s*2,pink);rect(image,cx-s,cy,s*3,s*2,pink);rect(image,cx,cy+2*s,s,s,pink)
end
local function keyboard(image,frame)
  local x,y,w,h=math.floor(width*.23),math.floor(height*.79),math.floor(width*.54),math.max(10*unit,math.floor(height*.105))
  rect(image,x-unit,y-unit,w+unit*2,h+unit*2,ink);rect(image,x,y,w,h,cream);rect(image,x+unit,y+h-unit*2,w-unit*2,unit,metal)
  local cols=8;local kw=math.max(unit*3,math.floor((w-unit*3)/cols)-unit)
  for row=0,1 do for col=0,cols-1 do
    local lift=((frame+col)%4==0) and unit or 0
    rect(image,x+unit*2+col*math.floor((w-unit*3)/cols),y+unit*2+row*unit*3-lift,kw,unit*2,key)
  end end
  rect(image,x+math.floor(w*.27),y+unit*8,math.floor(w*.46),unit*2,key)
end
local function pettingHand(image,frame)
  local cx,cy=math.floor(width*(.54+(frame==2 and -.02 or frame==4 and .02 or 0))),math.floor(height*(.12+(frame%2)*.025))
  line(image,cx+10*unit,-unit,cx+4*unit,cy,8*unit,ink);line(image,cx+10*unit,-unit,cx+4*unit,cy,6*unit,skin)
  ellipse(image,cx,cy,12*unit,6*unit,ink);ellipse(image,cx,cy-unit,11*unit,5*unit,skin)
  for finger=-2,2 do line(image,cx+finger*4*unit,cy-2*unit,cx+(finger+1)*4*unit,cy+3*unit,unit,skinShade) end
  heart(image,math.floor(width*.73),math.floor(height*.28),unit);if frame>=3 then heart(image,math.floor(width*.28),math.floor(height*.33),unit) end
end
local function foodBowl(image,frame)
  local x,y,w,h=math.floor(width*.30),math.floor(height*.82),math.floor(width*.40),math.max(8*unit,math.floor(height*.075))
  rect(image,x,y,w,h,ink);rect(image,x+unit,y+unit,w-unit*2,h-unit*2,bowl);rect(image,x-unit*2,y+h-unit,w+unit*4,unit*3,ink);rect(image,x,y+h,w,unit,bowl)
  ellipse(image,math.floor(width*.43),y-unit*2,2*unit,2*unit,food);ellipse(image,math.floor(width*.54),y-unit*(frame%2==0 and 3 or 1),2*unit,2*unit,food)
end
local function bellyPawPads(image,body,frame)
  local bounds=opaqueBounds(body)
  local span=bounds.right-bounds.left+1
  local rise=(frame%2==0 and 0 or unit)
  for _,fraction in ipairs({.27,.42,.62,.77}) do
    local cx=math.floor(bounds.left+span*fraction)
    local cy=math.floor(bounds.top+(bounds.bottom-bounds.top)*.58)-rise
    maskedEllipse(image,body,cx,cy,3*unit,3*unit,pink)
    maskedEllipse(image,body,cx-3*unit,cy-3*unit,unit,unit,pink)
    maskedEllipse(image,body,cx,cy-4*unit,unit,unit,pink)
    maskedEllipse(image,body,cx+3*unit,cy-3*unit,unit,unit,pink)
  end
end
local function motionLines(image,side,level,frame)
  local baseX,dir=side<0 and math.floor(width*.12) or math.floor(width*.88),side<0 and -1 or 1
  local y=math.floor(height*level)
  line(image,baseX,y,baseX+dir*5*unit,y-3*unit,unit,softInk)
  if frame%2==0 then line(image,baseX,y+5*unit,baseX+dir*6*unit,y+6*unit,unit,softInk) end
end
local function sampleFur(image,cx,cy)
  local counts,sums={},{ }
  local radius=math.max(3*unit,8)
  for y=math.max(0,cy-radius),math.min(height-1,cy+radius) do for x=math.max(0,cx-radius),math.min(width-1,cx+radius) do
    local p=image:getPixel(x,y);local a=pc.rgbaA(p);local r,g,b=pc.rgbaR(p),pc.rgbaG(p),pc.rgbaB(p)
    local light=(r+g+b)/3
    if a>0 and light>80 and light<250 then
      local k=math.floor(r/16)..","..math.floor(g/16)..","..math.floor(b/16)
      counts[k]=(counts[k] or 0)+1
      local s=sums[k] or {0,0,0};s[1]=s[1]+r;s[2]=s[2]+g;s[3]=s[3]+b;sums[k]=s
    end
  end end
  local best,bestCount=nil,0;for k,count in pairs(counts) do if count>bestCount then best,bestCount=k,count end end
  if not best then return rgba(222,184,139,255) end
  local s=sums[best];return rgba(math.floor(s[1]/bestCount),math.floor(s[2]/bestCount),math.floor(s[3]/bestCount),255)
end
local function earScratch(image,body,anchors,frame)
  if frame==0 or frame==3 then return end
  local pawX,pawY=math.floor(width*.69),math.floor(height*.36)
  if #anchors>0 then
    local right=anchors[#anchors]
    pawX=right.x+right.width+4*unit
    pawY=right.y+math.floor(right.height*.15)
  end
  pawX=math.max(10*unit,math.min(width-10*unit,pawX+(frame==2 and unit or 0)))
  pawY=math.max(10*unit,math.min(height-14*unit,pawY-(frame==2 and unit or 0)))
  local fur=sampleFur(body,math.floor(width*.58),math.floor(height*.46))
  line(image,pawX-7*unit,pawY+14*unit,pawX-2*unit,pawY+5*unit,7*unit,ink)
  line(image,pawX-7*unit,pawY+14*unit,pawX-2*unit,pawY+5*unit,5*unit,fur)
  ellipse(image,pawX,pawY,7*unit,9*unit,ink)
  ellipse(image,pawX,pawY,6*unit,8*unit,fur)
  ellipse(image,pawX,pawY+2*unit,2*unit,2*unit,pink)
  for offset=-2,2,2 do ellipse(image,pawX+offset*unit,pawY-2*unit,unit,unit,pink) end
end
local function backView(image,body,anchors,frame)
  local cx,eyeY=math.floor(width/2),math.floor(height*.44)
  if #anchors>0 then local total=0;for _,a in ipairs(anchors) do total=total+a.y+a.height/2 end;eyeY=math.floor(total/#anchors) end
  local fur=sampleFur(body,cx,eyeY-math.floor(height*.16))
  -- The body layer is already eyeless. Cover the remaining muzzle marks with
  -- the breed's own cheek color while retaining the head outline and coat.
  local muzzle=sampleFur(body,cx-math.floor(width*.12),eyeY+math.floor(height*.05))
  maskedEllipse(image,body,cx,eyeY+math.floor(height*.045),math.floor(width*.115),math.floor(height*.095),muzzle)
  local tailY,tailX=math.floor(height*(frame%2==0 and .73 or .715)),cx+(frame%2==0 and unit or -unit)
  for _,part in ipairs({{-5,-1,7,6},{0,-4,8,7},{6,0,7,6}}) do ellipse(image,tailX+part[1]*unit,tailY+part[2]*unit,part[3]*unit,part[4]*unit,ink) end
  for _,part in ipairs({{-5,-1,6,5},{0,-4,7,6},{6,0,6,5}}) do ellipse(image,tailX+part[1]*unit,tailY+part[2]*unit,part[3]*unit,part[4]*unit,fur) end
  ellipse(image,tailX-unit*2,tailY-unit*5,2*unit,2*unit,cream)
  motionLines(image,frame%2==0 and -1 or 1,.73,frame)
end
local eyeSprites={}
for n=1,30 do local eye=assert(app.open(eyesDirectory..string.format("/eye-%02d.png",n)));eyeSprites[n]=Image(eye);eye:close() end
local function renderEyes(anchors,style)
  local image=Image(width,height,ColorMode.RGB)
  for side,a in ipairs(anchors) do
    local crop=Image(16,16,ColorMode.RGB)
    for y=0,15 do for x=0,15 do crop:drawPixel(x,y,eyeSprites[style]:getPixel((side-1)*16+x,y)) end end
    assert(a.width%16==0 and a.height%16==0,"Eye anchors must use integer 16px scale")
    for y=0,a.height-1 do for x=0,a.width-1 do
      local p=crop:getPixel(math.floor(x*16/a.width),math.floor(y*16/a.height));if pc.rgbaA(p)>0 then image:drawPixel(a.x+x,a.y+y,p) end
    end end
  end
  return image
end
local function recipe(action,frame)
  local dx,dy,flipX,flipY,scaleX,scaleY=0,0,false,false,1,1
  if action.id=="typing" then dy=(frame%2==0 and -unit or 0)
  elseif action.id=="petting" then dy=({0,-unit,-2*unit,-unit})[frame+1]
  elseif action.id=="eat" then dy=(frame%2==0 and unit or 0)
  elseif action.id=="belly" then dx=({0,unit,-unit,0})[frame+1];dy=({0,-unit,0,-unit})[frame+1]
  elseif action.id=="stretch" then dx=({0,0,-unit,0})[frame+1];dy=({0,unit,2*unit,unit})[frame+1];scaleX=({1,1.04,1.08,1.04})[frame+1];scaleY=({1,.94,.88,.94})[frame+1]
  elseif action.id=="wag" then dy=(frame%2==0 and -unit or 0)
  elseif action.id=="scratch" then dx=({0,unit,-unit,0})[frame+1];dy=({0,-unit,-2*unit,-unit})[frame+1]
  elseif action.id=="walk-right" then flipX=true
  elseif action.id=="walk-up" then dy=(frame%2==0 and -unit or 0)
  elseif action.id=="walk-down" then dy=(frame%2==0 and unit or 0)
  end
  return dx,dy,flipX,flipY,scaleX,scaleY
end
local bodyFrames,propFrames,anchorFrames,actionRows={},{},{},{}
for actionIndex,action in ipairs(contract.actions) do
  local row={id=action.id,name=action.name,description=action.description,frameMs=action.frameMs,frames=4,eyeMode=action.eyeMode,source=action.source,kind=action.kind,eyes={}}
  for frame=0,3 do
    local global=(actionIndex-1)*4+frame+1
    local sourceFrame=starts[action.source]+frame
    local dx,dy,flipX,flipY,scaleX,scaleY=recipe(action,frame)
    local sourceBody=fullCel(source.layers[1],sourceFrame)
    local bellyBounds=nil
    local body=nil
    if action.id=="belly" then
      bellyBounds=opaqueBounds(sourceBody)
      body=rotate180InBounds(sourceBody,bellyBounds,dx,dy)
    else
      body=transformImage(sourceBody,dx,dy,flipX,flipY,scaleX,scaleY)
    end
    local sourceAnchors=proof.scenes[action.source].eyes[frame+1]
    local anchors=copyAnchors(sourceAnchors,dx,dy,flipX,flipY,scaleX,scaleY)
    local props=Image(width,height,ColorMode.RGB)
    if action.id=="typing" then keyboard(props,frame)
    elseif action.id=="petting" then pettingHand(props,frame)
    elseif action.id=="eat" then foodBowl(props,frame)
    elseif action.id=="belly" then props:drawImage(rotate180InBounds(renderEyes(sourceAnchors,10),bellyBounds,dx,dy),Point(0,0));bellyPawPads(props,body,frame);motionLines(props,frame%2==0 and -1 or 1,.72,frame)
    elseif action.id=="stretch" then motionLines(props,-1,.72,frame)
    elseif action.id=="wag" then motionLines(props,frame%2==0 and -1 or 1,.62,frame)
    elseif action.id=="scratch" then earScratch(props,body,anchors,frame);motionLines(props,1,.37,frame)
    elseif action.id=="walk-up" then backView(props,body,anchors,frame)
    elseif action.id=="walk-down" then motionLines(props,frame%2==0 and -1 or 1,.83,frame)
    end
    if action.eyeMode=="hidden" or action.eyeMode=="baked" then anchors={} end
    bodyFrames[global]=body;propFrames[global]=props;anchorFrames[global]=anchors;row.eyes[#row.eyes+1]=anchors
  end
  if legacy[action.id] then row.png=proof.scenes[action.id].png else row.png="/images/ruby-round-v1/"..id.."/actions/"..action.id..".png" end
  actionRows[action.id]=row
end
source:close()

local sprite=Sprite(width,height,ColorMode.RGB)
local bodyLayer=sprite.layers[1];bodyLayer.name="Body - Ruby Round reviewed artwork"
local propsLayer=sprite:newLayer();propsLayer.name="Action props and motion marks"
local eyeLayers={}
for style=1,30 do local layer=sprite:newLayer();layer.name=string.format("Eyes - ruby-eye-%02d",style);layer.isVisible=style==1;eyeLayers[style]=layer end
for frame=1,64 do
  if frame>1 then sprite:newEmptyFrame() end
  sprite:newCel(bodyLayer,frame,bodyFrames[frame],Point(0,0));sprite:newCel(propsLayer,frame,propFrames[frame],Point(0,0))
  local action=contract.actions[math.floor((frame-1)/4)+1]
  for style=1,30 do
    local eyeImage=Image(width,height,ColorMode.RGB)
    if action.eyeMode=="shared" then eyeImage=renderEyes(anchorFrames[frame],style)
    elseif action.eyeMode=="closed" then eyeImage=renderEyes(anchorFrames[frame],10) end
    sprite:newCel(eyeLayers[style],frame,eyeImage,Point(0,0))
  end
  sprite.frames[frame].duration=action.frameMs/1000
end
for index,action in ipairs(contract.actions) do local tag=sprite:newTag((index-1)*4+1,index*4);tag.name=action.id end
local master=output.."/"..id.."-16-actions.aseprite"
sprite:saveAs(master);sprite:close()
for _,action in ipairs(contract.actions) do if not legacy[action.id] then
  local sheet=Image(width*4,height,ColorMode.RGB)
  local actionIndex=0;for index,candidate in ipairs(contract.actions) do if candidate.id==action.id then actionIndex=index;break end end
  for frame=1,4 do local global=(actionIndex-1)*4+frame;sheet:drawImage(bodyFrames[global],Point((frame-1)*width,0));sheet:drawImage(propFrames[global],Point((frame-1)*width,0)) end
  local exported=Sprite(width*4,height,ColorMode.RGB);exported:newCel(exported.layers[1],1,sheet,Point(0,0));exported:saveCopyAs(output.."/"..action.id..".png");exported:close()
end end
local reopened=assert(app.open(master));assert(#reopened.frames==64 and #reopened.tags==16 and #reopened.layers==32,"Extended master lost frames, tags or layers")
for index,action in ipairs(contract.actions) do assert(reopened.tags[index].name==action.id,"Extended master tag order changed") end
local legacySource=assert(app.open(input),"Could not reopen legacy master for byte-level artwork verification")
for frame=1,20 do
  local original=fullCel(legacySource.layers[1],frame)
  local restored=fullCel(reopened.layers[1],frame)
  for y=0,height-1 do for x=0,width-1 do assert(original:getPixel(x,y)==restored:getPixel(x,y),"Legacy body pixels changed at frame "..frame) end end
end
legacySource:close()
reopened:close()
local report={breed=id,style="ruby-round-scenes",version=2,pipelineRevision=1,width=width,height=height,frames=64,framesPerAction=4,eyeStyles=30,actions=actionRows,actionOrder={},aseprite="/downloads/ruby-round-v1/"..id.."-16-actions.aseprite",sourceAseprite="/downloads/ruby-round-v1/"..id..".aseprite",resized=false,quantized=false,integerMotionOnly=true,legacyFramesPreserved=true,editableLayers=32}
for _,action in ipairs(contract.actions) do report.actionOrder[#report.actionOrder+1]=action.id end
local file=assert(io.open(output.."/motion-conversion.json","w"));file:write(json.encode(report));file:close()
print(json.encode({breed=id,actions=16,frames=64,layers=32,width=width,height=height}))
