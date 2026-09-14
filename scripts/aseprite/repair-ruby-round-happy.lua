-- Merge only reviewed greeting cells. All other source pixels stay identical.
local before=assert(app.open(assert(app.params.input)))
local edited=assert(app.open(assert(app.params.edited)))
local file=assert(io.open(assert(app.params.proof),"r"))
local proof=json.decode(file:read("*a"));file:close()
assert(before.width==edited.width and before.height==edited.height,"Corrected atlas must preserve native dimensions")
local original=Image(before);local patch=Image(edited);local merged=Image(original)
local cuts=proof.gridBoundaries.xByRow[4]
local top,bottom=proof.gridBoundaries.y[4],proof.gridBoundaries.y[5]-1
local left,right=cuts[2],cuts[5]-1
assert(top>=0 and bottom<before.height and left>=0 and right<before.width,"Happy repair outside atlas")
local changed=0
for y=top,bottom do for x=left,right do
  local p=patch:getPixel(x,y)
  if p~=original:getPixel(x,y) then changed=changed+1 end
  merged:drawPixel(x,y,p)
end end
assert(changed>0,"Happy correction has no changed artwork")
for y=0,before.height-1 do for x=0,before.width-1 do
  if y<top or y>bottom or x<left or x>right then assert(merged:getPixel(x,y)==original:getPixel(x,y),"Unrelated artwork changed") end
end end
local output=Sprite(before.width,before.height,ColorMode.RGB)
output:newCel(output.layers[1],1,merged,Point(0,0));output:saveCopyAs(assert(app.params.output));output:close()
edited:close();before:close()
local report=assert(io.open(assert(app.params.report),"w"))
report:write(json.encode({left=left,top=top,right=right,bottom=bottom,changedPixels=changed,unchangedOutsideRepair=true,tool="Aseprite",scene="happy",frames={2,3,4}}));report:close()
print("Happy anatomy repair merged without changing unrelated source frames")
