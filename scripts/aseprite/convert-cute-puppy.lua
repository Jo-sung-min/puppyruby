-- Process an image-generation original in the paid Aseprite application.
-- The compact renderer data below is read from the resulting indexed sprite.
local input = assert(app.params.input, "input is required")
local output = assert(app.params.output, "output is required")
local id = assert(app.params.id, "id is required")
local removeNeutral = app.params.removeNeutral == "true"
local size, colors = 64, 12
local source = assert(app.open(input), "could not open generated PNG")
assert(#source.frames == 1, "only one-frame originals are accepted")
local originalWidth, originalHeight = source.width, source.height
app.activeSprite = source
app.command.ChangePixelFormat { ui=false, format="rgb" }
source:flatten()
if source.layers[1].isBackground then app.command.LayerFromBackground { ui=false } end
-- Some generation outputs bake a gray checkerboard into opaque PNG pixels.
-- Explicit opt-in removes only neutral bright pixels connected to the border;
-- enclosed cream/white markings and eye highlights remain protected.
local removedBackground = 0
if removeNeutral then
  assert(#source.cels == 1, "background removal expects one flattened cel")
  local cel=source.cels[1]
  local image=Image(cel.image)
  local canvasWidth,canvasHeight=source.width,source.height
  assert(cel.position.x == 0 and cel.position.y == 0 and image.width == canvasWidth and image.height == canvasHeight, "background cleanup expects full canvas")
  local queue, seen, read = {}, {}, 1
  local function enqueue(x,y)
    if x<0 or x>=canvasWidth or y<0 or y>=canvasHeight then return end
    local key=y*canvasWidth+x
    if seen[key] then return end
    seen[key]=true
    local value=image:getPixel(x,y)
    local r,g,b,a=app.pixelColor.rgbaR(value),app.pixelColor.rgbaG(value),app.pixelColor.rgbaB(value),app.pixelColor.rgbaA(value)
    if a<128 or (math.min(r,g,b)>=70 and math.max(r,g,b)-math.min(r,g,b)<=18) then queue[#queue+1]=key end
  end
  for n=0,canvasWidth-1 do enqueue(n,0);enqueue(n,canvasHeight-1) end
  for n=0,canvasHeight-1 do enqueue(0,n);enqueue(canvasWidth-1,n) end
  while read<=#queue do
    local key=queue[read];read=read+1
    local x,y=key%canvasWidth,math.floor(key/canvasWidth)
    if app.pixelColor.rgbaA(image:getPixel(x,y))>0 then removedBackground=removedBackground+1 end
    image:drawPixel(x,y,0)
    enqueue(x-1,y);enqueue(x+1,y);enqueue(x,y-1);enqueue(x,y+1)
  end
  cel.image=image
end
local scale = size / math.max(originalWidth, originalHeight)
local width = math.max(1, math.floor(originalWidth * scale + .5))
local height = math.max(1, math.floor(originalHeight * scale + .5))
app.command.SpriteSize { ui=false, width=width, height=height, method="nearest" }
if width ~= size or height ~= size then
  local left, top = math.floor((size-width)/2), math.floor((size-height)/2)
  app.command.CanvasSize { ui=false, left=left, top=top, right=size-width-left, bottom=size-height-top }
end
local opaque = 0
for _, cel in ipairs(source.cels) do
  local image = Image(cel.image)
  for pixel in image:pixels() do
    local value = pixel()
    if app.pixelColor.rgbaA(value) >= 128 then
      pixel(app.pixelColor.rgba(app.pixelColor.rgbaR(value),app.pixelColor.rgbaG(value),app.pixelColor.rgbaB(value),255))
      opaque = opaque + 1
    else pixel(0) end
  end
  cel.image = image
end
assert(opaque > 0 and opaque < size*size, "true transparent background and visible puppy are required")
app.command.ColorQuantization { ui=false, withAlpha=true, maxColors=colors, useRange=false, algorithm="octree" }
app.command.ChangePixelFormat { ui=false, format="indexed", dithering="none", rgbmap="octree", fitCriteria="rgb" }
assert(source.colorMode == ColorMode.INDEXED, "indexed conversion failed")
source.layers[1].name = id .. " puppy"
source:saveAs(output .. "/" .. id .. ".aseprite")
source:saveCopyAs(output .. "/" .. id .. ".png")

-- Remap only the exported data to a compact palette with transparency at zero.
-- Exporting does not recolor, draw, or otherwise change the artwork.
local palette, rgba, counts, map = {"#00000000"}, {{r=0,g=0,b=0,a=0}}, {0}, {}
local cells = {}
for y=1,size do cells[y]={}; for x=1,size do cells[y][x]=0 end end
local sprPalette = source.palettes[1]
for _, cel in ipairs(source.cels) do
  for pixel in cel.image:pixels() do
    local x, y = pixel.x+cel.position.x+1, pixel.y+cel.position.y+1
    if x>=1 and x<=size and y>=1 and y<=size then
      local index = pixel()
      local color = sprPalette:getColor(index)
      if color.alpha > 0 and index ~= source.transparentColor then
        if map[index] == nil then
          map[index]=#palette
          palette[#palette+1]=string.format("#%02x%02x%02x%02x",color.red,color.green,color.blue,color.alpha)
          rgba[#rgba+1]={r=color.red,g=color.green,b=color.blue,a=color.alpha}
          counts[#counts+1]=0
        end
        local compact=map[index]
        cells[y][x]=compact
        counts[compact+1]=counts[compact+1]+1
      end
    end
  end
end
assert(#palette <= colors, "compact palette exceeds 12 entries")
local roles, luminance, mainIndex, mainCount = {"transparent"}, {}, nil, -1
for n=2,#palette do
  local c=rgba[n]
  local l=(c.r*.2126+c.g*.7152+c.b*.0722)/255
  luminance[n]=l
  if l < .27 then roles[n]="outline"
  elseif c.r > c.g*1.15 and c.b > c.g*.9 and c.r-c.g > 24 then roles[n]="blush"
  elseif c.r >= 222 and c.g >= 214 and c.b >= 193 then roles[n]="cream"
  elseif l < .38 and math.max(c.r,c.g,c.b)-math.min(c.r,c.g,c.b) < 28 then roles[n]="detail"
  elseif counts[n] > mainCount then mainIndex=n; mainCount=counts[n] end
end
local mainLight = mainIndex and luminance[mainIndex] or .65
for n=2,#palette do
  if not roles[n] then
    if luminance[n] < mainLight-.10 then roles[n]="shade"
    elseif luminance[n] > mainLight+.10 then roles[n]="light"
    else roles[n]="coat" end
  end
end
local rows, alphabet, bounds = {}, "0123456789abcdefghijklmnopqrstuvwxyz", {left=size,top=size,right=0,bottom=0}
for y=1,size do
  local row={}
  for x=1,size do
    local value=cells[y][x]
    row[x]=alphabet:sub(value+1,value+1)
    if value>0 then bounds.left=math.min(bounds.left,x-1); bounds.top=math.min(bounds.top,y-1); bounds.right=math.max(bounds.right,x-1); bounds.bottom=math.max(bounds.bottom,y-1) end
  end
  rows[y]=table.concat(row)
end
local file=assert(io.open(output .. "/" .. id .. ".json","w"))
file:write(json.encode {width=size,height=size,palette=palette,roles=roles,rows=rows,bounds=bounds})
file:close()
app.command.SpriteSize { ui=false, width=512, height=512, method="nearest" }
source:saveCopyAs(output .. "/" .. id .. "-preview.png")
print(json.encode {success=true,id=id,inputWidth=originalWidth,inputHeight=originalHeight,width=size,height=size,paletteCount=#palette,opaquePixels=opaque,removedNeutralBackgroundPixels=removedBackground})
