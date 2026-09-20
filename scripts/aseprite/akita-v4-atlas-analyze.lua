-- Read-only source-atlas analysis in Aseprite. Does not alter any source/master.
-- Params: input=<RGBA PNG>, rows=2|4, output=<existing analysis directory>.
local input=assert(app.params.input,"input PNG required")
local rows=assert(tonumber(app.params.rows),"rows required")
local output=assert(app.params.output,"output directory required")
assert(rows==2 or rows==4,"Only two-row or four-row atlases are supported")
assert(app.fs.isDirectory(output),"Create output directory before analysis")
local source=assert(app.open(input),"Source atlas could not be opened")
assert(source.colorMode==ColorMode.RGB,"Source must be RGBA")
local image=Image(source)
local sw,sh=source.width,source.height
local columns,nw,nh=4,179,188
assert(sw>=columns*32 and sh>=rows*32 and sw<=8192 and sh<=8192,"Source dimensions are outside the analysis bounds")
local rgba=image.bytes
assert(type(rgba)=="string" and #rgba==sw*sh*4,"RGBA Image.bytes API required")
-- Find empty horizontal bands before choosing row boundaries. Some generated
-- petting hands extend above a nominal quarter-height row; an empty-band cut
-- preserves the entire prop instead of assigning it to the preceding action.
local occupancy={}
for y=0,sh-1 do
  local count=0
  for x=0,sw-1 do if rgba:byte((y*sw+x)*4+4)>=128 then count=count+1 end end
  occupancy[y+1]=count
end
local gaps={};local gapStart=nil
for y=0,sh do
  if y<sh and occupancy[y+1]==0 then if not gapStart then gapStart=y end
  elseif gapStart then
    gaps[#gaps+1]={from=gapStart,to=y-1,height=y-gapStart,center=(gapStart+y-1)/2,edge=(gapStart==0 or y==sh)}
    gapStart=nil
  end
end
local suggested={0}
for row=1,rows-1 do
  local expected=row*sh/rows;local best=nil
  for _,gap in ipairs(gaps) do
    if not gap.edge and gap.height>=2 and math.abs(gap.center-expected)<=sh/rows*.4 and gap.center>suggested[#suggested]+32 then
      if not best or gap.height>best.height or (gap.height==best.height and math.abs(gap.center-expected)<math.abs(best.center-expected)) then best=gap end
    end
  end
  suggested[#suggested+1]=best and math.floor(best.center+.5) or math.floor(expected)
end
suggested[#suggested+1]=sh
local cuts={}
if app.params.rowCuts and app.params.rowCuts~="" then
  cuts[1]=0
  for item in app.params.rowCuts:gmatch("[^,]+") do local n=assert(tonumber(item),"rowCuts must contain numeric source Y boundaries");cuts[#cuts+1]=n end
  cuts[#cuts+1]=sh
  assert(#cuts==rows+1,"rowCuts must contain rows-1 internal source Y boundaries")
else for _,value in ipairs(suggested) do cuts[#cuts+1]=value end end
local maxCellWidth,maxCellHeight=math.ceil(sw/columns),0
for index=1,rows do
  assert(cuts[index]==math.floor(cuts[index]) and cuts[index+1]==math.floor(cuts[index+1]) and cuts[index+1]-cuts[index]>=32,"Row cuts must be ordered integer boundaries")
  maxCellHeight=math.max(maxCellHeight,cuts[index+1]-cuts[index])
end
local scale=math.min(nw/maxCellWidth,nh/maxCellHeight)
local report={schemaVersion=1,input=input,sourceWidth=sw,sourceHeight=sh,columns=columns,rows=rows,
  nativeWidth=nw,nativeHeight=nh,alphaThreshold=128,darkMaxRgbExclusive=100,connectivity=8,
  candidateFilter={minimumSourcePixels=3,maximumSourcePixels=900,maximumSourceWidth=40,maximumSourceHeight=40},
  horizontalAlphaOccupancy=occupancy,horizontalAlphaGaps=gaps,suggestedRowCuts=suggested,rowCuts=cuts,
  rowCutMode=(app.params.rowCuts and app.params.rowCuts~="") and "explicit" or "automatic alpha gaps",
  mapping={method="one uniform nearest-neighbor scale, centered full cells after alpha-gap row cuts; no silhouette crop or source edits",scale=scale,maxCellWidth=maxCellWidth,maxCellHeight=maxCellHeight},
  cells={},totals={candidates=0,darkComponents=0,excludedSmall=0,excludedLarge=0,sourceOpaqueThresholdPixels=0,sourcePartialAlphaPixels=0}}
local contact=Image(nw*columns,nh*rows,ColorMode.RGB)
local function bounds(left,top,right,bottom)
  if right<left or bottom<top then return nil end
  return {x=left,y=top,width=right-left+1,height=bottom-top+1,centerX=(left+right+1)/2,centerY=(top+bottom+1)/2}
end
local function mapBounds(box,ox,oy)
  local x=math.max(0,math.min(nw,ox+math.ceil(box.x*scale)))
  local y=math.max(0,math.min(nh,oy+math.ceil(box.y*scale)))
  local right=math.max(0,math.min(nw,ox+math.ceil((box.x+box.width)*scale)))
  local bottom=math.max(0,math.min(nh,oy+math.ceil((box.y+box.height)*scale)))
  return {x=x,y=y,width=math.max(0,right-x),height=math.max(0,bottom-y),centerX=ox+box.centerX*scale,centerY=oy+box.centerY*scale}
end
for row=0,rows-1 do for column=0,columns-1 do
  local cellX,cellY=math.floor(column*sw/columns),cuts[row+1]
  local cw=math.floor((column+1)*sw/columns)-cellX
  local ch=cuts[row+2]-cellY
  local dw,dh=math.ceil(cw*scale),math.ceil(ch*scale)
  local ox,oy=math.floor((nw-dw)/2),math.floor((nh-dh)/2)
  local cell={index=row*columns+column+1,row=row+1,column=column+1,
    sourceRect={x=cellX,y=cellY,width=cw,height=ch},mapping={scale=scale,offsetX=ox,offsetY=oy,scaledWidth=dw,scaledHeight=dh},
    cutEdgeAlpha={top=occupancy[cellY+1],bottom=occupancy[cellY+ch]},
    opaqueThresholdPixels=0,partialAlphaPixels=0,darkPixels=0,darkComponents=0,excludedSmall=0,excludedLarge=0,candidates={}}
  local dark={};local left,top,right,bottom=cw,ch,-1,-1
  for y=0,ch-1 do for x=0,cw-1 do
    local address=((cellY+y)*sw+cellX+x)*4+1
    local r,g,b,a=rgba:byte(address,address+3)
    if a>0 and a<255 then cell.partialAlphaPixels=cell.partialAlphaPixels+1 end
    if a>=128 then
      cell.opaqueThresholdPixels=cell.opaqueThresholdPixels+1
      left=math.min(left,x);right=math.max(right,x);top=math.min(top,y);bottom=math.max(bottom,y)
      if r<100 and g<100 and b<100 then dark[y*cw+x+1]=true;cell.darkPixels=cell.darkPixels+1 end
    end
  end end
  cell.cellAlphaBounds=bounds(left,top,right,bottom)
  if cell.cellAlphaBounds then
    cell.sourceAlphaBounds=bounds(cellX+left,cellY+top,cellX+right,cellY+bottom)
    cell.mappedAlphaBounds=mapBounds(cell.cellAlphaBounds,ox,oy)
  end
  for start=1,cw*ch do
    if dark[start] then
      local queue={start};dark[start]=nil;local head=1
      local cl,ct,cr,cb=cw,ch,-1,-1
      while head<=#queue do
        local key=queue[head];head=head+1
        local x=(key-1)%cw;local y=math.floor((key-1)/cw)
        cl=math.min(cl,x);cr=math.max(cr,x);ct=math.min(ct,y);cb=math.max(cb,y)
        for dy=-1,1 do for dx=-1,1 do
          if dx~=0 or dy~=0 then
            local xx,yy=x+dx,y+dy
            if xx>=0 and yy>=0 and xx<cw and yy<ch then
              local nextKey=yy*cw+xx+1
              if dark[nextKey] then dark[nextKey]=nil;queue[#queue+1]=nextKey end
            end
          end
        end end
      end
      local count=#queue
      cell.darkComponents=cell.darkComponents+1
      if count<3 then cell.excludedSmall=cell.excludedSmall+1
      elseif count>900 or cr-cl+1>40 or cb-ct+1>40 then cell.excludedLarge=cell.excludedLarge+1
      else
        local localBox=bounds(cl,ct,cr,cb)
        cell.candidates[#cell.candidates+1]={pixels=count,cell=localBox,source=bounds(cellX+cl,cellY+ct,cellX+cr,cellY+cb),native=mapBounds(localBox,ox,oy)}
      end
    end
  end
  table.sort(cell.candidates,function(a,b) if a.cell.y==b.cell.y then return a.cell.x<b.cell.x end;return a.cell.y<b.cell.y end)
  local native=Image(nw,nh,ColorMode.RGB)
  local nl,nt,nr,nb=nw,nh,-1,-1
  for y=0,dh-1 do for x=0,dw-1 do
    local sx=cellX+math.min(cw-1,math.floor(x/scale))
    local sy=cellY+math.min(ch-1,math.floor(y/scale))
    local p=image:getPixel(sx,sy)
    native:drawPixel(ox+x,oy+y,p)
    if app.pixelColor.rgbaA(p)>=128 then nl=math.min(nl,ox+x);nr=math.max(nr,ox+x);nt=math.min(nt,oy+y);nb=math.max(nb,oy+y) end
  end end
  cell.nativeAlphaBounds=bounds(nl,nt,nr,nb)
  contact:drawImage(native,Point(column*nw,row*nh))
  for _,key in ipairs({"darkComponents","excludedSmall","excludedLarge"}) do report.totals[key]=report.totals[key]+cell[key] end
  report.totals.candidates=report.totals.candidates+#cell.candidates
  report.totals.sourceOpaqueThresholdPixels=report.totals.sourceOpaqueThresholdPixels+cell.opaqueThresholdPixels
  report.totals.sourcePartialAlphaPixels=report.totals.sourcePartialAlphaPixels+cell.partialAlphaPixels
  report.cells[#report.cells+1]=cell
end end
local preview=Sprite(contact.width,contact.height,ColorMode.RGB)
preview:newCel(preview.layers[1],1,contact,Point(0,0));preview:saveCopyAs(output.."/native-body-contact.png");preview:close()
local out=assert(io.open(output.."/atlas-analysis.json","w"));out:write(json.encode(report));out:close()
source:close()
print(json.encode({complete=true,output=output,cells=#report.cells,candidates=report.totals.candidates,scale=scale,sourceModified=false}))
