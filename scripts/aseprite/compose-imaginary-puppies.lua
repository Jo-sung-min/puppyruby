-- Presentation sheet only: imported Aseprite artwork is copied without alteration.
-- https://www.aseprite.org/api/image#imagedrawsprite
local input = assert(app.params.input, "input directory is required")
local output = assert(app.params.output, "output filename is required")
local count = tonumber(app.params.count or "12")
assert(count >= 1 and count <= 12, "invalid candidate count")
local columns, cellWidth, cellHeight, margin, header = 4, 80, 92, 8, 0
local rows = math.ceil(count / columns)
local width = columns * cellWidth + margin * 2
local height = rows * cellHeight + margin * 2 + header
local canvas = Image(width, height, ColorMode.RGB)
canvas:clear(Color { r=244, g=244, b=245, a=255 })
local gc = canvas.context
gc.antialias = false
-- Aseprite's UI font is unavailable in batch mode. This tiny ID font is only
-- presentation annotation; all puppy artwork comes from the imported sprites.
local glyphs = {
  C={"111","100","100","100","111"},
  ["0"]={"111","101","101","101","111"},
  ["1"]={"010","110","010","010","111"},
  ["2"]={"111","001","111","100","111"},
  ["3"]={"111","001","111","001","111"},
  ["4"]={"101","101","111","001","001"},
  ["5"]={"111","100","111","001","111"},
  ["6"]={"111","100","111","101","111"},
  ["7"]={"111","001","010","010","010"},
  ["8"]={"111","101","111","101","111"},
  ["9"]={"111","101","111","001","111"}
}
local function label(text, x, y)
  for n=1,#text do
    local glyph = assert(glyphs[text:sub(n,n)])
    for gy,row in ipairs(glyph) do
      for gx=1,3 do
        if row:sub(gx,gx) == "1" then canvas:drawPixel(x+(n-1)*4+gx-1,y+gy-1,app.pixelColor.rgba(39,39,42,255)) end
      end
    end
  end
end
for index=1,count do
  local id = string.format("C%02d", index)
  local source = assert(app.open(input .. "/" .. id .. ".aseprite"), "missing editable sprite " .. id)
  assert(source.width == 64 and source.height == 64 and #source.frames == 1, "unexpected editable format")
  local x = margin + ((index - 1) % columns) * cellWidth
  local y = margin + header + math.floor((index - 1) / columns) * cellHeight
  gc.color = Color { r=255, g=255, b=255, a=255 }
  gc:fillRect(Rectangle(x + 2, y, cellWidth - 4, cellHeight - 4))
  app.activeSprite = source
  app.command.ChangePixelFormat { ui=false, format="rgb" }
  local artwork = Image(source)
  for pixel in artwork:pixels() do
    local value = pixel()
    if app.pixelColor.rgbaA(value) > 0 then canvas:drawPixel(x+8+pixel.x,y+4+pixel.y,value) end
  end
  label(id, x + 34, y + 75)
  source:close()
end
local sheet = Sprite(width, height, ColorMode.RGB)
sheet:newCel(sheet.layers[1], 1, canvas, Point(0, 0))
app.activeSprite = sheet
app.command.SpriteSize { ui=false, width=width*4, height=height*4, method="nearest" }
sheet:saveCopyAs(output)
print(json.encode { success=true, candidates=count, width=width*4, height=height*4, resize="nearest" })
