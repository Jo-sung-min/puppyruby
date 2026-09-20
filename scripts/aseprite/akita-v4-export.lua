-- Export an already-reviewed native Akita master. This script does not redraw,
-- resize, quantize, polish or publish artwork. Use a fresh staging output folder.
-- Params: input=<polished .aseprite> metadata=<redrawn manifest.json> output=<staging>
local input=assert(app.params.input,"input master required")
local metadata=assert(app.params.metadata,"metadata manifest required")
local output=assert(app.params.output,"output staging directory required")
local function normalized(path) return path:gsub("\\","/"):gsub("/+$",""):lower() end
assert(not normalized(output):match("/akita%-trial/final$"),"Export to a staging folder; current final must not be overwritten")
assert(not normalized(output):match("/akita%-trial/review$"),"Review output is not an export destination")
assert(normalized(input)~=normalized(output.."/akita-v4.aseprite"),"Export cannot overwrite the input master")
assert(app.fs.isDirectory(output),"Create the staging output directory first")
local file=assert(io.open(metadata,"r"));local metadataText=file:read("*a");file:close()
local decoded=json.decode(metadataText)
local names={"idle","side","walk","happy","sleep","typing","petting","eat","belly","stretch","wag","scratch","walk-left","walk-right","walk-up","walk-down"}

local function primitive(value,label)
  local kind=type(value)
  assert(kind=="nil" or kind=="string" or kind=="number" or kind=="boolean","Expected primitive metadata field: "..label)
  return value
end
local function copyFields(from,to,fields)
  for _,key in ipairs(fields) do local value=from[key];if value~=nil then to[key]=primitive(value,key) end end
end
-- json.decode containers are Aseprite userdata. Explicitly copy every exported
-- schema array/object into ordinary Lua tables; never feed decoded nodes to encode.
local manifest={actionOrder={},actions={}}
copyFields(decoded,manifest,{"schemaVersion","version","trialVersion","revision","stage","breed","name","width","height","alpha","frames","framesPerAction","editableLayers","eyeStyles"})
-- Trial provenance is a flat object. Read known primitive fields directly;
-- Aseprite wraps decoded containers (and root JSON strings) as userdata.
manifest.provenance={}
if decoded.provenance~=nil then
  copyFields(decoded.provenance,manifest.provenance,{"scope","base","assembly","anatomy","eyes","outline","rightWalk","source","reference","review","alpha","canvas","method","tool"})
