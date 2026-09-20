-- Read-only review exports from the edited master, including its visible common eyes.
local planFile=assert(io.open(assert(app.params.plan,"plan required"),"r"))
local plan=json.decode(planFile:read("*a"));planFile:close()
local output=assert(app.params.output,"output required")
local names={"idle","side","walk","happy","sleep","typing","petting","eat","belly","stretch","wag","scratch","walk-left","walk-right","walk-up","walk-down"}
local pc=app.pixelColor
local report={version=1,engine="Aseprite",nativeResolution=true,complete=false,composite="Body plus visible common default eyes",breeds={},pages={}}
local function saveReport()
  local out=assert(io.open(output.."/review-inventory.json","w"));out:write(json.encode(report));out:close()
end
local function savePng(image,path)
  local s=Sprite(image.width,image.height,ColorMode.RGB);s:newCel(s.layers[1],1,image,Point(0,0));s:saveCopyAs(path);s:close()
end
local function compose(sprite,frame)
  local image=Image(sprite.width,sprite.height,ColorMode.RGB)
  for _,layer in ipairs(sprite.layers) do
    if layer.isVisible then
      local cel=layer:cel(frame)
      if cel then image:drawImage(cel.image,cel.position,cel.opacity) end
    end
  end
  return image
end
local all={}
for _,entry in ipairs(plan.breeds) do
  local source=assert(app.open(entry.master),"Missing master: "..entry.breed)
  assert(#source.frames==64 and #source.tags==16 and #source.layers==31,"Unexpected review master shape")
  local visible=0
  for _,layer in ipairs(source.layers) do if layer.isVisible then visible=visible+1 end end
  assert(visible==2,"Review must show the body plus exactly one common-eye layer")
  assert(source.layers[2].isVisible and source.layers[2].name=="Eyes - ruby-eye-01","Review common default eyes must be selected")
  local frames={}
  local width,height=source.width,source.height
  local full=Image(width*4,height*16,ColorMode.RGB)
  local cyan={strong=0,fringe=0,frames={}}
  for frame=1,64 do
    local image=compose(source,frame);frames[frame]=image
    full:drawImage(image,Point((frame-1)%4*width,math.floor((frame-1)/4)*height))
    local strong,fringe=0,0
    local fringePixels={}
    for y=0,height-1 do for x=0,width-1 do
      local p=image:getPixel(x,y);local r,g,b,a=pc.rgbaR(p),pc.rgbaG(p),pc.rgbaB(p),pc.rgbaA(p)
      if a>0 and math.min(g,b)-r>=12 then fringe=fringe+1;fringePixels[#fringePixels+1]={x=x,y=y,rgba={r,g,b,a}} end
      if a>=128 and g>=150 and b>=150 and r<=110 and math.min(g,b)-r>=90 then strong=strong+1 end
    end end
    cyan.strong=cyan.strong+strong;cyan.fringe=cyan.fringe+fringe
    if strong>0 or fringe>0 then cyan.frames[#cyan.frames+1]={frame=frame,action=names[math.floor((frame-1)/4)+1],strong=strong,fringe=fringe,fringePixels=fringePixels} end
  end
  local breedOut=output.."/"..entry.breed
  savePng(full,breedOut.."-16-actions.png")
  for panel=0,3 do
    local board=Image(width*4,height*4,ColorMode.RGB)
    for localFrame=1,16 do board:drawImage(frames[panel*16+localFrame],Point((localFrame-1)%4*width,math.floor((localFrame-1)/4)*height)) end
    savePng(board,breedOut.."-actions-"..(panel*4+1).."-"..(panel*4+4)..".png")
  end
  for action=1,entry.reuseGifs and 0 or 16 do
    local animation=Sprite(width,height,ColorMode.RGB)
    for col=1,4 do
      if col>1 then animation:newEmptyFrame() end
      local frame=(action-1)*4+col
      animation:newCel(animation.layers[1],col,frames[frame],Point(0,0))
      animation.frames[col].duration=source.frames[frame].duration
    end
    animation:saveCopyAs(breedOut.."-"..names[action]..".gif");animation:close()
  end
  report.breeds[#report.breeds+1]={breed=entry.breed,width=width,height=height,masterSha256=entry.masterSha256,actions=names,cyanCandidates=cyan}
  saveReport()
  all[#all+1]={breed=entry.breed,width=width,height=height,frames=frames}
  source:close()
end
for page=1,math.ceil(#all/6) do
  local start=(page-1)*6+1;local finish=math.min(#all,start+5);local maxWidth,maxHeight=0,0
  for i=start,finish do maxWidth=math.max(maxWidth,all[i].width);maxHeight=math.max(maxHeight,all[i].height) end
  local gap=12;local board=Image(maxWidth*2+gap,maxHeight*(finish-start+1)+gap*(finish-start),ColorMode.RGB)
  local rows={}
  for i=start,finish do
    local entry=all[i];local y=(i-start)*(maxHeight+gap)
    board:drawImage(entry.frames[35],Point(math.floor((maxWidth-entry.width)/2),y))
    board:drawImage(entry.frames[36],Point(maxWidth+gap+math.floor((maxWidth-entry.width)/2),y))
    rows[#rows+1]={breed=entry.breed,frameNumbers={35,36},x={math.floor((maxWidth-entry.width)/2),maxWidth+gap+math.floor((maxWidth-entry.width)/2)},y=y,width=entry.width,height=entry.height}
  end
  local filename=string.format("belly-paws-page-%02d.png",page);savePng(board,output.."/"..filename)
  report.pages[#report.pages+1]={png=filename,rows=rows}
end
report.complete=true;saveReport()
print("Composited native review exports for "..#all.." breeds")
