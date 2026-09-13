-- Split AI-drawn scenes at their original resolution. Every pose and gait frame
-- must already exist in the source atlas; this script never fabricates motion.
local input = assert(app.params.input, "input is required")
local output = assert(app.params.output, "output is required")
local id = assert(app.params.id, "breed id is required")
local style = assert(app.params.style, "style is required")
assert(style == "sp08" or style == "sp15", "Unsupported style")
local background = app.params.background or "transparent"
local cleanup = background ~= "transparent"
local source = assert(app.open(input), "Unable to open the generated atlas")
assert(#source.frames == 1 and source.colorMode == ColorMode.RGB, "Expected one full-color source atlas")
local original = Image(source)
local previousRegistration=nil
if app.params.registration and app.params.registration~="" then
  local registrationFile=assert(io.open(app.params.registration,"r"),"Unable to read preserved registration")
  previousRegistration=json.decode(registrationFile:read("*all"));registrationFile:close()
  assert(previousRegistration.style==style and previousRegistration.breed==id,"Registration belongs to a different source")
end
local columns, rows = 4, 4
local function isBackground(pixel)
  local r,g,b,a = app.pixelColor.rgbaR(pixel),app.pixelColor.rgbaG(pixel),app.pixelColor.rgbaB(pixel),app.pixelColor.rgbaA(pixel)
  return a == 0 or (background == "border-magenta" and r >= 180 and b >= 180 and g <= 100 and r-g >= 100 and b-g >= 100)
    or (background == "border-white" and math.min(r,g,b) >= 245 and math.max(r,g,b)-math.min(r,g,b) <= 8)
end
local function gutterCuts(length,count,vertical,fromOther,toOther)
  local cuts = {0}
  local breadth = vertical and source.height or source.width
  for division = 1,count-1 do
    local ideal = math.floor(division*length/count)
    local radius = math.floor(length/count*0.15)
    local runStart, bestStart, bestLength = nil, nil, 0
    for coordinate = ideal-radius,ideal+radius do
      local clear = true
      for other = fromOther or 0,(toOther or breadth)-1 do
        local pixel = vertical and original:getPixel(coordinate,other) or original:getPixel(other,coordinate)
        if not isBackground(pixel) then clear=false;break end
      end
      if clear then
        if runStart == nil then runStart=coordinate end
        local runLength=coordinate-runStart+1
        if runLength > bestLength then bestStart=runStart;bestLength=runLength end
      else runStart=nil end
    end
    assert(bestStart and bestLength >= 2,"No clear gutter between generated poses near division "..division)
    cuts[#cuts+1]=bestStart+math.floor(bestLength/2)
  end
  cuts[#cuts+1]=length
  return cuts
end
local yCuts = gutterCuts(source.height,rows,false)
local xCutsByRow = {}
local width,height=0,0
for row=1,rows do
  xCutsByRow[row]=gutterCuts(source.width,columns,true,yCuts[row],yCuts[row+1])
  for index=1,columns do width=math.max(width,xCutsByRow[row][index+1]-xCutsByRow[row][index]) end
  height=math.max(height,yCuts[row+1]-yCuts[row])
end
assert(width >= 192 and height >= 192, "Scene cells must retain at least 192 pixels in each dimension")
if previousRegistration then assert(previousRegistration.width==width and previousRegistration.height==height,"Preserved registration canvas changed") end
local names = {"idle", "side", "happy", "sleep", "walk", "walk", "walk", "walk", "walk", "walk", "walk", "walk", "wag", "wag", "wag", "wag"}
local durations = {600, 600, 600, 1000, 125, 125, 125, 125, 125, 125, 125, 125, 150, 150, 150, 150}
local frames, rectangles, removed, eyeDetection = {}, {}, 0, {}

local function removeBorderBackground(image)
  local seen, queue = {}, {}
  local function consider(x, y)
    if x < 0 or y < 0 or x >= image.width or y >= image.height then return end
    local index = y * image.width + x + 1
    if seen[index] then return end
    seen[index] = true
    local pixel = image:getPixel(x, y)
    if isBackground(pixel) then queue[#queue + 1] = index end
  end
  for x = 0, image.width - 1 do consider(x, 0); consider(x, image.height - 1) end
  for y = 1, image.height - 2 do consider(0, y); consider(image.width - 1, y) end
  local head, count = 1, 0
  while head <= #queue do
    local index = queue[head] - 1; head = head + 1
    local x, y = index % image.width, math.floor(index / image.width)
    if app.pixelColor.rgbaA(image:getPixel(x, y)) > 0 then count = count + 1 end
    image:drawPixel(x, y, 0)
    consider(x - 1, y); consider(x + 1, y); consider(x, y - 1); consider(x, y + 1)
  end
  -- The generator uses this explicit key color only for the background. Also
  -- remove enclosed key holes between legs/inside curled tails; white fur and
  -- the muted purple/brown artwork outline are outside this strict predicate.
  if background == "border-magenta" then
    for y=0,image.height-1 do for x=0,image.width-1 do
      local pixel=image:getPixel(x,y)
      if app.pixelColor.rgbaA(pixel)>0 and isBackground(pixel) then image:drawPixel(x,y,0);count=count+1 end
    end end
  end
  return count
end

local function visibleEqual(a, b)
  return a == b or (app.pixelColor.rgbaA(a) == 0 and app.pixelColor.rgbaA(b) == 0)
end

-- Read native dark-bean components for registration diagnostics. This does not
-- draw or replace eyes. Ambiguous/connected dark fur falls back to grid origin.
local function findEyePair(image)
  local visited, candidates = {}, {}
  local function dark(x,y)
    if x<0 or y<0 or x>=width or y>=height then return false end
    local p=image:getPixel(x,y)
    return app.pixelColor.rgbaA(p)>=200 and app.pixelColor.rgbaR(p)<50 and app.pixelColor.rgbaG(p)<50 and app.pixelColor.rgbaB(p)<55
  end
  for sy=math.floor(height*.15),math.floor(height*.72) do for sx=math.floor(width*.08),math.floor(width*.92) do
    local key=sy*width+sx+1
    if not visited[key] and dark(sx,sy) then
      local queue,head={key},1;visited[key]=true
      local left,top,right,bottom,area=sx,sy,sx,sy,0
      while head<=#queue do
        local point=queue[head]-1;head=head+1
        local x,y=point%width,math.floor(point/width)
        area=area+1;left=math.min(left,x);top=math.min(top,y);right=math.max(right,x);bottom=math.max(bottom,y)
        for _,delta in ipairs({{-1,0},{1,0},{0,-1},{0,1}}) do
          local xx,yy=x+delta[1],y+delta[2];local nextKey=yy*width+xx+1
          if xx>=0 and yy>=0 and xx<width and yy<height and not visited[nextKey] and dark(xx,yy) then visited[nextKey]=true;queue[#queue+1]=nextKey end
        end
      end
      local w,h=right-left+1,bottom-top+1
      if area>=math.max(8,width*height*.0006) and area<=width*height*.012 and area/(w*h)>=.4 and w/h<=1.25 and h/w<=2.5 and w>=math.max(3,width*.016) and h>=math.max(4,height*.035) and w<=width*.1 and h<=height*.11 and top>=height*.2 and bottom<=height*.72 then
        candidates[#candidates+1]={x=left,y=top,width=w,height=h,area=area,cx=(left+right)/2,cy=(top+bottom)/2}
      end
    end
  end end
  local best,bestScore=nil,1e20
  for first=1,#candidates-1 do for second=first+1,#candidates do
    local a,b=candidates[first],candidates[second]
    local distance=math.abs(a.cx-b.cx);local dy=math.abs(a.cy-b.cy)
    if distance>=width*.1 and distance<=width*.38 and dy<=math.max(8,height*.07) and math.min(a.area,b.area)/math.max(a.area,b.area)>=.4 then
      local center=(a.cx+b.cx)/2
      if math.abs(center-width*.5)<=width*.22 then
        local score=dy*5+math.abs(a.area-b.area)*.1+math.abs(center-width*.5)+(a.cy+b.cy)*.05-math.min(a.area,b.area)*.15
        if score<bestScore then best={a,b};bestScore=score end
      end
    end
  end end
  if best then
    if best[1].cx>best[2].cx then best[1],best[2]=best[2],best[1] end
    local eyes={}
    for _,c in ipairs(best) do eyes[#eyes+1]={x=math.floor(c.cx+.5),y=math.floor(c.cy+.5),rx=math.ceil(c.width/2)+3,ry=math.ceil(c.height/2)+3} end
    return {candidates=candidates,eyes=eyes}
  end
  return {candidates=candidates}
end

for index = 1, 16 do
  local col, row = (index - 1) % columns, math.floor((index - 1) / columns)
  local xCuts=xCutsByRow[row+1]
  local x,y = xCuts[col+1],yCuts[row+1]
  local right,bottom = xCuts[col+2],yCuts[row+2]
  local cell = Image(width, height, ColorMode.RGB)
  -- Clear gutters protect fur that crosses a nominal grid division. Unequal
  -- cells receive transparent padding; no source pixels are resampled/discarded.
  for yy = 0, bottom - y - 1 do for xx = 0, right - x - 1 do cell:drawPixel(xx, yy, original:getPixel(x + xx, y + yy)) end end
  local cleaned = cleanup and removeBorderBackground(cell) or 0
  removed = removed + cleaned
  local visible, transparent, left, top, rr, bb, edge = 0, 0, width, height, -1, -1, 0
  for yy = 0, height - 1 do for xx = 0, width - 1 do
    local pixel = cell:getPixel(xx, yy)
    if app.pixelColor.rgbaA(pixel) > 0 then
      visible = visible + 1; left = math.min(left, xx); top = math.min(top, yy); rr = math.max(rr, xx); bb = math.max(bb, yy)
      if xx == 0 or yy == 0 or xx == width - 1 or yy == height - 1 then edge = edge + 1 end
      assert(visibleEqual(pixel, original:getPixel(x + xx, y + yy)), "Artwork RGBA changed while importing")
    else transparent = transparent + 1 end
  end end
  assert(visible > 1000, "Empty or incomplete source cell: " .. index)
  assert(transparent > width * height * 0.05, "Atlas needs a transparent background; cell " .. index)
  assert(edge == 0, "Artwork touches a cell boundary; inspect source alignment for cell " .. index)
  local detection=findEyePair(cell)
  -- Lossless registration corrects source-atlas placement differences. It does
  -- not create a pose: each gait frame has distinct independently drawn limbs.
  local dx = math.floor((width - (rr-left+1)) / 2) - left
  local dy = height - 1 - math.max(8, math.floor(height * 0.04)) - bb
  -- Tail-wag cells retain the same nominal grid origin. Independently
  -- centering the complete silhouette would move the body as its tail moves.
  if index >= 13 then
    dx = math.floor(width / 2 - original.width / 8 + x - col * original.width / 4)
    if index > 13 then dy = rectangles[13].translation.y end
    if index>13 and detection.eyes and eyeDetection[13].eyes then
      local originalEyes=eyeDetection[13].eyes
      dx=math.floor((originalEyes[1].x+originalEyes[2].x-detection.eyes[1].x-detection.eyes[2].x)/2+.5)
      dy=math.floor((originalEyes[1].y+originalEyes[2].y-detection.eyes[1].y-detection.eyes[2].y)/2+.5)
    end
    -- A long moving tail may cross the nominal cell center. Clamp only the
    -- translation at the transparent canvas margin, never clip its pixels.
    dx = math.max(1-left, math.min(dx, width-2-rr))
    dy = math.max(1-top, math.min(dy, height-2-bb))
  end
  if previousRegistration then
    local previousRect=previousRegistration.cellRectangles[index]
    assert(previousRect.x==x and previousRect.y==y and previousRect.width==right-x and previousRect.height==bottom-y,"Preserved source grid changed")
    dx,dy=previousRect.translation.x,previousRect.translation.y
  end
  assert(left+dx >= 0 and rr+dx < width and top+dy >= 0 and bb+dy < height, "Ground alignment would clip source artwork at frame " .. index)
  local aligned = Image(width, height, ColorMode.RGB)
  aligned:drawImage(cell, Point(dx, dy))
  for yy = top, bb do for xx = left, rr do
    assert(visibleEqual(cell:getPixel(xx, yy), aligned:getPixel(xx+dx, yy+dy)), "Ground alignment changed artwork RGBA")
  end end
  frames[index] = aligned
  for _,candidate in ipairs(detection.candidates) do candidate.x=candidate.x+dx;candidate.y=candidate.y+dy;candidate.cx=candidate.cx+dx;candidate.cy=candidate.cy+dy end
  if detection.eyes then for _,eye in ipairs(detection.eyes) do eye.x=eye.x+dx;eye.y=eye.y+dy end end
  if previousRegistration then
    -- json.decode returns wrapped objects; copy native numbers into plain Lua
    -- tables so nested diagnostics serialize as objects instead of null.
    local previousDetection=previousRegistration.eyeDetection[index]
    local preserved={candidates={}}
    for _,candidate in ipairs(previousDetection.candidates) do
      preserved.candidates[#preserved.candidates+1]={area=candidate.area,cx=candidate.cx,cy=candidate.cy,height=candidate.height,width=candidate.width,x=candidate.x,y=candidate.y}
    end
    if previousDetection.eyes then
      preserved.eyes={}
      for _,eye in ipairs(previousDetection.eyes) do preserved.eyes[#preserved.eyes+1]={x=eye.x,y=eye.y,rx=eye.rx,ry=eye.ry} end
    end
    eyeDetection[index]=preserved
  else
    eyeDetection[index]=detection
  end
  rectangles[index] = {index=index, scene=names[index], x=x, y=y, width=right-x, height=bottom-y,
    retainedVisiblePixels=visible, transparentPixels=transparent, removedBorderPixels=cleaned,
    sourceBounds={left=left, top=top, width=rr-left+1, height=bb-top+1},
    translation={x=dx,y=dy}, bounds={left=left+dx, top=top+dy, width=rr-left+1, height=bb-top+1}}
end
source:close()

-- Register all four wag frames together. The common eye center is chosen from
-- the intersection of every frame's available transparent margins so a wider
-- tail cannot force just one body to jump sideways. Only integer translation
-- is applied; every source pixel and independently drawn tail is preserved.
local wagRegisteredByEyes=previousRegistration and previousRegistration.wagRegisteredByEyes or false
local minX,maxX,minY,maxY=-1e20,1e20,-1e20,1e20
local centers,canRegister={},true
for index=13,16 do
  local eyes=eyeDetection[index].eyes
  if not eyes then canRegister=false;break end
  local cx=math.floor((eyes[1].x+eyes[2].x)/2+.5)
  local cy=math.floor((eyes[1].y+eyes[2].y)/2+.5)
  local b=rectangles[index].bounds
  centers[index]={x=cx,y=cy}
  minX=math.max(minX,cx+1-b.left);maxX=math.min(maxX,cx+width-1-b.left-b.width)
  minY=math.max(minY,cy+1-b.top);maxY=math.min(maxY,cy+height-1-b.top-b.height)
end
if not previousRegistration and canRegister and minX<=maxX and minY<=maxY then
  local targetX=math.max(minX,math.min(centers[13].x,maxX))
  local targetY=math.max(minY,math.min(centers[13].y,maxY))
  for index=13,16 do
    local dx,dy=targetX-centers[index].x,targetY-centers[index].y
    local aligned=Image(width,height,ColorMode.RGB)
    aligned:drawImage(frames[index],Point(dx,dy))
    local b=rectangles[index].bounds
    for y=b.top,b.top+b.height-1 do for x=b.left,b.left+b.width-1 do
      assert(visibleEqual(frames[index]:getPixel(x,y),aligned:getPixel(x+dx,y+dy)),"Wag registration changed artwork RGBA")
    end end
    frames[index]=aligned
    rectangles[index].translation.x=rectangles[index].translation.x+dx;rectangles[index].translation.y=rectangles[index].translation.y+dy
    b.left=b.left+dx;b.top=b.top+dy
    for _,c in ipairs(eyeDetection[index].candidates) do c.x=c.x+dx;c.y=c.y+dy;c.cx=c.cx+dx;c.cy=c.cy+dy end
    for _,eye in ipairs(eyeDetection[index].eyes) do eye.x=eye.x+dx;eye.y=eye.y+dy end
  end
  wagRegisteredByEyes=true
end

-- The generated magenta background can leave a darker, one-pixel antialias
-- fringe around the intended plum outline. Remove only saturated key pixels
-- reachable from the outside transparent canvas. An opaque outline protects
-- intentional interior pink accents, cheeks, tongues, and lavender shading.
-- This runs AFTER registration so every retained native pixel stays in place.
local function isOuterMagenta(pixel)
  local r,g,b,a=app.pixelColor.rgbaR(pixel),app.pixelColor.rgbaG(pixel),app.pixelColor.rgbaB(pixel),app.pixelColor.rgbaA(pixel)
  return a>0 and r>=120 and b>=120 and g<=80 and r-g>=90 and b-g>=90
end
local removedOuterMagentaPixels=0
for index=1,16 do
  local image=frames[index]
  local seen,queue,removedMask={}, {}, {}
  local function consider(x,y)
    if x<0 or y<0 or x>=width or y>=height then return end
    local key=y*width+x+1
    if seen[key] then return end
    seen[key]=true
    local pixel=image:getPixel(x,y)
    if app.pixelColor.rgbaA(pixel)==0 or (background=="border-magenta" and isOuterMagenta(pixel)) then queue[#queue+1]=key end
  end
  for x=0,width-1 do consider(x,0);consider(x,height-1) end
  for y=1,height-2 do consider(0,y);consider(width-1,y) end
  local head,count=1,0
  while head<=#queue do
    local key=queue[head];local point=key-1;head=head+1
    local x,y=point%width,math.floor(point/width)
    if isOuterMagenta(image:getPixel(x,y)) then removedMask[key]=true;count=count+1 end
    consider(x-1,y);consider(x+1,y);consider(x,y-1);consider(x,y+1)
  end
  local runs={}
  for y=0,height-1 do
    local start=nil
    for x=0,width do
      local removed=x<width and removedMask[y*width+x+1]
      if removed then
        if start==nil then start=x end
        image:drawPixel(x,y,0)
      elseif start~=nil then runs[#runs+1]={x=start,y=y,length=x-start};start=nil end
    end
  end
  local rect=rectangles[index]
  rect.originalRetainedVisiblePixels=rect.retainedVisiblePixels
  rect.retainedVisiblePixels=rect.retainedVisiblePixels-count
  rect.removedOuterMagentaPixels=count
  rect.outerMagentaRemovedRuns=runs
  rect.boundsBeforeOuterMagentaCleanup={left=rect.bounds.left,top=rect.bounds.top,width=rect.bounds.width,height=rect.bounds.height}
  local left,top,right,bottom=width,height,-1,-1
  for y=0,height-1 do for x=0,width-1 do if app.pixelColor.rgbaA(image:getPixel(x,y))>0 then
    left=math.min(left,x);top=math.min(top,y);right=math.max(right,x);bottom=math.max(bottom,y)
  end end end
  rect.bounds={left=left,top=top,width=right-left+1,height=bottom-top+1}
  removedOuterMagentaPixels=removedOuterMagentaPixels+count
end

-- A walking strip made from one copied or translated standing pose is invalid.
for first = 5, 11 do for second = first+1, 12 do
  local differs = false
  for y = 0, height - 1 do
    for x = 0, width - 1 do if not visibleEqual(frames[first]:getPixel(x,y),frames[second]:getPixel(x,y)) then differs=true;break end end
    if differs then break end
  end
  assert(differs, "Walking source contains duplicate registered frames")
end end

for first = 13, 15 do for second = first+1, 16 do
  local differs = false
  for y = 0, height - 1 do
    for x = 0, width - 1 do if not visibleEqual(frames[first]:getPixel(x,y),frames[second]:getPixel(x,y)) then differs=true;break end end
    if differs then break end
  end
  assert(differs, "Tail-wag source contains duplicate registered frames")
end end

local sprite = Sprite(width, height, ColorMode.RGB)
sprite.layers[1].name = "Original drawn poses, gait and tail-wag frames"
for index = 1, 16 do
  if index > 1 then sprite:newEmptyFrame() end
  sprite:newCel(sprite.layers[1], index, frames[index], Point(0, 0))
  sprite.frames[index].duration = durations[index] / 1000
end
for index = 1, 4 do local tag = sprite:newTag(index, index); tag.name = names[index] end
local walk = sprite:newTag(5, 12); walk.name = "walk"; walk.aniDir = AniDir.FORWARD
local wag = sprite:newTag(13, 16); wag.name = "wag"; wag.aniDir = AniDir.FORWARD
sprite:saveAs(output .. "/" .. id .. ".aseprite")

local sceneSpecs = {{"idle",1,1}, {"side",2,2}, {"walk",5,12}, {"happy",3,3}, {"sleep",4,4}, {"wag",13,16}}
local scenes, frameBounds = {}, {}
for _, spec in ipairs(sceneSpecs) do
  local name, first, last = spec[1], spec[2], spec[3]
  local count = last - first + 1
  local sheet = Image(width * count, height, ColorMode.RGB)
  for frame = first, last do sheet:drawImage(frames[frame], Point((frame - first) * width, 0)) end
  local export = Sprite(sheet.width, sheet.height, ColorMode.RGB)
  export:newCel(export.layers[1], 1, sheet, Point(0, 0))
  local file = output .. "/" .. name .. ".png"
  export:saveCopyAs(file); export:close()
  local check = assert(app.open(file), "Export could not be reopened")
  local pixels = Image(check)
  assert(pixels.width == width * count and pixels.height == height, "Export changed dimensions")
  for frame = first, last do for y = 0, height - 1 do for x = 0, width - 1 do
    assert(visibleEqual(frames[frame]:getPixel(x, y), pixels:getPixel((frame-first)*width+x, y)), "Export changed source RGBA")
  end end end
  check:close()
  scenes[name] = {png="/images/sp-scenes-v1/" .. style .. "/" .. id .. "/" .. name .. ".png", frames=count, frameMs=durations[first]}
  frameBounds[name] = {}
  for frame=first,last do local b=rectangles[frame].bounds; frameBounds[name][#frameBounds[name]+1]={x=b.left,y=b.top,width=b.width,height=b.height} end
end
sprite:close()

local reopened = assert(app.open(output .. "/" .. id .. ".aseprite"), "Editable master could not be reopened")
assert(#reopened.frames == 16 and #reopened.tags == 6 and reopened.width == width and reopened.height == height, "Editable master lost frames or tags")
local foundTags = {}
for _, tag in ipairs(reopened.tags) do foundTags[tag.name] = {first=tag.fromFrame.frameNumber,last=tag.toFrame.frameNumber} end
for _, spec in ipairs(sceneSpecs) do
  local tag = assert(foundTags[spec[1]], "Missing editable scene tag")
  assert(tag.first == spec[2] and tag.last == spec[3], "Editable scene tag range changed")
end
for index = 1, 16 do
  local cel = assert(reopened.layers[1]:cel(index), "Missing editable artwork cel")
  local restored = Image(width, height, ColorMode.RGB)
  restored:drawImage(cel.image,cel.position)
  for y = 0, height - 1 do for x = 0, width - 1 do
    assert(visibleEqual(frames[index]:getPixel(x,y),restored:getPixel(x,y)), "Editable master changed source RGBA")
  end end
end
reopened:close()

local report = {style=style, breed=id, width=width, height=height, frames=16, colorDepth=32,
  aseprite="/downloads/sp-scenes-v1/" .. style .. "/" .. id .. ".aseprite", scenes=scenes, frameBounds=frameBounds,
  cellRectangles=rectangles, eyeDetection=eyeDetection, gridBoundaries={xByRow=xCutsByRow,y=yCuts},originalWidth=original.width, originalHeight=original.height,
  resized=false, quantized=false, recolored=false, fabricatedFrames=false,
  exactVisibleRgba=true, editableRgbaVerified=true, removedBorderBackgroundPixels=removed, groundAligned=true, uniqueWalkFrames=8, uniqueWagFrames=4, wagRegisteredByEyes=wagRegisteredByEyes,
  backgroundMode=background, removedOuterMagentaPixels=removedOuterMagentaPixels, previousRegistrationPreserved=previousRegistration~=nil,
  outerMagentaCleanup={method="exterior-connected-saturated-magenta",rMin=120,bMin=120,gMax=80,differenceMin=90,afterRegistration=true},
  backgroundCleanup=background == "border-magenta" and "Explicit magenta key including enclosed gaps: R/B >= 180, G <= 100, R-G/B-G >= 100; all non-key RGBA unchanged" or (cleanup and "Border-connected neutral white only: min RGB 245, channel spread <= 8" or "None")}
local manifest = assert(io.open(output .. "/conversion.json", "w"))
manifest:write(json.encode(report)); manifest:close()
print(json.encode({success=true, breed=id, width=width, height=height, scenes=6, frames=16, exactVisibleRgba=true}))
