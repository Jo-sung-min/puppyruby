-- Akita-only, deterministic trial cleanup. Source masters are never saved.
-- Body pixels use binary alpha for native desktop TransparencyKey compositing.
local input=assert(app.params.input,"input master required")
local output=assert(app.params.output,"output directory required")
local metadata=assert(app.params.metadata,"motion metadata required")
local cutoff=tonumber(app.params.alphaCutoff or "128")
assert(cutoff and cutoff>=64 and cutoff<=192 and cutoff==math.floor(cutoff),"Reviewed binary alpha cutoff required")
local f=assert(io.open(metadata,"r"));local proof=json.decode(f:read("*a"));f:close()
assert(proof.breed=="akita" and proof.frames==64 and proof.editableLayers==31 and #proof.actionOrder==16,"Akita v3 input contract required")
local sprite=assert(app.open(input));local pc=app.pixelColor
assert(#sprite.frames==64 and #sprite.layers==31 and #sprite.tags==16,"Expected 64 frames, 31 layers and 16 tags")
local width,height=sprite.width,sprite.height
assert(width==proof.width and height==proof.height,"Metadata and master dimensions differ")
local function rgba(p) return pc.rgbaR(p),pc.rgbaG(p),pc.rgbaB(p),pc.rgbaA(p) end
local function keyMagenta(p)
  local r,g,b,a=rgba(p)
  return a>0 and r>=120 and b>=120 and math.abs(r-b)<=70 and math.min(r,b)-g>=70
end
local function cyan(p)
  local r,g,b,a=rgba(p);return a>0 and math.min(g,b)-r>=12
end
local function signature(cel)
  local value,count=2166136261,0
  if not cel then return "empty:0" end
  for y=0,cel.image.height-1 do for x=0,cel.image.width-1 do
    local p=cel.image:getPixel(x,y)
    if pc.rgbaA(p)>0 then
      value=((value ~ p)*16777619)&0xffffffff
      value=((value ~ ((cel.position.y+y)*width+cel.position.x+x))*16777619)&0xffffffff
      count=count+1
    end
  end end
  return string.format("%08x:%d",value,count)
end
local function bodyAt(frame)
  local image=Image(width,height,ColorMode.RGB);local cel=assert(sprite.layers[1]:cel(frame))
  image:drawImage(cel.image,cel.position);return image
end
local function writeJson(path,value)
  local file=assert(io.open(path,"w"));file:write(json.encode(value));file:close()
end
local function savePng(image,path)
  local s=Sprite(image.width,image.height,ColorMode.RGB);s:newCel(s.layers[1],1,image,Point(0,0));s:saveCopyAs(path);s:close()
end
local beforeEyes,frameNames,originalModes={},{},{}
local originalTags={}
for n,tag in ipairs(sprite.tags) do originalTags[n]={name=tag.name,from=tag.fromFrame.frameNumber,to=tag.toFrame.frameNumber} end
for frame=1,64 do
  local name=proof.actionOrder[math.floor((frame-1)/4)+1];local localFrame=(frame-1)%4+1
  frameNames[frame]=name;originalModes[frame]=proof.actions[name].eyeModeByFrame[localFrame]
  beforeEyes[frame]={}
  for layer=2,31 do beforeEyes[frame][layer]=signature(sprite.layers[layer]:cel(frame)) end
end
-- Reviewed false cyan sentinel at v3 frame38 over a real closed/winking eyelid.
-- Keep the original body eye ink. Only remove the incorrectly generated overlay.
assert(frameNames[38]=="stretch" and originalModes[38]=="shared","Reviewed frame38 classification no longer matches source")
proof.actions.stretch.eyeModeByFrame[2]="baked-closed";proof.actions.stretch.eyes[2]={}
for layer=2,31 do
  local cel=sprite.layers[layer]:cel(38)
  if cel then sprite:deleteCel(cel) end
end
local audit={version=4,breed="akita",engine="Aseprite",source=input,width=width,height=height,
  alphaCutoff=cutoff,frames=64,layers=31,tags=16,eyeStyles=30,sourcePixelsResized=false,
  bodyPolicy="Alpha below cutoff removed everywhere including enclosed holes; retained alpha set255. Retained RGB unchanged except tightly defined cyan/key hue neutralization.",
  eyePolicy="Existing eye-free fur untouched; no rectangular or elliptical face fills. Frame38 reviewed baked closed; only its shared overlays cleared.",
  correctedEyeModes={{frame=38,action="stretch",actionFrame=2,before="shared",after="baked-closed",reason="Native body contains the intended closed/winking eyelid; false cyan detection created a second shared eye."}},
  beforeAlphaHistogram={},afterAlphaHistogram={},totals={beforePartial=0,afterPartial=0,alphaTrimmed=0,alphaNormalized=0,hueNeutralized=0,retainedRgbUnchanged=0,closedInkRetained=0},perFrame={}}
local bodies,originalBodies={},{},{}
for frame=1,64 do
  local before=bodyAt(frame);originalBodies[frame]=before;local clean=Image(width,height,ColorMode.RGB)
  local action=frameNames[frame];local localFrame=(frame-1)%4+1
  local mode=proof.actions[action].eyeModeByFrame[localFrame]
  local row={frame=frame,action=action,actionFrame=localFrame,eyeMode=mode,beforePartial=0,afterPartial=0,
    alphaTrimmed=0,alphaNormalized=0,hueNeutralized=0,retainedRgbUnchanged=0,closedInkRetained=0,hueEdits={},openEyeDarkCandidates={}}
  for y=0,height-1 do for x=0,width-1 do
    local p=before:getPixel(x,y);local r,g,b,a=rgba(p)
    local histKey=tostring(a);audit.beforeAlphaHistogram[histKey]=(audit.beforeAlphaHistogram[histKey] or 0)+1
    local after=0
    if a>0 and a<255 then row.beforePartial=row.beforePartial+1 end
    if a>0 and a<cutoff then row.alphaTrimmed=row.alphaTrimmed+1
    elseif a>=cutoff then
      if a<255 then row.alphaNormalized=row.alphaNormalized+1 end
      local rr,gg,bb=r,g,b
      if keyMagenta(p) or cyan(p) then
        -- Akita's body has no cyan or magenta markings. Preserve luminance and
        -- geometry rather than deleting dark facial ink or creating white holes.
        local gray=math.floor(r*.2126+g*.7152+b*.0722+.5);rr=gray;gg=gray;bb=gray
        row.hueNeutralized=row.hueNeutralized+1
        row.hueEdits[#row.hueEdits+1]={x=x,y=y,before={r,g,b,a},after={rr,gg,bb,255}}
      else row.retainedRgbUnchanged=row.retainedRgbUnchanged+1 end
      after=pc.rgba(rr,gg,bb,255)
      if mode~="shared" and math.max(r,g,b)<90 then
        assert((rr==r and gg==g and bb==b) or (cyan(p) and rr==gg and gg==bb and rr<90),"Closed-expression dark ink must retain its shape and luminance")
        row.closedInkRetained=row.closedInkRetained+1
      end
    end
    clean:drawPixel(x,y,after)
    local aa=pc.rgbaA(after);local afterKey=tostring(aa);audit.afterAlphaHistogram[afterKey]=(audit.afterAlphaHistogram[afterKey] or 0)+1
    assert(aa==0 or aa==255,"Fractional alpha remained")
    assert(not keyMagenta(after) and not cyan(after),"Opaque body key/cyan remained")
  end end
  if mode=="shared" then
    for _,anchor in ipairs(proof.actions[action].eyes[localFrame]) do
      for y=anchor.y,anchor.y+anchor.height-1 do for x=anchor.x,anchor.x+anchor.width-1 do
        local r,g,b,a=rgba(clean:getPixel(x,y))
        if a>0 and math.max(r,g,b)<90 then row.openEyeDarkCandidates[#row.openEyeDarkCandidates+1]={x=x,y=y,rgb={r,g,b}} end
      end end
    end
    assert(#row.openEyeDarkCandidates==0,"Unexpected baked dark eye ink in shared frame "..frame.."; requires local visual review rather than broad face erasure")
  end
  bodies[frame]=clean
  local old=assert(sprite.layers[1]:cel(frame));sprite:deleteCel(old);sprite:newCel(sprite.layers[1],frame,clean,Point(0,0))
  audit.perFrame[#audit.perFrame+1]=row
  for key in pairs(audit.totals) do audit.totals[key]=audit.totals[key]+(row[key] or 0) end
end
local expectedBodies={}
for frame=1,64 do expectedBodies[frame]=signature(sprite.layers[1]:cel(frame)) end
for layer=2,31 do
  for frame=1,64 do
    local name=frameNames[frame];local mode=proof.actions[name].eyeModeByFrame[(frame-1)%4+1]
    local actual=signature(sprite.layers[layer]:cel(frame))
    if frame~=38 then assert(actual==beforeEyes[frame][layer],"Shared eye layer changed unexpectedly") end
    if mode~="shared" then assert(actual=="empty:0" or actual=="811c9dc5:0","Closed/hidden frame retained a shared eye overlay") end
  end
end
app.activeSprite=sprite;sprite:saveAs(output.."/akita-cleaned.aseprite")
sprite:close();sprite=assert(app.open(output.."/akita-cleaned.aseprite"))
assert(#sprite.layers==31 and #sprite.frames==64 and #sprite.tags==16,"Reopened master structure changed")
for n,tag in ipairs(sprite.tags) do assert(tag.name==originalTags[n].name and tag.fromFrame.frameNumber==originalTags[n].from and tag.toFrame.frameNumber==originalTags[n].to,"Tag changed after save") end
for frame=1,64 do
  assert(signature(sprite.layers[1]:cel(frame))==expectedBodies[frame],"Saved body differs from checked pixels")
  for layer=2,31 do
    local actual=signature(sprite.layers[layer]:cel(frame))
    if frame~=38 then assert(actual==beforeEyes[frame][layer],"Saved eye layer differs from source")
    else assert(actual=="empty:0" or actual=="811c9dc5:0","Corrected frame regained eye overlays") end
  end
end
audit.savedMasterVerified=true;audit.sharedEyeLayersPreservedExceptFrame38=true
local function composed(frame,original)
  local image=Image(original and originalBodies[frame] or bodies[frame])
  if not original then local cel=sprite.layers[2]:cel(frame);if cel then image:drawImage(cel.image,cel.position) end end
  return image
end
local contactBody=Image(width*4,height*16,ColorMode.RGB)
local contact=Image(width*4,height*16,ColorMode.RGB)
for n,name in ipairs(proof.actionOrder) do
  local body=Image(width*4,height,ColorMode.RGB);local preview=Image(width*4,height,ColorMode.RGB)
  local animation=Sprite(width,height,ColorMode.RGB)
  for col=1,4 do
    local frame=(n-1)*4+col;local point=Point((col-1)*width,0);local image=composed(frame,false)
    body:drawImage(bodies[frame],point);preview:drawImage(image,point)
    contactBody:drawImage(bodies[frame],Point((col-1)*width,(n-1)*height));contact:drawImage(image,Point((col-1)*width,(n-1)*height))
    if col>1 then animation:newEmptyFrame() end
    animation:newCel(animation.layers[1],col,image,Point(0,0));animation.frames[col].duration=sprite.frames[frame].duration
  end
  savePng(body,output.."/"..name..".png");savePng(preview,output.."/"..name.."-default.png")
  animation:saveCopyAs(output.."/"..name..".gif");animation:close()
end
savePng(contactBody,output.."/contact-body.png");savePng(contact,output.."/contact-transparent.png")
local backgrounds={{id="dark",color=pc.rgba(24,25,31,255)},{id="light",color=pc.rgba(247,245,238,255)}}
for _,background in ipairs(backgrounds) do
  local board=Image(contact.width,contact.height,ColorMode.RGB)
  for it in board:pixels() do it(background.color) end
  board:drawImage(contact,Point(0,0));savePng(board,output.."/contact-"..background.id..".png")
  for page=0,3 do
    local small=Image(width*4,height*4,ColorMode.RGB)
    for it in small:pixels() do it(background.color) end
    small:drawImage(contact,Point(0,-page*height*4));savePng(small,output.."/contact-"..background.id.."-"..(page+1)..".png")
  end
end
local preview=Sprite(width,height,ColorMode.RGB)
for frame=1,64 do
  if frame>1 then preview:newEmptyFrame() end
  preview:newCel(preview.layers[1],frame,composed(frame,false),Point(0,0));preview.frames[frame].duration=sprite.frames[frame].duration
end
preview:saveCopyAs(output.."/preview.gif");preview:close()
-- Aseprite json.decode returns nested userdata. Reconstruct primitive Lua
-- tables explicitly; assigning those nodes into a new encode returns null.
local exportedActions,exportedOrder={},{}
for _,name in ipairs(proof.actionOrder) do
  exportedOrder[#exportedOrder+1]=name
  local action=proof.actions[name];local eyes,modes={},{}
  for frame=1,4 do
    modes[frame]=action.eyeModeByFrame[frame];eyes[frame]={}
    for _,anchor in ipairs(action.eyes[frame]) do eyes[frame][#eyes[frame]+1]={x=anchor.x,y=anchor.y,width=anchor.width,height=anchor.height} end
  end
  exportedActions[name]={id=name,png=name..".png",frames=4,frameMs=action.frameMs,eyeMode=action.eyeMode,eyeModeByFrame=modes,eyes=eyes,kind=action.kind,source=action.source,name=action.name,description=action.description}
end
local manifest={version=4,stage="akita-trial-cleaned",breed="akita",width=width,height=height,frames=64,framesPerAction=4,
  editableLayers=31,eyeStyles=30,actions=exportedActions,actionOrder=exportedOrder,
  master="akita-cleaned.aseprite",provenance="Existing v3 native art cleaned in Aseprite; no pose redrawing or asset replacement at this stage.",alpha="binary",eyeModeCorrection={frame=38,mode="baked-closed"}}
for _,name in ipairs(manifest.actionOrder) do manifest.actions[name].png=name..".png" end
writeJson(output.."/manifest.json",manifest);writeJson(output.."/cleanup-audit.json",audit)
sprite:close();print(json.encode({output=output,frames=64,layers=31,tags=16,totals=audit.totals,complete=true}))
