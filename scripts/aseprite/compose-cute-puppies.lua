-- Aseprite presentation only. Puppy pixels are copied from editable exports.
local input=assert(app.params.input)
local output=assert(app.params.output)
local ids={}
for id in assert(app.params.ids):gmatch("[^,]+") do ids[#ids+1]=id end
assert(#ids>=1 and #ids<=16)
local columns,cellWidth,cellHeight,margin=4,96,92,8
local width,height=columns*cellWidth+margin*2,math.ceil(#ids/columns)*cellHeight+margin*2
local canvas=Image(width,height,ColorMode.RGB)
canvas:clear(Color{r=240,g=240,b=242,a=255})
local gc=canvas.context;gc.antialias=false
local glyphs={
 A={"010","101","111","101","101"},B={"110","101","110","101","110"},C={"111","100","100","100","111"},
 E={"111","100","110","100","111"},F={"111","100","110","100","100"},G={"111","100","101","101","111"},
 H={"101","101","111","101","101"},I={"111","010","010","010","111"},L={"100","100","100","100","111"},
 M={"101","111","111","101","101"},N={"101","111","111","111","101"},O={"111","101","101","101","111"},
 R={"110","101","110","101","101"},S={"111","100","111","001","111"},T={"111","010","010","010","010"},
 U={"101","101","101","101","111"},Y={"101","101","010","010","010"},Z={"111","001","010","100","111"},
 ["-"]={"000","000","111","000","000"}
}
local function label(text,x,y)
 for n=1,#text do local glyph=assert(glyphs[text:sub(n,n)],text:sub(n,n));for gy,row in ipairs(glyph) do for gx=1,3 do
  if row:sub(gx,gx)=="1" then canvas:drawPixel(x+(n-1)*4+gx-1,y+gy-1,app.pixelColor.rgba(39,39,42,255)) end
 end end end
end
for i,id in ipairs(ids) do
 local source=assert(app.open(input.."/"..id..".aseprite"))
 assert(source.width==64 and source.height==64 and #source.frames==1)
 local x,y=margin+((i-1)%columns)*cellWidth,margin+math.floor((i-1)/columns)*cellHeight
 gc.color=Color{r=255,g=255,b=255,a=255};gc:fillRect(Rectangle(x+2,y,cellWidth-4,cellHeight-4))
 app.activeSprite=source;app.command.ChangePixelFormat{ui=false,format="rgb"}
 local art=Image(source)
 for pixel in art:pixels() do local v=pixel();if app.pixelColor.rgbaA(v)>0 then canvas:drawPixel(x+16+pixel.x,y+4+pixel.y,v) end end
 label(id:upper(),x+math.floor((cellWidth-(#id*4-1))/2),y+75)
 source:close()
end
local sheet=Sprite(width,height,ColorMode.RGB)
sheet:newCel(sheet.layers[1],1,canvas,Point(0,0));app.activeSprite=sheet
app.command.SpriteSize{ui=false,width=width*4,height=height*4,method="nearest"}
sheet:saveCopyAs(output)
print(json.encode{success=true,count=#ids,width=width*4,height=height*4})