end
assert(manifest.breed=="akita","Only Akita trial metadata is accepted")
assert(type(manifest.revision)=="number" and manifest.revision>=2 and manifest.revision<math.huge and manifest.revision==math.floor(manifest.revision),"Expected an integer trial revision >= 2")
assert(#decoded.actionOrder==16,"Expected exactly 16 actions")
for index,id in ipairs(names) do
  assert(decoded.actionOrder[index]==id,"Canonical action order changed: "..id)
  manifest.actionOrder[index]=id
  local source=assert(decoded.actions[id],"Missing action "..id)
  local action={id=id,png=id..".png",eyes={},eyeModeByFrame={}}
  copyFields(source,action,{"frames","frameMs","name","description","eyeMode","kind","source"})
  assert(action.frames==4 and type(action.frameMs)=="number" and action.frameMs>=40 and action.frameMs<=5000,"Invalid action timing: "..id)
  assert(#source.eyes==4 and #source.eyeModeByFrame==4,"Four eye-frame records required: "..id)
  for frame=1,4 do
    action.eyeModeByFrame[frame]=primitive(source.eyeModeByFrame[frame],"eyeModeByFrame")
    assert(action.eyeModeByFrame[frame]=="shared" or action.eyeModeByFrame[frame]=="baked-closed" or action.eyeModeByFrame[frame]=="hidden","Unexpected eye mode: "..id)
    action.eyes[frame]={}
    for _,anchor in ipairs(source.eyes[frame]) do
      local eye={};copyFields(anchor,eye,{"x","y","width","height"})
      assert(type(eye.x)=="number" and type(eye.y)=="number" and type(eye.width)=="number" and type(eye.height)=="number","Invalid eye anchor: "..id)
      assert(eye.x>=0 and eye.y>=0 and eye.width>0 and eye.height>0 and eye.x+eye.width<=manifest.width and eye.y+eye.height<=manifest.height,"Eye outside frame: "..id)
      action.eyes[frame][#action.eyes[frame]+1]=eye
    end
    assert(#action.eyes[frame]<=2,"Too many eye anchors: "..id)
    if action.eyeModeByFrame[frame]~="shared" then assert(#action.eyes[frame]==0,"Hidden/closed frame has shared eye anchors: "..id) end
  end
  manifest.actions[id]=action
end

local master=assert(app.open(input),"Could not open polished master")
local w,h=master.width,master.height
assert(master.colorMode==ColorMode.RGB and w==179 and h==188,"Expected the native 179 x 188 RGBA Akita canvas")
assert(manifest.width==w and manifest.height==h,"Metadata dimensions differ from master")
assert(#master.frames==64 and #master.layers==31 and #master.tags==16,"Expected 64 frames, 31 layers, 16 tags")
for index,id in ipairs(names) do
  local tag=master.tags[index]
  assert(tag.name==id and tag.fromFrame.frameNumber==(index-1)*4+1 and tag.toFrame.frameNumber==index*4,"Tag contract differs from metadata: "..id)
end
for index,layer in ipairs(master.layers) do assert(not layer.isGroup,"Export expects 31 flat editable layers") end
assert(manifest.actions.stretch.eyeModeByFrame[2]=="baked-closed" and #manifest.actions.stretch.eyes[2]==0,"Closed stretch frame 38 metadata changed")
for layer=2,31 do assert(not master.layers[layer]:cel(38),"Closed frame 38 must not have eye cels") end

local function full(layer,frame)
  local image=Image(w,h,ColorMode.RGB)
  local cel=layer:cel(frame)
  if cel then image:drawImage(cel.image,cel.position) end
  return image
end
local function bytes(image)
  assert(type(image.bytes)=="string","Image.bytes API is required")
  assert(#image.bytes==image.width*image.height*4,"Unexpected RGBA byte length")
  return image.bytes
end
local function hasNoInk(cel)
  if not cel then return true end
  -- Existing masters may retain an empty eye cel on closed frames. Consume
  -- complete RGBA groups whose alpha is zero in the native string matcher;
  -- visible ink leaves bytes behind, without a per-pixel Lua/getPixel loop.
  local remaining=bytes(cel.image):gsub("...%z","")
  return #remaining==0
end
local function savePng(image,path)
  local sprite=Sprite(image.width,image.height,ColorMode.RGB)
  sprite:newCel(sprite.layers[1],1,image,Point(0,0));sprite:saveCopyAs(path);sprite:close()
  local reopened=assert(app.open(path),"Could not reopen exported PNG")
  local same=reopened.width==image.width and reopened.height==image.height and bytes(Image(reopened))==bytes(image)
  reopened:close();assert(same,"Exported PNG changed pixels: "..path)
end
local report={schemaVersion=1,breed="akita",revision=manifest.revision,input=input,metadata=metadata,output=output,
  width=w,height=h,actions=16,frames=64,layers=31,tags=16,framesPerAction=4,bodyPartialAlphaPixels=0,
  bodyOpaquePixels=0,bodyTransparentPixels=0,savedCelComparisons=0,savedMasterVerified=false,
  closedFrame38HasNoEyeCels=true,transparentClosedEyeCels=0,pngPixelComparisons=0,gifFramesVerified=0,perAction={}}
local board=Image(w*4,h*16,ColorMode.RGB)
for actionIndex,id in ipairs(names) do
  local strip=Image(w*4,h,ColorMode.RGB)
  local composedStrip=Image(w*4,h,ColorMode.RGB)
  local animation=Sprite(w,h,ColorMode.RGB)
  local action=manifest.actions[id]
  for frame=1,4 do
    local number=(actionIndex-1)*4+frame
    assert(master.layers[1]:cel(number),"Missing body cel: "..number)
    local body=full(master.layers[1],number)
    local rgba=bytes(body)
    -- Only the 2,153,728 body alpha bytes are visited in Lua. All layer-pixel
    -- round trips below use native byte-string comparisons, not 60M getPixel calls.
    for position=4,#rgba,4 do
      local alpha=rgba:byte(position)
      if alpha==255 then report.bodyOpaquePixels=report.bodyOpaquePixels+1
      elseif alpha==0 then report.bodyTransparentPixels=report.bodyTransparentPixels+1
      else report.bodyPartialAlphaPixels=report.bodyPartialAlphaPixels+1 end
    end
    assert(math.floor(master.frames[number].duration*1000+.5)==action.frameMs,"Frame timing differs from metadata: "..number)
    for layer=2,31 do
      if action.eyeModeByFrame[frame]~="shared" then
        local eyeCel=master.layers[layer]:cel(number)
        assert(hasNoInk(eyeCel),"Closed/hidden frame has visible shared-eye ink: frame "..number..", layer "..layer)
        if eyeCel then report.transparentClosedEyeCels=report.transparentClosedEyeCels+1 end
      else assert(master.layers[layer]:cel(number),"Open frame missing an editable eye style: "..number) end
    end
    strip:drawImage(body,Point((frame-1)*w,0))
    local composed=Image(body);composed:drawImage(full(master.layers[2],number))
    composedStrip:drawImage(composed,Point((frame-1)*w,0));board:drawImage(composed,Point((frame-1)*w,(actionIndex-1)*h))
    if frame>1 then animation:newEmptyFrame() end
    animation:newCel(animation.layers[1],frame,composed,Point(0,0));animation.frames[frame].duration=master.frames[number].duration
  end
  assert(report.bodyPartialAlphaPixels==0,"Body alpha must be 0 or 255; finish cleanup before exporting")
  savePng(strip,output.."/"..id..".png");savePng(composedStrip,output.."/"..id.."-preview.png")
  report.pngPixelComparisons=report.pngPixelComparisons+2
  animation:saveCopyAs(output.."/"..id..".gif");animation:close()
  local gif=assert(app.open(output.."/"..id..".gif"));assert(gif.width==w and gif.height==h and #gif.frames==4,"GIF dimensions/frame count changed: "..id)
  report.gifFramesVerified=report.gifFramesVerified+#gif.frames;gif:close()
  report.perAction[id]={frames=4,frameMs=action.frameMs,body=id..".png",preview=id.."-preview.png",gif=id..".gif"}
end
savePng(board,output.."/all-16-actions.png");report.pngPixelComparisons=report.pngPixelComparisons+1
app.activeSprite=master;master:saveAs(output.."/akita-v4.aseprite")
local reopened=assert(app.open(output.."/akita-v4.aseprite"))
assert(reopened.width==w and reopened.height==h and #reopened.frames==64 and #reopened.layers==31 and #reopened.tags==16,"Saved master shape changed")
for layer=1,31 do
  assert(reopened.layers[layer].name==master.layers[layer].name and reopened.layers[layer].isVisible==master.layers[layer].isVisible,"Saved layer metadata changed")
  for frame=1,64 do
    local before,after=master.layers[layer]:cel(frame),reopened.layers[layer]:cel(frame)
    assert((before==nil)==(after==nil),"Saved cel presence changed")
    if before then
      assert(before.position.x==after.position.x and before.position.y==after.position.y,"Saved cel position changed")
      assert(before.image.width==after.image.width and before.image.height==after.image.height and bytes(before.image)==bytes(after.image),"Saved cel RGBA changed")
    end
    report.savedCelComparisons=report.savedCelComparisons+1
  end
end
for frame=1,64 do assert(math.abs(reopened.frames[frame].duration-master.frames[frame].duration)<.00001,"Saved frame timing changed") end
for index,id in ipairs(names) do
  local tag=reopened.tags[index];assert(tag.name==id and tag.fromFrame.frameNumber==(index-1)*4+1 and tag.toFrame.frameNumber==index*4,"Saved action tag changed")
end
for layer=2,31 do assert(not reopened.layers[layer]:cel(38),"Saved closed frame 38 gained an eye overlay") end
report.savedMasterVerified=true
manifest.master="akita-v4.aseprite";manifest.frames=64;manifest.framesPerAction=4;manifest.editableLayers=31;manifest.eyeStyles=30;manifest.alpha="binary"
local function write(path,value) local f=assert(io.open(path,"w"));f:write(json.encode(value));f:close() end
write(output.."/manifest.json",manifest);write(output.."/export-audit.json",report)
reopened:close();master:close()
print(json.encode({complete=true,output=output,revision=manifest.revision,frames=64,layers=31,tags=16,partialAlphaPixels=report.bodyPartialAlphaPixels,savedCelComparisons=report.savedCelComparisons}))
