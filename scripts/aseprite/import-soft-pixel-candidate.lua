-- Import image-generated puppy artwork into the paid Aseprite editor. The body
-- is supplied artwork; only the deliberately replaceable, code-native eyes are
-- authored here. Four eye groups remain independent of the unchanged body.
local input = assert(app.params.input, "input is required")
local output = assert(app.params.output, "output is required")
local id = assert(app.params.id, "id is required")
local configPath = assert(app.params.config, "config is required")
local configFile = assert(io.open(configPath, "r"))
local config = json.decode(configFile:read("*a")); configFile:close()
local size = tonumber(config.size or 192)
assert(size and size >= 160 and size <= 512 and size % 1 == 0, "Native canvas must be 160 to 512 pixels")
local background = config.background or "transparent"
assert(background == "transparent" or background == "border-magenta" or background == "border-white", "Unrecognized background mode")
local names = {"dot", "bean", "sparkle", "sleep"}
local defaultEyes = config.defaultEyes or "bean"
local known = {}; for _,name in ipairs(names) do known[name] = true end
assert(known[defaultEyes], "Default eye preset is unknown")
local source = assert(app.open(input), "Unable to open image-generated artwork")
assert(#source.frames == 1, "Expected one body illustration")
app.activeSprite = source
app.command.ChangePixelFormat {ui=false, format="rgb"}
local originalWidth, originalHeight = source.width, source.height
local body = Image(source)
-- Some transparent generator outputs contain alpha=1 noise along the outer
-- canvas. These invisible pixels are removed explicitly; visible alpha and
-- every visible RGB value remain intact.
local noiseThreshold=tonumber(config.alphaNoiseThreshold or 2)
assert(noiseThreshold>=0 and noiseThreshold<=2, "Only invisible alpha noise may be discarded")
local removedAlphaNoise=0
for pixel in body:pixels() do
  local alpha=app.pixelColor.rgbaA(pixel())
  if alpha>0 and alpha<=noiseThreshold then pixel(0);removedAlphaNoise=removedAlphaNoise+1 end
end
local function isBackground(value)
  local r,g,b,a = app.pixelColor.rgbaR(value),app.pixelColor.rgbaG(value),app.pixelColor.rgbaB(value),app.pixelColor.rgbaA(value)
  return a == 0
    or (background == "border-magenta" and r >= 180 and b >= 180 and g <= 100 and r-g >= 100 and b-g >= 100)
    or (background == "border-white" and math.min(r,g,b) >= 248 and math.max(r,g,b)-math.min(r,g,b) <= 5)
end
local removed = 0
if background ~= "transparent" then
  local seen,queue,head = {},{},1
  local function visit(x,y)
    if x<0 or y<0 or x>=body.width or y>=body.height then return end
    local key=y*body.width+x+1
    if seen[key] then return end; seen[key]=true
    if isBackground(body:getPixel(x,y)) then queue[#queue+1]=key end
  end
  for x=0,body.width-1 do visit(x,0);visit(x,body.height-1) end
  for y=1,body.height-2 do visit(0,y);visit(body.width-1,y) end
  while head<=#queue do
    local key=queue[head]-1;head=head+1
    local x,y=key%body.width,math.floor(key/body.width)
    if app.pixelColor.rgbaA(body:getPixel(x,y))>0 then removed=removed+1 end
    body:drawPixel(x,y,0)
    visit(x-1,y);visit(x+1,y);visit(x,y-1);visit(x,y+1)
  end
  -- Explicit magenta is reserved as a color key, including enclosed leg gaps.
  if background == "border-magenta" then
    for pixel in body:pixels() do
      if app.pixelColor.rgbaA(pixel())>0 and isBackground(pixel()) then pixel(0);removed=removed+1 end
    end
  end
end
source:close()
local temporary = Sprite(originalWidth, originalHeight, ColorMode.RGB)
temporary:newCel(temporary.layers[1],1,body,Point(0,0))
app.activeSprite = temporary
local scale = size/math.max(originalWidth,originalHeight)
local resizedWidth = math.max(1,math.floor(originalWidth*scale+.5))
local resizedHeight = math.max(1,math.floor(originalHeight*scale+.5))
if resizedWidth~=originalWidth or resizedHeight~=originalHeight then
  app.command.SpriteSize {ui=false,width=resizedWidth,height=resizedHeight,method="nearest"}
end
local offsetX,offsetY = math.floor((size-resizedWidth)/2),math.floor((size-resizedHeight)/2)
body=Image(size,size,ColorMode.RGB)
body:drawImage(Image(temporary),Point(offsetX,offsetY))
temporary:close()
-- Actual transparency is mandatory; opaque checkerboards are never accepted.
local visible,transparent,semiTransparent,edgePixels = 0,0,0,0
local bodyColors={}
for pixel in body:pixels() do
  local value=pixel(); local a=app.pixelColor.rgbaA(value)
  if a>0 then
    visible=visible+1;bodyColors[value]=true
    if a<255 then semiTransparent=semiTransparent+1 end
    if pixel.x==0 or pixel.y==0 or pixel.x==size-1 or pixel.y==size-1 then edgePixels=edgePixels+1 end
  else transparent=transparent+1 end
end
assert(visible>size*size*.08 and transparent>size*size*.1, "Body needs visible artwork on a true transparent background")
assert(edgePixels==0, "Puppy touches the canvas border; inspect the source")
local function rgb(text)
  assert(type(text)=="string" and text:match("^#%x%x%x%x%x%x$"), "Eye colors must be #RRGGBB")
  return app.pixelColor.rgba(tonumber(text:sub(2,3),16),tonumber(text:sub(4,5),16),tonumber(text:sub(6,7),16),255)
end
local ink=rgb(config.eyeColor or "#000000")
local shine=rgb(config.highlightColor or "#ffffff")
local eyeWidth=tonumber(config.eyeWidth or 10)
local eyeHeight=tonumber(config.eyeHeight or 13)
assert(eyeWidth>=4 and eyeWidth<=size*.15 and eyeHeight>=4 and eyeHeight<=size*.18, "Eye dimensions are outside the supported range")
local anchorSpace=config.anchorSpace or "native"
assert(anchorSpace=="native" or anchorSpace=="source", "Anchor space must be native or source")
local function anchor(value)
  assert(value and type(value.x)=="number" and type(value.y)=="number", "Both eye center anchors are required")
  local x,y=value.x,value.y
  if anchorSpace=="source" then x=x*scale+offsetX;y=y*scale+offsetY end
  x=math.floor(x+.5);y=math.floor(y+.5)
  assert(x>eyeWidth and y>eyeHeight and x<size-eyeWidth and y<size-eyeHeight, "Eye anchor is outside the body canvas")
  assert(app.pixelColor.rgbaA(body:getPixel(x,y))>0, "Eye anchor must lie on the supplied face artwork")
  return {x=x,y=y}
end
local left,right=anchor(config.eyeLeft),anchor(config.eyeRight)
assert(left.x+eyeWidth<right.x, "Eye anchors overlap or are reversed")
-- Pixel masks are tiny, intentional UI expression assets. They do not redraw
-- or procedurally synthesize the supplied dog illustration.
local masks={
  dot={"0011100","0111110","1111111","1111111","1111111","0111110","0011100"},
  bean={"00111100","01111110","11111111","11111111","11111111","11111111","11111111","11111111","01111110","00111100"},
  sparkle={"0001111000","0011111100","0111111110","1111111111","1111111111","1111111111","1111111111","1111111111","1111111111","0111111110","0011111100","0001111000"},
  sleep={"0000000000","0011111100","0111111110","1110000111","1100000011","0000000000"}
}
local function paintEye(name,center)
  local layer=Image(size,size,ColorMode.RGB)
  local highlight=Image(size,size,ColorMode.RGB)
  local mask=masks[name]
  local width=math.floor(eyeWidth+.5)
  local height=math.floor(eyeHeight+.5)
  if name=="dot" then height=width end
  if name=="sparkle" then width=width+2;height=height+2 end
  if name=="sleep" then width=width+2;height=math.max(4,math.floor(height*.5)) end
  local originX=math.floor(center.x-width/2+.5)
  local originY=math.floor(center.y-height/2+.5)
  for y=0,height-1 do for x=0,width-1 do
    local row=mask[math.floor(y*#mask/height)+1]
    if row:sub(math.floor(x*#row/width)+1,math.floor(x*#row/width)+1)=="1" then
      layer:drawPixel(originX+x,originY+y,ink)
    end
  end end
  local function spot(x,y,w,h)
    for yy=y,y+h-1 do for xx=x,x+w-1 do
      if app.pixelColor.rgbaA(layer:getPixel(xx,yy))>0 then highlight:drawPixel(xx,yy,shine) end
    end end
  end
  if name=="bean" or name=="sparkle" then
    local block=math.max(1,math.floor(width*(name=="sparkle" and .3 or .23)))
    spot(originX+math.floor(width*.2),originY+math.floor(height*.16),block,block)
    if name=="sparkle" then
      local small=math.max(1,math.floor(width*.14))
      spot(originX+math.floor(width*.65),originY+math.floor(height*.7),small,small)
    end
  end
  return layer,highlight
end
local sprite=Sprite(size,size,ColorMode.RGB)
sprite.layers[1].name="Body - supplied artwork (eyes separate)"
sprite:newCel(sprite.layers[1],1,body,Point(0,0))
local eyeImages,groups = {},{}
for _,name in ipairs(names) do
  local group=sprite:newGroup();group.name="Eyes - "..name
  groups[name]=group
  local leftImage,leftHighlights=paintEye(name,left)
  local rightImage,rightHighlights=paintEye(name,right)
  local highlights=Image(leftHighlights);highlights:drawImage(rightHighlights)
  local function addLayer(title,pixels)
    local layer=sprite:newLayer();layer.parent=group;layer.name=title
    sprite:newCel(layer,1,pixels,Point(0,0))
  end
  addLayer("Eye left",leftImage);addLayer("Eye right",rightImage);addLayer("Highlights",highlights)
  group.isVisible=(name==defaultEyes)
  local composite=Image(leftImage);composite:drawImage(rightImage);composite:drawImage(highlights)
  eyeImages[name]=composite
end
local function visibleEqual(a,b)
  return a==b or (app.pixelColor.rgbaA(a)==0 and app.pixelColor.rgbaA(b)==0)
end
local function savePng(name,pixels)
  local export=Sprite(size,size,ColorMode.RGB)
  export:newCel(export.layers[1],1,pixels,Point(0,0))
  export:saveCopyAs(output.."/"..name..".png");export:close()
  local check=assert(app.open(output.."/"..name..".png"))
  assert(check.width==size and check.height==size, "PNG canvas changed")
  local reopened=Image(check)
  for y=0,size-1 do for x=0,size-1 do
    assert(visibleEqual(pixels:getPixel(x,y),reopened:getPixel(x,y)), "PNG changed visible RGBA")
  end end
  check:close()
end
savePng("body",body)
for _,name in ipairs(names) do savePng("eyes-"..name,eyeImages[name]) end
local preview=Image(body);preview:drawImage(eyeImages[defaultEyes])
savePng("preview",preview)
sprite:saveAs(output.."/"..id..".aseprite")
sprite:close()
local master=assert(app.open(output.."/"..id..".aseprite"))
assert(master.width==size and master.height==size and #master.frames==1 and #master.layers==5, "Aseprite lost the body or an eye group")
local masterComposite=Image(master)
for y=0,size-1 do for x=0,size-1 do
  assert(visibleEqual(masterComposite:getPixel(x,y),preview:getPixel(x,y)), "Editable Aseprite default differs from the preview")
end end
for _,layer in ipairs(master.layers) do
  if layer.isGroup then assert(#layer.layers==3, "Eyes must keep independent left, right and highlight layers") end
end
master:close()
local colorCount=0;for _ in pairs(bodyColors) do colorCount=colorCount+1 end
local result={version=1,id=id,width=size,height=size,sourceWidth=originalWidth,sourceHeight=originalHeight,
  resizeMethod="nearest",resized=size~=originalWidth or size~=originalHeight,quantized=false,recolored=false,
  removedBackgroundPixels=removed,visibleBodyPixels=visible,transparentBodyPixels=transparent,
  alphaNoiseThreshold=noiseThreshold,removedAlphaNoisePixels=removedAlphaNoise,
  semiTransparentBodyPixels=semiTransparent,bodyColorCount=colorCount,bodyArtworkGeneratedByCode=false,
  eyeLeft=left,eyeRight=right,eyeWidth=eyeWidth,eyeHeight=eyeHeight,eyeColor=config.eyeColor or "#000000",
  highlightColor=config.highlightColor or "#ffffff",defaultEyes=defaultEyes,eyePresets=names,
  editableEyeGroups=4,editableEyeLayers=12,frames=1,exactExportRgba=true}
local proof=assert(io.open(output.."/conversion.json","w"));proof:write(json.encode(result));proof:close()
print(json.encode(result))
