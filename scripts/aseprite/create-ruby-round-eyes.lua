-- Hand-authored replaceable pixel eyes for the supplied PuppyRuby eye reference.
-- This code runs inside the paid Aseprite editor; the dog artwork is not drawn here.
local output = assert(app.params.output, "output is required")
local rgba = app.pixelColor.rgba
local ink, white = rgba(34,29,30,255), rgba(255,252,243,255)
local names = {"기본 검은눈","갈색 순둥눈","파란 반짝눈","초록 반짝눈","금빛 눈","분홍 사랑눈","보랏빛 몽환눈","쉬는 미소","도도 반눈","졸린 눈","무표정 쿨눈","초승달 웃음","반짝 별눈","동그란 아기눈","호기심 눈","새침한 눈","장난기 눈","슬픈 촉촉눈","자신감 눈","깜짝 큰눈","윙크눈","삐진 눈","용맹한 눈","온화한 눈","청록 신비눈","붉은 열정눈","회색 차분눈","쌍하트 느낌눈","까만 유리알눈","힐링 순둥눈"}
local colors = {
  [2]=rgba(139,88,47,255),[3]=rgba(46,151,209,255),[4]=rgba(57,158,108,255),
  [5]=rgba(232,170,52,255),[7]=rgba(151,100,208,255),[9]=rgba(77,128,147,255),
  [18]=rgba(67,165,222,255),[24]=rgba(179,126,77,255),[25]=rgba(34,183,171,255),
  [26]=rgba(210,57,56,255),[27]=rgba(124,140,154,255),[30]=rgba(161,115,73,255)
}
local function pixel(image,x,y,color) if x>=0 and y>=0 and x<image.width and y<image.height then image:drawPixel(x,y,color) end end
local function rect(image,x,y,w,h,color) for yy=y,y+h-1 do for xx=x,x+w-1 do pixel(image,xx,yy,color) end end end
local function mask(image,x,y,rows,color)
  for row,line in ipairs(rows) do for col=1,#line do if line:sub(col,col) ~= "." then pixel(image,x+col-1,y+row-1,color) end end end
end
local oval={"..####..",".######.","########","########","########","########","########",".######.","..####.."}
local big={"...####...",".########.","##########","##########","##########","##########","##########","##########",".########.","...####..."}
local heart={".###.###.","#########","#########","#########",".#######.","..#####..","...###...","....#...."}
local star={"....#....","...###...","...###...","#########",".#######.","..#####..","..#####..",".###.###.",".##...##."}
local function drawEye(image,id,side)
  local ox=side*16
  local function r(x,y,w,h,c) rect(image,ox+x,y,w,h,c or ink) end
  local function m(x,y,rows,c) mask(image,ox+x,y,rows,c or ink) end
  if id==6 or id==28 then
    m(3,4,heart,rgba(118,35,55,255));m(4,5,{"##.##","######","######",".####.","..##.."},rgba(244,94,135,255));r(4,5,2,2,white)
    if id==28 then r(side==0 and 1 or 13,2,1,2,rgba(252,143,167,255)) end
  elseif id==13 then
    m(3,3,star);m(4,4,{"...#...","..###..","#######",".#####.","..###..",".##.##."},rgba(247,194,73,255));r(7,6,2,3,white)
  elseif id==8 or id==10 then
    m(3,7,{"##....##","###..###",".######.","..####.."})
    if id==10 then r(side==0 and 3 or 10,5,3,1,rgba(166,133,110,255)) end
  elseif id==12 or (id==21 and side==1) then
    m(3,5,{"..####..",".######.","###..###","##....##"})
  else
    if id==14 or id==20 or id==29 then m(3,3,big) else m(4,4,oval) end
    local color=colors[id] or rgba(62,53,52,255)
    r(6,8,4,3,color);r(7,10,2,1,color)
    r(5,5,2,2,white);r(6,5,2,1,white)
    if id==3 or id==4 or id==5 or id==7 or id==25 or id==26 or id==29 then r(9,9,2,2,white) end
    if id==14 or id==20 then r(4,4,3,3,white);r(9,10,2,2,white) end
    if id==20 then r(6,6,4,5,white);r(7,7,2,3,ink) end
    if id==15 then r(side==0 and 3 or 11,2,3,1,rgba(147,113,85,255)) end
    if id==9 or id==11 or id==16 or id==22 then
      for yy=0,6 do for xx=3,12 do pixel(image,ox+xx,yy,0) end end
      r(3,6,10,2,ink)
      if id==16 then r(side==0 and 3 or 10,4,3,1,ink) end
      if id==22 then r(side==0 and 10 or 3,4,3,1,ink) end
    end
    if id==19 then r(3,2,5,1,ink);r(4,3,4,1,ink) end
    if id==17 or id==23 then
      for x=3,12 do
        local yy=(side==0) and math.floor((x-3)/3)+2 or math.floor((12-x)/3)+2
        r(x,yy,1,id==23 and 3 or 2,ink)
      end
    end
    if id==18 then r(4,11,8,2,rgba(95,185,237,255));r(side==0 and 3 or 11,12,2,3,rgba(105,191,240,255));r(side==0 and 3 or 11,12,1,1,white) end
    if id==24 or id==30 then r(5,5,1,1,white);r(9,10,1,1,white) end
  end
end
local sprite=Sprite(32,16,ColorMode.RGB)
sprite.layers[1].name="Shared interchangeable eyes - left and right"
local styles={}
for id=1,30 do
  if id>1 then sprite:newEmptyFrame() end
  local image=Image(32,16,ColorMode.RGB)
  drawEye(image,id,0);drawEye(image,id,1)
  sprite:newCel(sprite.layers[1],id,image,Point(0,0))
  sprite.frames[id].duration=0.5
  local tag=sprite:newTag(id,id);tag.name=string.format("ruby-eye-%02d",id)
  local standalone=Sprite(32,16,ColorMode.RGB);standalone:newCel(standalone.layers[1],1,image,Point(0,0))
  local file=string.format("eye-%02d.png",id);standalone:saveCopyAs(output.."/"..file);standalone:close()
  styles[#styles+1]={id=tag.name,name=names[id],png="/images/ruby-round-v1/eyes/"..file,width=32,height=16,eyeWidth=16,eyeHeight=16}
end
sprite:saveAs(output.."/ruby-round-eyes.aseprite");sprite:close()
local file=assert(io.open(output.."/manifest.json","w"));file:write(json.encode(styles));file:close()
print(json.encode({styles=30,width=32,height=16,aseprite=true}))
