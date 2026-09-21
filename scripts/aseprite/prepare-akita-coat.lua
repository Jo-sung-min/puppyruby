-- Derive editable material layers without redrawing or resizing the active Akita.
-- Fixed pixels include outlines, eyes, mouth, pads, keyboard, food and the hand.
local input=assert(app.params.input);local output=assert(app.params.output)
local s=assert(app.open(input));assert(#s.frames==64 and #s.tags==16)
local w,h=s.width,s.height;local source=s.layers[1];local pc=app.pixelColor
local names={"idle","side","walk","happy","sleep","typing","petting","eat","belly","stretch","wag","scratch","walk-left","walk-right","walk-up","walk-down"}
local fixed=s:newLayer();fixed.name="FixedFront"
local primary=s:newLayer();primary.name="Coat.Primary"
local secondary=s:newLayer();secondary.name="Coat.Secondary"
local maskLayer=s:newLayer();maskLayer.name="CoatMap (R=role G=tone)";maskLayer.isVisible=false
local sourceImages={};local counts={}
local function save(image,file)
 local sp=Sprite(image.width,image.height,ColorMode.RGB);sp:newCel(sp.layers[1],1,image);sp:saveCopyAs(file);sp:close()
end
-- Source-hash-bound frame exclusions are registered by the orchestration script.
local function fixedProp(action,f,x,y)
 if action=="typing" and y>=153 then return true end
 if action=="eat" and y>=158 and x>=47 and x<=129 then return true end
 if action=="petting" then
   -- Follow the underside of the hand. Avoid a rectangular head cutout.
   local edges={{68,55},{77,64},{87,62},{96,72},{106,70},{120,59},{150,27}}
   for i=1,#edges-1 do
    local l,r=edges[i],edges[i+1]
    if x>=l[1] and x<=r[1] and y<=l[2]+(r[2]-l[2])*(x-l[1])/(r[1]-l[1]) then return true end
   end
 end
 return false
end
for actionIndex,action in ipairs(names) do
 local sheet=Image(w*4,h,ColorMode.RGB);local maskSheet=Image(w*4,h,ColorMode.RGB)
 local review=Image(w*4,h,ColorMode.RGB);counts[action]={}
 for f=1,4 do
  local n=(actionIndex-1)*4+f;local original=Image(w,h,ColorMode.RGB);local cel=assert(source:cel(n));original:drawImage(cel.image,cel.position)
  sourceImages[n]=original
  local a,b,c,map=Image(w,h,ColorMode.RGB),Image(w,h,ColorMode.RGB),Image(w,h,ColorMode.RGB),Image(w,h,ColorMode.RGB)
  local count=0
  for y=0,h-1 do for x=0,w-1 do
   local p=original:getPixel(x,y);local r,g,bl,alpha=pc.rgbaR(p),pc.rgbaG(p),pc.rgbaB(p),pc.rgbaA(p)
   local role=0
   if alpha>0 and r>=105 and g>=70 and not fixedProp(action,f,x,y) then
    -- Warm coat only; pink pads/ears/tongue, dark ink and gray props stay fixed.
    if r>=210 and r-g<=25 and g-bl<=35 and g>=bl then role=2
    elseif r>=g and g-bl>=12 and r-g>=3 then role=1 end
   end
   local tone=math.floor((54*r+183*g+19*bl+128)/256)
   map:drawPixel(x,y,pc.rgba(role,tone,0,255))
   if role==1 then b:drawPixel(x,y,p);count=count+1 elseif role==2 then c:drawPixel(x,y,p);count=count+1 else a:drawPixel(x,y,p) end
  end end
  counts[action][f]=count
  s:newCel(fixed,n,a);s:newCel(primary,n,b);s:newCel(secondary,n,c);s:newCel(maskLayer,n,map)
  sheet:drawImage(original,Point((f-1)*w,0));maskSheet:drawImage(map,Point((f-1)*w,0))
  for y=0,h-1 do for x=0,w-1 do
   local p=original:getPixel(x,y);local m=map:getPixel(x,y);local role=pc.rgbaR(m)
   local rgb=role==1 and {225,140,172} or role==2 and {126,211,224} or {pc.rgbaR(p),pc.rgbaG(p),pc.rgbaB(p)}
   review:drawPixel((f-1)*w+x,y,pc.rgba(rgb[1],rgb[2],rgb[3],pc.rgbaA(p)))
  end end
 end
 save(maskSheet,output.."/"..action.."-mask.png");save(review,output.."/"..action.."-mask-review.png")
end
source.name="Original body (archive)";source.isVisible=false
-- Material groups retain exact RGBA source pixels, including antialiased alpha.
-- Eyes stay above the body. All source cels and thirty selectable eyes are retained.
fixed.stackIndex=2;primary.stackIndex=3;secondary.stackIndex=4
s:saveAs(output.."/akita-materials.aseprite")
local out=assert(io.open(output.."/mask-audit.json","w"));out:write(json.encode({width=w,height=h,frames=64,method="Aseprite material separation with pose-specific protected props",counts=counts}));out:close()
s:close()
-- A single reusable pixel accessory, independent of the dog canvas.
local glasses=Image(64,32,ColorMode.RGB);local ink=pc.rgba(57,52,58,255)
local function rect(x,y,w,h) for yy=y,y+h-1 do for xx=x,x+w-1 do glasses:drawPixel(xx,yy,ink) end end end
for _,x in ipairs({3,37}) do
 rect(x+3,5,18,2);rect(x+3,24,18,2);rect(x,8,2,13);rect(x+22,8,2,13)
 rect(x+1,6,3,3);rect(x+20,6,3,3);rect(x+1,21,3,3);rect(x+20,21,3,3)
end
rect(26,13,12,2);save(glasses,output.."/glasses.png")
