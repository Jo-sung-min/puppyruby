-- Split AI-drawn scenes at their original resolution. Every pose and gait frame
-- must already exist in the source atlas; this script never fabricates motion.
local input = assert(app.params.input, "input is required")
local output = assert(app.params.output, "output is required")
local id = assert(app.params.id, "breed id is required")
local background = app.params.background or "transparent"
local cleanup = background ~= "transparent"
local source = assert(app.open(input), "Unable to open the generated atlas")
assert(#source.frames == 1 and source.colorMode == ColorMode.RGB, "Expected one full-color source atlas")
local original = Image(source)
local columns, rows = 4, 3
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
assert(width >= 256 and height >= 256, "Scene cells must retain at least 256 pixels in each dimension")
local names = {"idle", "side", "happy", "sleep", "walk", "walk", "walk", "walk", "walk", "walk", "walk", "walk"}
local durations = {600, 600, 600, 1000, 125, 125, 125, 125, 125, 125, 125, 125}
local frames, rectangles, removed = {}, {}, 0

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

for index = 1, 12 do
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
  -- Lossless registration corrects source-atlas placement differences. It does
  -- not create a pose: each gait frame has distinct independently drawn limbs.
  local dx = math.floor((width - (rr-left+1)) / 2) - left
  local dy = height - 1 - math.max(8, math.floor(height * 0.04)) - bb
  assert(left+dx >= 0 and rr+dx < width and top+dy >= 0 and bb+dy < height, "Ground alignment would clip source artwork")
  local aligned = Image(width, height, ColorMode.RGB)
  aligned:drawImage(cell, Point(dx, dy))
  for yy = top, bb do for xx = left, rr do
    assert(visibleEqual(cell:getPixel(xx, yy), aligned:getPixel(xx+dx, yy+dy)), "Ground alignment changed artwork RGBA")
  end end
  frames[index] = aligned
  rectangles[index] = {index=index, scene=names[index], x=x, y=y, width=right-x, height=bottom-y,
    retainedVisiblePixels=visible, transparentPixels=transparent, removedBorderPixels=cleaned,
    sourceBounds={left=left, top=top, width=rr-left+1, height=bb-top+1},
    translation={x=dx,y=dy}, bounds={left=left+dx, top=top+dy, width=rr-left+1, height=bb-top+1}}
end
source:close()

-- A walking strip made from one copied or translated standing pose is invalid.
for first = 5, 11 do for second = first+1, 12 do
  local differs = false
  for y = 0, height - 1 do
    for x = 0, width - 1 do if not visibleEqual(frames[first]:getPixel(x,y),frames[second]:getPixel(x,y)) then differs=true;break end end
    if differs then break end
  end
  assert(differs, "Walking source contains duplicate registered frames")
end end

local sprite = Sprite(width, height, ColorMode.RGB)
sprite.layers[1].name = "Original drawn poses and gait frames"
for index = 1, 12 do
  if index > 1 then sprite:newEmptyFrame() end
  sprite:newCel(sprite.layers[1], index, frames[index], Point(0, 0))
  sprite.frames[index].duration = durations[index] / 1000
end
for index = 1, 4 do local tag = sprite:newTag(index, index); tag.name = names[index] end
local walk = sprite:newTag(5, 12); walk.name = "walk"; walk.aniDir = AniDir.FORWARD
sprite:saveAs(output .. "/" .. id .. ".aseprite")

local sceneSpecs = {{"idle",1,1}, {"side",2,2}, {"walk",5,12}, {"happy",3,3}, {"sleep",4,4}}
local scenes = {}
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
  scenes[name] = {png="/images/art16-scenes-v1/" .. id .. "/" .. name .. ".png", frames=count, frameMs=durations[first]}
end
sprite:close()

local reopened = assert(app.open(output .. "/" .. id .. ".aseprite"), "Editable master could not be reopened")
assert(#reopened.frames == 12 and #reopened.tags == 5 and reopened.width == width and reopened.height == height, "Editable master lost frames or tags")
local foundTags = {}
for _, tag in ipairs(reopened.tags) do foundTags[tag.name] = {first=tag.fromFrame.frameNumber,last=tag.toFrame.frameNumber} end
for _, spec in ipairs(sceneSpecs) do
  local tag = assert(foundTags[spec[1]], "Missing editable scene tag")
  assert(tag.first == spec[2] and tag.last == spec[3], "Editable scene tag range changed")
end
for index = 1, 12 do
  local cel = assert(reopened.layers[1]:cel(index), "Missing editable artwork cel")
  local restored = Image(width, height, ColorMode.RGB)
  restored:drawImage(cel.image,cel.position)
  for y = 0, height - 1 do for x = 0, width - 1 do
    assert(visibleEqual(frames[index]:getPixel(x,y),restored:getPixel(x,y)), "Editable master changed source RGBA")
  end end
end
reopened:close()

local report = {breed=id, width=width, height=height, frames=12, colorDepth=32,
  aseprite="/downloads/art16-scenes-v1/" .. id .. ".aseprite", scenes=scenes,
  cellRectangles=rectangles, gridBoundaries={xByRow=xCutsByRow,y=yCuts},originalWidth=original.width, originalHeight=original.height,
  resized=false, quantized=false, recolored=false, fabricatedFrames=false,
  exactVisibleRgba=true, editableRgbaVerified=true, removedBorderBackgroundPixels=removed, groundAligned=true, uniqueWalkFrames=8,
  backgroundMode=background,
  backgroundCleanup=background == "border-magenta" and "Explicit magenta key including enclosed gaps: R/B >= 180, G <= 100, R-G/B-G >= 100; all non-key RGBA unchanged" or (cleanup and "Border-connected neutral white only: min RGB 245, channel spread <= 8" or "None")}
local manifest = assert(io.open(output .. "/conversion.json", "w"))
manifest:write(json.encode(report)); manifest:close()
print(json.encode({success=true, breed=id, width=width, height=height, scenes=5, frames=12, exactVisibleRgba=true}))
