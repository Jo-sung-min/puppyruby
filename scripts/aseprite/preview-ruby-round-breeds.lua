local directory=assert(app.params.directory,"processed directory required")
local manifestFile=assert(io.open(assert(app.params.manifest,"manifest required"),"r"))
local records=json.decode(manifestFile:read("*a"));manifestFile:close()
local output=assert(app.params.output,"output prefix required")
for _,scene in ipairs({"idle","walk","sleep"}) do
  local cellWidth,cellHeight=320,320
  local sheet=Image(cellWidth*6,cellHeight*5,ColorMode.RGB)
  for i,record in ipairs(records) do
    local source=assert(app.open(directory.."/"..record.breed.."/"..scene.."-default.png"));local sourceImage=Image(source)
    local x=((i-1)%6)*cellWidth+math.floor((cellWidth-record.width)/2)
    local y=math.floor((i-1)/6)*cellHeight+cellHeight-record.height
    for yy=0,record.height-1 do for xx=0,record.width-1 do sheet:drawPixel(x+xx,y+yy,sourceImage:getPixel(xx,yy)) end end
    source:close()
  end
  local sprite=Sprite(sheet.width,sheet.height,ColorMode.RGB);sprite:newCel(sprite.layers[1],1,sheet,Point(0,0));sprite:saveCopyAs(output.."-"..scene..".png");sprite:close()
end
