-- Read-only verification of an existing published Aseprite master against its
-- native PNG strips. In particular, this verifies editable frame tags/cels.
local directory = assert(app.params.input)
local id = assert(app.params.id)
local sprite = assert(app.open(directory .. "/" .. id .. ".aseprite"))
assert(#sprite.frames == 12 and #sprite.tags == 5 and sprite.colorMode == ColorMode.RGB)
local specs = {{"idle",1,1},{"side",2,2},{"happy",3,3},{"sleep",4,4},{"walk",5,12}}
local tags = {}
for _, tag in ipairs(sprite.tags) do tags[tag.name] = {tag.fromFrame.frameNumber,tag.toFrame.frameNumber} end
for _, spec in ipairs(specs) do
  local tag = assert(tags[spec[1]])
  assert(tag[1] == spec[2] and tag[2] == spec[3], "Editable tag range changed")
  local png = assert(app.open(directory .. "/" .. spec[1] .. ".png"))
  local pixels = Image(png)
  for index = spec[2],spec[3] do
    local cel = assert(sprite.layers[1]:cel(index))
    local restored = Image(sprite.width,sprite.height,ColorMode.RGB)
    restored:drawImage(cel.image,cel.position)
    for y = 0,sprite.height-1 do for x = 0,sprite.width-1 do
      local a = restored:getPixel(x,y)
      local b = pixels:getPixel((index-spec[2])*sprite.width+x,y)
      assert(a == b or (app.pixelColor.rgbaA(a)==0 and app.pixelColor.rgbaA(b)==0), "Editable RGBA does not match the native export")
    end end
  end
  png:close()
end
print(json.encode{breed=id,editableRgbaVerified=true,tags=5,frames=12,width=sprite.width,height=sprite.height})
sprite:close()
