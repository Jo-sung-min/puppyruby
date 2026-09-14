-- Review all thirty interchangeable eye layers on the untouched native dog.
local source=assert(app.open(assert(app.params.input,"input required")))
local target=assert(app.params.output,"output required")
assert(#source.layers==31,"Expected one body and thirty eye layers")
local sheet=Image(source.width*6,source.height*5,ColorMode.RGB)
local body=assert(source.layers[1]:cel(1))
for style=1,30 do
  local x=((style-1)%6)*source.width;local y=math.floor((style-1)/6)*source.height
  sheet:drawImage(body.image,Point(x+body.position.x,y+body.position.y))
  local cel=source.layers[style+1]:cel(1)
  if cel then sheet:drawImage(cel.image,Point(x+cel.position.x,y+cel.position.y)) end
end
local output=Sprite(sheet.width,sheet.height,ColorMode.RGB);output:newCel(output.layers[1],1,sheet,Point(0,0));output:saveCopyAs(target);output:close();source:close()
