-- Native Aseprite processing of a generated bitmap; no artwork is synthesized here.
-- API: https://www.aseprite.org/api/command/SpriteSize
-- API: https://www.aseprite.org/api/command/ColorQuantization
local input = assert(app.params.input, "input is required")
local output = assert(app.params.output, "output is required")
local id = assert(app.params.id, "id is required")
local size = tonumber(app.params.size or "64")
local colors = tonumber(app.params.colors or "16")
local previewSize = tonumber(app.params.preview or "512")
assert(size == 48 or size == 64, "native size must be 48 or 64")
assert(colors >= 8 and colors <= 32, "palette size must be between 8 and 32")
assert(previewSize % size == 0, "preview must be an integer multiple of native size")

local source = assert(app.open(input), "could not open generated PNG")
assert(#source.frames == 1, "only single-frame design candidates are accepted")
local originalWidth, originalHeight = source.width, source.height
local sprite = source
app.activeSprite = sprite
app.command.ChangePixelFormat { ui=false, format="rgb" }
sprite:flatten()
local scale = size / math.max(originalWidth, originalHeight)
local fittedWidth = math.max(1, math.floor(originalWidth * scale + 0.5))
local fittedHeight = math.max(1, math.floor(originalHeight * scale + 0.5))
app.command.SpriteSize { ui=false, width=fittedWidth, height=fittedHeight, method="nearest" }
if fittedWidth ~= size or fittedHeight ~= size then
  local left = math.floor((size - fittedWidth) / 2)
  local top = math.floor((size - fittedHeight) / 2)
  app.command.CanvasSize { ui=false, left=left, top=top, right=size-fittedWidth-left, bottom=size-fittedHeight-top }
end

-- Tiny game sprites use either fully opaque or fully transparent pixels.
-- This removes only partial alpha; it never guesses or deletes a white background.
local transparent = size * size
for _, cel in ipairs(sprite.cels) do
  local pixels = Image(cel.image)
  for pixel in pixels:pixels() do
    local value = pixel()
    local alpha = app.pixelColor.rgbaA(value)
    if alpha >= 128 then
      pixel(app.pixelColor.rgba(app.pixelColor.rgbaR(value), app.pixelColor.rgbaG(value), app.pixelColor.rgbaB(value), 255))
      transparent = transparent - 1
    else
      pixel(0)
    end
  end
  cel.image = pixels
end
assert(transparent > 0 and transparent < size * size, "a visible character with true transparency is required")

-- Build a palette from this exact character, then map pixels without dithering.
app.command.ColorQuantization { ui=false, withAlpha=true, maxColors=colors, useRange=false, algorithm="octree" }
app.command.ChangePixelFormat { ui=false, format="indexed", dithering="none", rgbmap="octree", fitCriteria="rgb" }
assert(sprite.colorMode == ColorMode.INDEXED, "indexed palette conversion failed")
sprite.layers[1].name = id .. " artwork"
sprite:saveAs(output .. "/" .. id .. ".aseprite")
sprite:saveCopyAs(output .. "/" .. id .. ".png")

app.command.SpriteSize { ui=false, width=previewSize, height=previewSize, method="nearest" }
sprite:saveCopyAs(output .. "/" .. id .. "-preview.png")
print(json.encode { success=true, id=id, inputWidth=originalWidth, inputHeight=originalHeight, width=size, height=size, paletteLimit=colors, previewSize=previewSize, mode="indexed", alpha="binary", resize="nearest" })
