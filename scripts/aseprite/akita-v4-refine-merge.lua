-- Merge native gait edits into the user's selected revision-2 Akita.
-- All 44 non-walking body frames and their eye layers stay byte-exact here;
-- the separate contour pass may subsequently thin connected exterior ink.
local input=assert(app.params.input)
local gaitPath=assert(app.params.gait)
local verticalPath=assert(app.params.vertical)
local out=assert(app.params.output)
local base=assert(app.open(input));local gait=assert(app.open(gaitPath));local vertical=assert(app.open(verticalPath))
local function validate(s) assert(s.width==179 and s.height==188 and #s.frames==64 and #s.layers==31 and #s.tags==16) end
validate(base);validate(gait);validate(vertical)
local function full(s,l,n) local im=Image(179,188,ColorMode.RGB);local cel=s.layers[l]:cel(n);if cel then im:drawImage(cel.image,cel.position) end;return im end
local changed={};for _,range in ipairs({{9,12},{49,64}}) do for n=range[1],range[2] do changed[n]=true end end
local original={}
for n=1,64 do if not changed[n] then original[n]={};for l=1,31 do original[n][l]=full(base,l,n).bytes end end end
for n=1,64 do
  if changed[n] then
    local source=n>=57 and vertical or gait
    for l=1,31 do
      local old=base.layers[l]:cel(n);if old then base:deleteCel(old) end
      local cel=source.layers[l]:cel(n)
      if cel then base:newCel(base.layers[l],n,Image(cel.image),Point(cel.position.x,cel.position.y)) end
      assert(full(base,l,n).bytes==full(source,l,n).bytes,'Gait layer copy mismatch')
    end
    base.frames[n].duration=source.frames[n].duration
  end
end
local comparisons=0
for n,layers in pairs(original) do for l,bytes in pairs(layers) do assert(full(base,l,n).bytes==bytes,'Non-walking frame changed');comparisons=comparisons+1 end end
for l=2,31 do assert(not base.layers[l]:cel(38),'Closed stretch eye duplication') end
base:saveAs(out..'/akita-v4.aseprite')
local audit={base=input,gait=gaitPath,vertical=verticalPath,scope='Selected revision 2 with walking corrections only before contour refinement',changedFrameSlots=20,unchangedFrameSlots=44,unchangedLayerComparisons=comparisons,frames=64,layers=31,tags=16,complete=true}
local f=assert(io.open(out..'/merge-audit.json','w'));f:write(json.encode(audit));f:close()
base:close();gait:close();vertical:close();print(json.encode(audit))
