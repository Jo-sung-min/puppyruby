-- Comparison sheet only; source PNGs are opened and closed without saving edits.
local input=assert(app.params.input)
local output=assert(app.params.output)
local dark=app.params.theme=="dark"
local columns,cellWidth,cellHeight,margin=6,256,280,16
local canvas=Image(columns*cellWidth+margin*2,5*cellHeight+margin*2,ColorMode.RGB)
canvas:clear(dark and Color{r=17,g=19,b=23,a=255} or Color{r=244,g=241,b=236,a=255})
local gc=canvas.context;gc.antialias=false
local glyphs={
 ["0"]={"01110","10001","10011","10101","11001","10001","01110"},
 ["1"]={"00100","01100","00100","00100","00100","00100","01110"},
 ["2"]={"01110","10001","00001","00010","00100","01000","11111"},
 ["3"]={"11110","00001","00001","01110","00001","00001","11110"},
 ["4"]={"00010","00110","01010","10010","11111","00010","00010"},
 ["5"]={"11111","10000","10000","11110","00001","00001","11110"},
 ["6"]={"01110","10000","10000","11110","10001","10001","01110"},
 ["7"]={"11111","00001","00010","00100","01000","01000","01000"},
 ["8"]={"01110","10001","10001","01110","10001","10001","01110"},
 ["9"]={"01110","10001","10001","01111","00001","00001","01110"}
}
local function label(text,x,y)
 local color=dark and app.pixelColor.rgba(242,241,239,255) or app.pixelColor.rgba(55,42,33,255)
 for n=1,#text do for gy,row in ipairs(glyphs[text:sub(n,n)]) do for gx=1,5 do
  if row:sub(gx,gx)=="1" then for dx=0,2 do for dy=0,2 do canvas:drawPixel(x+(n-1)*18+(gx-1)*3+dx,y+(gy-1)*3+dy,color) end end end
 end end end
end
for i=1,30 do
 local source=assert(app.open(input.."/"..string.format("art-%02d",i)..".png"))
 local x,y=margin+((i-1)%columns)*cellWidth,margin+math.floor((i-1)/columns)*cellHeight
 gc.color=dark and Color{r=31,g=34,b=42,a=255} or Color{r=255,g=252,b=247,a=255}
 gc:fillRect(Rectangle(x+4,y+4,cellWidth-8,cellHeight-8))
 app.activeSprite=source
 local scale=232/math.max(source.width,source.height)
 local w,h=math.floor(source.width*scale+0.5),math.floor(source.height*scale+0.5)
 app.command.SpriteSize{ui=false,width=w,height=h,method="nearest"}
 canvas:drawImage(Image(source),Point(x+math.floor((cellWidth-w)/2),y+10+math.floor((232-h)/2)))
 label(string.format("%02d",i),x+110,y+250)
 source:close()
end
local sheet=Sprite(canvas.width,canvas.height,ColorMode.RGB)
sheet:newCel(sheet.layers[1],1,canvas,Point(0,0))
sheet:saveCopyAs(output)
sheet:close()
print("Comparison sheet saved; originals unchanged")
