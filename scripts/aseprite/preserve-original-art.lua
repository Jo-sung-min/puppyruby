-- Import the generated full-resolution RGBA master without resizing or quantizing.
local input=assert(app.params.input)
local output=assert(app.params.output)
local id=assert(app.params.id)
local sprite=assert(app.open(input), "Unable to open the generated original")
assert(#sprite.frames==1, "Expected one source frame")
assert(sprite.colorMode==ColorMode.RGB, "Original must be RGBA; do not convert a palette silently")
-- Some original comparison sources have a white opaque backdrop. Remove only
-- near-white neutral pixels connected to the border; enclosed fur is untouched.
-- No resizing, quantization, color replacement, smoothing or alpha thresholding.
local art=Image(sprite)
local width,height=art.width,art.height
local visited,queue={},{}
local function consider(x,y)
  if x<0 or y<0 or x>=width or y>=height then return end
  local index=y*width+x+1
  if visited[index] then return end
  visited[index]=true
  local v=art:getPixel(x,y)
  local r,g,b,a=app.pixelColor.rgbaR(v),app.pixelColor.rgbaG(v),app.pixelColor.rgbaB(v),app.pixelColor.rgbaA(v)
  if a==0 or (math.min(r,g,b)>=245 and math.max(r,g,b)-math.min(r,g,b)<=8) then
    queue[#queue+1]=index
  end
end
for x=0,width-1 do consider(x,0);consider(x,height-1) end
for y=1,height-2 do consider(0,y);consider(width-1,y) end
local alreadyTransparent=app.pixelColor.rgbaA(art:getPixel(0,0))==0 and app.pixelColor.rgbaA(art:getPixel(width-1,height-1))==0
local head,removed=1,0
while not alreadyTransparent and head<=#queue do
  local index=queue[head]-1;head=head+1
  local x,y=index%width,math.floor(index/width)
  local v=art:getPixel(x,y)
  if app.pixelColor.rgbaA(v)>0 then removed=removed+1 end
  art:drawPixel(x,y,0)
  consider(x-1,y);consider(x+1,y);consider(x,y-1);consider(x,y+1)
end
-- A generated opaque PNG is imported as a background layer. Use a new RGBA
-- sprite so erased pixels stay transparent rather than being flattened black.
sprite:close()
sprite=Sprite(width,height,ColorMode.RGB)
sprite:newCel(sprite.layers[1],1,art,Point(0,0))
sprite.layers[1].name="Original artwork - full resolution"
sprite.filename=output.."/"..id..".aseprite"
sprite:saveAs(sprite.filename)
sprite:saveCopyAs(output.."/"..id..".png")
print(json.encode{success=true,id=id,width=sprite.width,height=sprite.height,
  colorMode="RGBA",frames=#sprite.frames,layers=#sprite.layers,resized=false,quantized=false,recolored=false,removedBorderBackgroundPixels=removed})
sprite:close()
