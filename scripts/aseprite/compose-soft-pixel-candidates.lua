-- Presentation only: copies the verified puppy previews at their native size.
local input=assert(app.params.input,"input directory required")
local output=assert(app.params.output,"output PNG required")
local columns,rows,cellWidth,cellHeight,padding=5,3,216,234,20
local width,height=columns*cellWidth+padding*2,rows*cellHeight+padding*2
local canvas=Image(width,height,ColorMode.RGB)
canvas:clear(Color{r=23,g=24,b=32,a=255})
local labelColor=app.pixelColor.rgba(237,239,249,255)
local glyphs={
 S={"111","100","111","001","111"},P={"110","101","110","100","100"},
 ["0"]={"111","101","101","101","111"},["1"]={"010","110","010","010","111"},
 ["2"]={"111","001","111","100","111"},["3"]={"111","001","111","001","111"},
 ["4"]={"101","101","111","001","001"},["5"]={"111","100","111","001","111"},
 ["6"]={"111","100","111","101","111"},["7"]={"111","001","010","010","010"},
 ["8"]={"111","101","111","101","111"},["9"]={"111","101","111","001","111"}
}
local fontScale=2
local function label(text,x,y)
 for index=1,#text do
  local glyph=assert(glyphs[text:sub(index,index)])
  for gy,row in ipairs(glyph) do for gx=1,3 do
   if row:sub(gx,gx)=="1" then
    for dy=0,fontScale-1 do for dx=0,fontScale-1 do
     canvas:drawPixel(x+((index-1)*4+gx-1)*fontScale+dx,y+(gy-1)*fontScale+dy,labelColor)
    end end
   end
  end end
 end
end
for index=1,15 do
 local id=string.format("sp-%02d",index)
 local source=assert(app.open(input.."/"..id.."/preview.png"),"Missing completed candidate preview")
 assert(source.width==192 and source.height==192 and #source.frames==1,"Contact sheet requires native 192 px previews")
 local x=padding+((index-1)%columns)*cellWidth
 local y=padding+math.floor((index-1)/columns)*cellHeight
 canvas:drawImage(Image(source),Point(x+12,y+2))
 source:close()
 label(string.format("SP%02d",index),x+93,y+208)
end
local sprite=Sprite(width,height,ColorMode.RGB)
sprite:newCel(sprite.layers[1],1,canvas,Point(0,0))
sprite:saveCopyAs(output)
sprite:close()
print(json.encode{success=true,candidates=15,width=width,height=height,nativePreviewSize=192,resized=false})
