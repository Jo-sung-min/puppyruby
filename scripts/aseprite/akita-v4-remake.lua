-- Assemble an entirely redrawn Akita animation set, preserving editable eyes.
-- Configuration contains only reviewed atlas cells and eye source coordinates.
local function read(p) local f=assert(io.open(p,'r'));local v=json.decode(f:read('*a'));f:close();return v end
local function write(p,v) local f=assert(io.open(p,'w'));f:write(json.encode(v));f:close() end
local cfg=read(assert(app.params.config));local root=assert(app.params.root);local out=assert(app.params.output)
local base=read(assert(app.params.metadata));local master=assert(app.open(assert(app.params.master)))
local pc=app.pixelColor;local w,h=179,188;assert(master.width==w and master.height==h and #master.layers==31 and #master.frames==64)
local names={'idle','side','walk','happy','sleep','typing','petting','eat','belly','stretch','wag','scratch','walk-left','walk-right','walk-up','walk-down'}
local meta={schemaVersion=1,trialVersion=4,revision=3,breed='akita',width=w,height=h,actionOrder=names,actions={},provenance={scope='Akita-only review',base='Entire character redrawn from revision-3 core design',assembly='Aseprite native layers and four-frame animation tags',anatomy='Round short proportions, four limbs maximum',eyes='Generated eye ink removed before compositing the existing 30 interchangeable eye layers',rightWalk='Mirrored left walk'}}
local function rgba(r,g,b) return pc.rgba(r,g,b,255) end
local function save(im,p) local s=Sprite(im.width,im.height,ColorMode.RGB);s:newCel(s.layers[1],1,im,Point(0,0));s:saveCopyAs(p);s:close() end
local atlases={}
for _,a in ipairs(cfg.atlases) do local s=assert(app.open(root..'/'..a.file));atlases[a.id]={image=Image(s),width=s.width,height=s.height,cuts=a.cuts};s:close() end
local eyeTiles={}
for n=1,30 do local s=assert(app.open(app.params.eyes..string.format('/eye-%02d.png',n)));eyeTiles[n]=Image(s);s:close() end
local prepared={};local report={revision=3,scope='Akita only',actions={},partialAlphaPixels=0,oldBodyFramesRetained=0}
for _,a in ipairs(cfg.actions) do
  local atlas=assert(atlases[a.atlas]);local row=a.row;local top,bottom=atlas.cuts[row],atlas.cuts[row+1]-1
  local scale=a.scale or 167/(atlas.width/4);local poses={};local actionReport={atlas=a.atlas,row=row,scale=scale,frames={}}
  for n=1,4 do
    local fc=a.frames[n];local left,right=math.floor((n-1)*atlas.width/4),math.floor(n*atlas.width/4)-1
    local l,t,r,b=right,bottom,left,top
    for y=top,bottom do for x=left,right do if pc.rgbaA(atlas.image:getPixel(x,y))>=128 then l=math.min(l,x);t=math.min(t,y);r=math.max(r,x);b=math.max(b,y) end end end
    assert(r>l and b>t,'Empty atlas cell '..a.id..n)
    local sw,sh=r-l+1,b-t+1;local dw,dh=math.floor(sw*scale+.5),math.floor(sh*scale+.5)
    local ox=math.floor((w-dw)/2);local oy=(a.bottom or 179)-dh
    local sourceEyes={};for _,e in ipairs(fc.eyes) do sourceEyes[#sourceEyes+1]={l=e[1],t=e[2],r=e[3],b=e[4]} end
    if #sourceEyes>0 then
      local center=0;for _,e in ipairs(sourceEyes) do center=center+(e.l+e.r)/2 end;center=center/#sourceEyes
      ox=math.floor((a.faceX or 89)-(center-l)*scale+.5)
    end
    if fc.dx then ox=ox+fc.dx end;if fc.dy then oy=oy+fc.dy end
    assert(ox>=0 and ox+dw<=w and oy>=0 and oy+dh<=h,'Atlas figure clips '..a.id..n..' '..ox..','..oy..' '..dw..'x'..dh)
    local im=Image(w,h,ColorMode.RGB)
    for y=0,dh-1 do for x=0,dw-1 do
      local p=atlas.image:getPixel(l+math.min(sw-1,math.floor(x/scale)),t+math.min(sh-1,math.floor(y/scale)))
      if pc.rgbaA(p)>=128 then im:drawPixel(ox+x,oy+y,rgba(pc.rgbaR(p),pc.rgbaG(p),pc.rgbaB(p))) end
    end end
    local anchors,repairs={},{}
    if fc.mode=='shared' then
      assert(#sourceEyes>=1 and #sourceEyes<=2,'Shared pose needs eyes '..a.id..n)
      for _,e in ipairs(sourceEyes) do
        local el=ox+math.floor((e.l-l)*scale);local er=ox+math.ceil((e.r-l)*scale)
        local et=oy+math.floor((e.t-t)*scale);local eb=oy+math.ceil((e.b-t)*scale)
        local margin=fc.eyeMargin or 2;local pl,pr,pt,pb=el-margin,er+margin,et-margin,eb+margin
        local original=Image(im)
        for y=pt,pb do
          local lp,rp=original:getPixel(pl-1,y),original:getPixel(pr+1,y)
          assert(pc.rgbaA(lp)==255 and pc.rgbaA(rp)==255,'Eye patch touches transparent edge '..a.id..n)
          for x=pl,pr do local k=(x-pl+1)/(pr-pl+2);im:drawPixel(x,y,rgba(math.floor(pc.rgbaR(lp)*(1-k)+pc.rgbaR(rp)*k+.5),math.floor(pc.rgbaG(lp)*(1-k)+pc.rgbaG(rp)*k+.5),math.floor(pc.rgbaB(lp)*(1-k)+pc.rgbaB(rp)*k+.5))) end
        end
        local residual=0
        for y=et,eb do for x=el,er do local pixel=im:getPixel(x,y);if pc.rgbaA(pixel)>0 and math.max(pc.rgbaR(pixel),pc.rgbaG(pixel),pc.rgbaB(pixel))<100 then residual=residual+1 end end end
        assert(residual==0,'Generated eye ink remains in '..a.id..n)
        anchors[#anchors+1]={x=math.floor((el+er)/2+.5)-8,y=math.floor((et+eb)/2+.5)-8,width=16,height=16}
        repairs[#repairs+1]={x=pl,y=pt,width=pr-pl+1,height=pb-pt+1,remainingDarkEyePixels=residual}
      end
    end
    poses[n]={body=im,eyes=anchors,mode=fc.mode}
    actionReport.frames[n]={sourceBounds={l=l,t=t,r=r,b=b},nativeBounds={x=ox,y=oy,width=dw,height=dh},mode=fc.mode,eyes=anchors,repairs=repairs}
  end
  prepared[a.id]=poses;report.actions[a.id]=actionReport
end
local function flip(im) local result=Image(w,h,ColorMode.RGB);for y=0,h-1 do for x=0,w-1 do result:drawPixel(w-1-x,y,im:getPixel(x,y)) end end;return result end
prepared.walk=assert(prepared['walk-left']);prepared['walk-right']={}
for n=1,4 do local source=prepared['walk-left'][n];local eyes={};for _,e in ipairs(source.eyes) do eyes[#eyes+1]={x=w-e.x-e.width,y=e.y,width=e.width,height=e.height} end;prepared['walk-right'][n]={body=flip(source.body),eyes=eyes,mode=source.mode} end
for ai,id in ipairs(names) do
  local b=base.actions[id];local item={id=id,name=b.name,description=b.description,frames=4,frameMs=b.frameMs,eyeMode=b.eyeMode,png=id..'.png',source='revision-3-redrawn-atlas',kind='redrawn',eyes={},eyeModeByFrame={}}
  local poses=assert(prepared[id],'Missing redrawn action '..id);local strip=Image(w*4,h,ColorMode.RGB);local preview=Image(w*4,h,ColorMode.RGB)
  for n=1,4 do
    local frame=(ai-1)*4+n;local p=poses[n]
    for layer=1,31 do local old=master.layers[layer]:cel(frame);if old then master:deleteCel(old) end end
    master:newCel(master.layers[1],frame,p.body,Point(0,0));master.frames[frame].duration=item.frameMs/1000
    item.eyes[n]=p.eyes;item.eyeModeByFrame[n]=p.mode
    strip:drawImage(p.body,Point((n-1)*w,0));local composite=Image(p.body)
    if p.mode=='shared' then
      for style=1,30 do
        local overlay=Image(w,h,ColorMode.RGB)
        for eye,e in ipairs(p.eyes) do for y=0,15 do for x=0,15 do overlay:drawPixel(e.x+x,e.y+y,eyeTiles[style]:getPixel((eye-1)*16+x,y)) end end end
        master:newCel(master.layers[style+1],frame,overlay,Point(0,0));if style==1 then composite:drawImage(overlay) end
      end
    end
    preview:drawImage(composite,Point((n-1)*w,0))
  end
  meta.actions[id]=item;save(strip,out..'/'..id..'.png');save(preview,out..'/'..id..'-preview.png')
end
assert(meta.actions.stretch.eyeModeByFrame[2]=='baked-closed','Stretch frame 38 must stay closed')
for layer=2,31 do assert(not master.layers[layer]:cel(38)) end
master:saveAs(out..'/akita-v4.aseprite');write(out..'/manifest.json',meta);write(out..'/remake-audit.json',report)
master:close();print(json.encode({complete=true,output=out,revision=3,redrawnFrames=64,eyes=30}))
