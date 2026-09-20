-- R2-only frontal/rear gait correction. Keep the selected head/upper body;
-- articulate lower legs with fixed-size feet and a one-pixel passing bob.
local input=assert(app.params.input);local out=assert(app.params.output)
local s=assert(app.open(input));local w,h=s.width,s.height;local pc=app.pixelColor
assert(w==179 and h==188 and #s.frames==64 and #s.layers==31)
local function full(layer,n) local im=Image(w,h,ColorMode.RGB);local cel=layer:cel(n);if cel then im:drawImage(cel.image,cel.position) end;return im end
local function save(im,path) local p=Sprite(im.width,im.height,ColorMode.RGB);p:newCel(p.layers[1],1,im,Point(0,0));p:saveCopyAs(path);p:close() end
local untouched={};for n=1,56 do untouched[n]=full(s.layers[1],n).bytes end
local audit={source=input,scope='R2 vertical walk only',cutY=132,splitX=89,fixedFootHeight=10,actions={}}
for _,a in ipairs({{id='walk-up',start=57,targets={{168,178},{173,176},{178,168},{176,173}}},{id='walk-down',start=61,targets={{178,168},{176,173},{168,178},{173,176}}}}) do
  local base=full(s.layers[1],a.start);local baseEyes={}
  for layer=2,31 do baseEyes[layer]=full(s.layers[layer],a.start) end
  local cut=132;local bottom={0,0}
  for y=cut,h-1 do for x=0,w-1 do if pc.rgbaA(base:getPixel(x,y))>0 then local half=x<89 and 1 or 2;bottom[half]=math.max(bottom[half],y) end end end
  assert(bottom[1]>cut+20 and bottom[2]>cut+20,'No source legs')
  local row={sourceFrame=a.start,sourceBottoms=bottom,frames={}}
  local bodyStrip=Image(w*4,h,ColorMode.RGB);local preview=Image(w*4,h,ColorMode.RGB)
  for n=1,4 do
    local bob=(n==2 or n==4) and -1 or 0
    local im=Image(w,h,ColorMode.RGB)
    for y=0,cut-1 do for x=0,w-1 do if y+bob>=0 then im:drawPixel(x,y+bob,base:getPixel(x,y)) end end end
    for half=1,2 do
      local x0,x1=half==1 and 0 or 89,half==1 and 88 or w-1
      local targetBottom=a.targets[n][half];local fixedFoot=10
      local sourceFootTop=bottom[half]-fixedFoot+1;local targetFootTop=targetBottom-fixedFoot+1
      local anchor=cut+bob
      for y=anchor,targetBottom do
        local sy
        if y>=targetFootTop then sy=sourceFootTop+(y-targetFootTop)
        else sy=cut+math.floor((y-anchor)*(sourceFootTop-cut)/(targetFootTop-anchor)) end
        sy=math.min(bottom[half],math.max(cut,sy))
        for x=x0,x1 do im:drawPixel(x,y,base:getPixel(x,sy)) end
      end
    end
    -- This is leg articulation, not a character redraw: the upper-body source
    -- is exact, with the same one-pixel translation applied to shared eyes.
    for y=1,cut-1 do for x=0,w-1 do assert(im:getPixel(x,y+bob)==base:getPixel(x,y),'Upper body changed') end end
    local frame=a.start+n-1
    for layer=1,31 do local cel=s.layers[layer]:cel(frame);if cel then s:deleteCel(cel) end end
    s:newCel(s.layers[1],frame,im,Point(0,0));s.frames[frame].duration=.14
    local composite=Image(im)
    if a.id=='walk-down' then
      for layer=2,31 do
        local eye=Image(w,h,ColorMode.RGB);eye:drawImage(baseEyes[layer],Point(0,bob));s:newCel(s.layers[layer],frame,eye,Point(0,0))
        if layer==2 then composite:drawImage(eye) end
      end
    end
    bodyStrip:drawImage(im,Point((n-1)*w,0));preview:drawImage(composite,Point((n-1)*w,0))
    row.frames[n]={phase=n,bob=bob,leftFootBottom=a.targets[n][1],rightFootBottom=a.targets[n][2]}
  end
  audit.actions[a.id]=row;save(bodyStrip,out..'/'..a.id..'.png');save(preview,out..'/'..a.id..'-preview.png')
end
for n,bytes in pairs(untouched) do assert(full(s.layers[1],n).bytes==bytes,'Unrelated frame changed') end
s:saveAs(out..'/akita-vertical.aseprite')
local f=assert(io.open(out..'/vertical-gait-audit.json','w'));f:write(json.encode(audit));f:close()
s:close();print(json.encode({complete=true,output=out,changedFrames=8,otherFramesUnchanged=56}))
