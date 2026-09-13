import { useId, type CSSProperties } from "react";
import { dogBreedById, type PixelBreed } from "../lib/dog-breeds";
import type { DogVariantLook } from "../lib/dog-styles";
import type { PixelMood } from "./pixel-dog";
import { breedArt, type BreedArt } from "./dog-breed-art";

export type MeadowPixelDogProps = {
  breed?:PixelBreed; mood?:PixelMood; fur?:string; eyes?:string; accessory?:string; look?:number; frame?:number;
  className?:string; decorative?:boolean; groundShadow?:boolean; variant?:DogVariantLook;
};

// All silhouettes are authored on the same integer grid as the original sprites.
function blob(cx:number,cy:number,rx:number,ry:number,fluff=0) {
  let d="";
  for(let y=Math.floor(cy-ry);y<Math.ceil(cy+ry);y++){
    const dy=(y+.5-cy)/ry, half=rx*Math.sqrt(Math.max(0,1-dy*dy));
    const fringe=fluff && Math.abs(dy)<.85 ? ([0,0,1,1,0,-1][((y%6)+6)%6]*fluff) : 0;
    const left=Math.ceil(cx-half-.5-fringe),right=Math.floor(cx+half-.5+fringe);
    if(right>=left)d+=`M${left} ${y}h${right-left+1}v1H${left}z`;
  }
  return d;
}
function tone(base:string,tint:string,amount:number){return "#"+[1,3,5].map(i=>Math.round(parseInt(base.slice(i,i+2),16)*(1-amount)+parseInt(tint.slice(i,i+2),16)*amount).toString(16).padStart(2,"0")).join("");}
function valid(value:string|undefined|null,fallback:string){return value && /^#[0-9a-f]{6}$/i.test(value)?value:fallback;}
function lightness(value:string){return parseInt(value.slice(1,3),16)*.299+parseInt(value.slice(3,5),16)*.587+parseInt(value.slice(5,7),16)*.114;}
function breedTraits(breed:PixelBreed):BreedArt {
  return breedArt[breed] ?? ({
    pomeranian:{ears:"point",fluff:12,headWidth:1,bodyWidth:.9},
    poodle:{ears:"drop",earWidth:5,earLength:.7,fluff:14,detail:"wisps"},
    maltese:{ears:"drop",earWidth:4,earLength:.8,detail:"wisps"},
    shiba:{ears:"point",headWidth:.94,marking:"mask"},
    corgi:{ears:"point",earWidth:7,earHeight:9,bodyWidth:1.15,bodyHeight:.8,marking:"blaze"},
    beagle:{ears:"drop",earWidth:6,earLength:.85,earShade:.4,marking:"blaze"},
    samoyed:{ears:"point",fluff:14,headWidth:1.03,bodyWidth:1.05},
  } as Partial<Record<PixelBreed,BreedArt>>)[breed] ?? {};
}

function Pattern({pattern,fill,cx,cy,rx,ry,head,shiba=false}: {pattern:DogVariantLook["pattern"];fill:string;cx:number;cy:number;rx:number;ry:number;head:boolean;shiba?:boolean}) {
  return <g fill={fill} data-coat-pattern={pattern}>
    {pattern === "tuxedo" && <path d={head ? blob(cx,cy+ry*.65,rx*.82,ry*.45)+(shiba ? blob(cx-5,cy-3,2,1)+blob(cx+5,cy-3,2,1) : `M${cx-1} ${cy-ry}h2v${ry}h2v${ry}h-6v-${ry}h2z`) : blob(cx-rx*.3,cy+ry*.4,rx*.4,ry*.8)} />}
    {pattern === "blaze" && <path d={`M${cx-1} ${cy-ry}h2v${Math.round(ry*.7)}h1v${Math.round(ry*.7)}h2v${Math.round(ry*.8)}h-8v-${Math.round(ry*.8)}h2v-${Math.round(ry*.7)}h1z`} />}
    {pattern === "patches" && <path d={blob(cx-rx*.45,cy-ry*.25,rx*.4,ry*.4)+blob(cx+rx*.55,cy+ry*.55,rx*.33,ry*.3)} />}
    {pattern === "freckles" && <>{[[-.45,-.5],[.35,-.6],[-.72,.2],[.6,.36],[-.48,.55],[.22,.62]].map(([x,y],i)=><path key={i} d={blob(cx+rx*x,cy+ry*y,head?1.5:2,1.5)} />)}</>}
    {pattern === "socks" && head && <path d={blob(cx,cy+ry,rx*.5,ry*.25)} />}
  </g>;
}

function Markings({breed,traits,cream,head,cx,cy,rx,ry}: {breed:PixelBreed;traits:BreedArt;cream:string;head:boolean;cx:number;cy:number;rx:number;ry:number}) {
  const mark=traits.marking, dark="#393336";
  return <g data-breed-marking={`${breed}-${head?"head":"body"}`}>
    {(mark==="blaze" || mark==="tuxedo" || (mark==="saddle"&&breed!=="yorkshireterrier")) && <Pattern pattern={head?"blaze":"tuxedo"} fill={cream} {...{head,cx,cy,rx,ry}} />}
    {mark==="spots" && <g fill={dark}>{(head?[[-.5,-.6,2],[.35,-.5,2.5],[-.8,.2,2],[.6,.5,1.5],[.05,-.85,1.5]]:[[.7,-.2,3],[-.15,-.5,2],[.3,.55,2.5],[-.5,.55,2]]).map(([x,y,r],i)=><path key={i} d={blob(cx+rx*x,cy+ry*y,r,r*.8)} />)}</g>}
    {head && mark==="eyepatch" && <path d={blob(cx-6,cy-2,7,10)} fill={dark} />}
    {head && mark==="saddle" && breed==="saintbernard" && <path d={blob(cx-8,cy-1,4,8)+blob(cx+8,cy-1,4,8)} fill="#695044" />}
    {!head && mark==="saddle" && <path d={blob(cx+rx*.35,cy-ry*.4,rx*.8,ry*.8)} fill={breed==="yorkshireterrier"?"#62626b":"#705347"} />}
    {head && mark==="mask" && (breed==="husky" ? <><path d={blob(cx-6,cy,7,10)+blob(cx+6,cy,7,10)} fill={cream} /><path d={`M${cx-1} ${cy-ry}h2v7h2v4h-6v-4h2z`} fill={cream} /></> : <path d={blob(cx-10,cy+7,6,5)+blob(cx+10,cy+7,6,5)+blob(cx-5,cy-4,2,1)+blob(cx+5,cy-4,2,1)} fill={cream} />)}
    {mark==="blacktan" && <path d={head ? blob(cx-5,cy-4,2,1)+blob(cx+5,cy-4,2,1)+blob(cx-10,cy+6,3,4)+blob(cx+10,cy+6,3,4) : blob(cx-rx*.4,cy+ry*.75,5,4)+blob(cx+rx*.6,cy+ry*.7,5,4)} fill={cream} />}
  </g>;
}

function Cosmetic({id,cx,top,faceY,gap,cream}: {id:string;cx:number;top:number;faceY:number;gap:number;cream:string}) {
  const bow=id==="bow-blue"?"#719fc8":id==="bow-lilac"?"#b194d5":"#d9808b";
  return <g data-cosmetic={id}>
    {(id==="ribbon"||id==="bow-blue"||id==="bow-lilac") && <g transform={`translate(${cx+9} ${Math.max(3,top+4)})`}><path d="M0 0h3v2h2V0h4v6H5V4H3v2H0z" fill="#6e4752" /><path d="M1 1h2v2h3V1h2v4H6V3H3v2H1z" fill={bow} /></g>}
    {(id==="crown"||id==="party-hat") && <g transform={`translate(${cx-7} ${Math.max(1,top-6)})`}><path d={id==="crown"?"M0 1h2v3h3V0h3v4h4V1h2v9H0z":"M6 0h3v3h1v3h2v3h2v3H0V9h2V6h2V3h2z"} fill="#775844" /><path d={id==="crown"?"M1 3h1v3h4V2h1v4h6V4h-1v4H1z":"M6 2h2v3h2v3h2v2H2V8h2V5h2z"} fill={id==="crown"?"#eac665":"#b092cd"} /><path d="M1 9h12v2H1z" fill="#f0d18a" /></g>}
    {id==="glasses" && <g fill="#3c3a42"><path d={`M${cx-gap-4} ${faceY-4}h7v1h1v6h-1v1h-7v-1h-1v-6h1zM${cx-gap-3} ${faceY-3}h5v6h-5zM${cx+gap-4} ${faceY-4}h7v1h1v6h-1v1h-7v-1h-1v-6h1zM${cx+gap-3} ${faceY-3}h5v6h-5z`} fillRule="evenodd" /><path d={`M${cx-gap+3} ${faceY-1}h${gap*2-6}v1h-${gap*2-6}z`} /></g>}
    {id==="flower" && <g transform={`translate(${cx+12} ${Math.max(6,top+7)})`}><path d={blob(0,-2,2,2)+blob(-2,0,2,2)+blob(2,0,2,2)+blob(0,2,2,2)} fill="#e5a1b2" /><path d={blob(0,0,1,1)} fill="#edc16b" /><path d="M2 4h3V2h1v4H2z" fill="#7d9971" /></g>}
    {id==="halo" && <><path d={blob(cx,Math.max(3,top-3),10,3)} fill="#a17b36" /><path d={blob(cx,Math.max(3,top-3),8,2)} fill="#f5d984" /><path d={blob(cx,Math.max(3,top-3),6,1)} fill={cream} /></>}
  </g>;
}

/** A separate three-quarter, four-paw sprite with a raised curled tail. */
export function MeadowPixelDog({breed="samoyed",mood="idle",fur,eyes="#3e332c",accessory="none",look=0,frame=0,className="",decorative=false,groundShadow=true,variant}:MeadowPixelDogProps) {
  const info=dogBreedById(breed); breed=info.id;
  const traits=breedTraits(breed), uid=useId().replace(/[^a-zA-Z0-9_-]/g,"");
  const requestedCoat=valid(fur,valid(variant?.coatColor,info.palette[0]));
  const coat=fur||variant?.coatColor?requestedCoat:tone(requestedCoat,"#d9bb95",lightness(requestedCoat)>210?.12:.02), cream=info.palette[2];
  const ink="#3b302a", deep=tone(coat,"#66503c",.46), shade=tone(coat,"#a38768",.28), bright=tone(coat,"#fffdf4",.58);
  const eye=valid(eyes,"#3e332c"), custom=variant?.pattern ?? "solid", patternColor=valid(variant?.patternColor,"#fff9ee");
  const short=(traits.bodyHeight ?? 1)<.9, cx=25, cy=short?29:27;
  const rx=Math.round(16*(traits.headWidth ?? 1))+(variant?.shape==="teddy"?2:variant?.shape==="fox"?-2:0),ry=Math.round(16*(traits.headHeight ?? 1));
  const fluffy=Boolean(traits.fluff), fringe=fluffy?1:0, head=blob(cx,cy,rx,ry,fringe), top=cy-ry;
  const bodyX=40,bodyY=short?45:43,bodyRx=Math.min(19,Math.round(16*(traits.bodyWidth ?? 1))),bodyRy=Math.min(14,Math.round(13*(traits.bodyHeight ?? 1)));
  const body=blob(bodyX,bodyY,bodyRx,bodyRy,fluffy?.5:0), faceY=cy-1, gap=traits.eyeScale?6:5;
  const earType=variant?.shape==="teddy"?"round":variant?.shape==="fox"?"point":traits.ears ?? "point";
  const eyeLook=Number.isFinite(look)?Math.max(-2,Math.min(2,Math.round(look))):0, f=Number.isFinite(frame)?Math.abs(Math.trunc(frame))%2:0;
  const pawColor=custom==="socks"?patternColor:cream, footY=short?58:60, headClip=`coat-meadow-head-${uid}`,bodyClip=`coat-meadow-body-${uid}`;
  const tongue=traits.tongue ?? "#df8e86";
  function ears(front=false){
    if((earType==="drop")!==front)return null;
    return [-1,1].map(side=>{
      const x=cx+side*(earType==="drop"?rx-1:Math.round(rx*.63));
      const earTop=Math.max(3,top-(earType==="bat"?8:Math.round((traits.earHeight??5)*.7)));
      const width=Math.max(4,Math.min(7,Math.round((traits.earWidth??5)*.8)));
      if(earType==="drop"){
        const h=Math.min(13,Math.round(ry*(traits.earLength??.75))), y=cy+1,fill=tone(coat,"#4d382c",traits.earShade??.09);
        return <g key={side}><path d={blob(x,y,width,h)} fill={ink} /><path d={blob(x,y,width-1,h-1)} fill={deep} /><path d={blob(x-1,y-1,width-2,h-2)} fill={fill} /><path d={`M${x-2} ${y-4}h1v${Math.max(3,h-1)}h-1zM${x+1} ${y}h1v${Math.max(2,h-4)}h-1z`} fill={tone(fill,bright,.2)} />{breed==="dalmatian"&&<path d={blob(x,y+(side===1?3:-2),2,3)} fill="#393336" />}</g>;
      }
      if(earType==="round")return <g key={side}><path d={blob(x,top+2,width+1,6)} fill={ink} /><path d={blob(x,top+2,width,5)} fill={coat} /><path d={blob(x,top+2,Math.max(2,width-2),3)} fill={shade} /></g>;
      if(earType==="fold")return <g key={side}><path d={`M${x-width} ${top+3}h${width+3}v2h3v7h-3v3h-3v-4h-3v-4h-3z`} fill={ink} /><path d={`M${x-width+1} ${top+4}h${width+2}v3h3v4h-3v-3h-2v-2h-3z`} fill={shade} /></g>;
      if(earType==="bat")return <g key={side}><path d={blob(x,earTop+7,width,8)} fill={ink} /><path d={blob(x,earTop+7,width-1,7)} fill={coat} /><path d={blob(x,earTop+6,width-3,4)} fill="#dfaaa0" /></g>;
      return <g key={side}><path d={`M${x-width} ${top+10}V${earTop+7}h1v-3h2v-3h3v1h2v2h2v3h2v${Math.max(4,top+10-(earTop+10))}z`} fill={ink} /><path d={`M${x-width+1} ${top+9}V${earTop+7}h2v-3h2v-2h1v2h2v3h2v${Math.max(4,top+9-(earTop+7))}z`} fill={bright} /><path d={`M${x-1} ${earTop+6}h2v3h2v3h-5z`} fill="#dfa99c" /></g>;
    });
  }
  function leg(x:number,y:number,near:boolean,index:number){
    const moving=mood==="walk"?((f===index%2)?-2:0):0, w=near?8:6;
    return <g data-dog-part={`${near?"near":"far"}-${index<2?"front":"rear"}-paw`} transform={`translate(0 ${moving})`}>
      <path d={`M${x-w/2|0} ${y}h${w}v${footY-y-1}h-1v2h-${w+1}v-3h1z`} fill={ink} />
      <path d={`M${x-w/2+1|0} ${y}h${w-2}v${footY-y-2}h-1v2h-${w-2}v-2h1z`} fill={near?shade:deep} />
      <path d={`M${x-w/2+1|0} ${y+1}h${Math.max(2,w-3)}v${Math.max(2,footY-y-4)}h-1v2h-${Math.max(1,w-4)}z`} fill={near?bright:coat} />
      <path d={`M${x-w/2|0} ${footY-3}h${w-1}v2h-${w-1}z`} fill={pawColor} /><path d={`M${x-1} ${footY-2}h1v1h-1zM${x+1} ${footY-2}h1v1h-1z`} fill={deep} />
    </g>;
  }
  return <svg viewBox="0 0 64 64" shapeRendering="crispEdges" className={`pixel-dog pixel-${mood} dog-style-meadow ${className}`} data-dog-style="meadow" data-dog-breed={breed} data-dog-shape={variant?.shape??"original"} role={decorative?undefined:"img"} aria-hidden={decorative||undefined} aria-label={decorative?undefined:`${info.name} 산책 도트 강아지`} style={{"--dog-coat":coat} as CSSProperties}>
    <defs><clipPath id={headClip}><path d={head} /></clipPath><clipPath id={bodyClip}><path d={body} /></clipPath></defs>
    {groundShadow&&<path d={blob(36,61,23,2)} fill="#4a3c2e" opacity=".14" />}
    <g className="dog-body" style={{transformOrigin:"33px 60px"}}>
      {accessory==="angel-wings"&&<g data-cosmetic="angel-wings"><path d="M37 36L54 23h5v9l-6 10-12 7zM20 37 8 28H5v10l10 10z" fill="#91a0b9" /><path d="M38 38 55 26v8l-5 6-10 6zM19 39 7 31v6l10 9z" fill="#f4f2ee" /></g>}
      {leg(19,43,false,0)}{leg(46,43,false,2)}
      <g className="dog-tail" data-dog-part="curled-tail" style={{transformOrigin:"49px 35px"}}>
        <g transform="translate(0 3)">
        <path d="M48 37v-5h-3v-3h-3v-6h-1v-7h2v-5h3V8h3V7h6v2h3v3h2v4h1v8h-1v5h-3v5h-4v3z" fill={ink} />
        <path d="M49 34v-5h-4v-6h-2v-6h2v-5h3V9h6v2h3v4h2v8h-2v5h-3v4z" fill={shade} />
        <path d="M47 27v-6h-2v-5h2v-4h3v-2h4v3h3v7h-2v5h-3v4z" fill={bright} />
        <path d="M50 14h4v3h2v5h-2v4h-3v4h-2v-5h3v-6h-2z" fill={coat} /><path d="M54 15h3v3h1v7h-2v3h-4v-2h2v-3h2v-5h-2z" fill={shade} /><path d="M45 25h3v2h3v4h3v2h-4v-2h-3v-3h-2z" fill={deep} />
        </g>
      </g>
      <path d={blob(bodyX,bodyY,bodyRx+1,bodyRy+1,fluffy?.5:0)} fill={ink} /><path d={body} fill={shade} />
      <g clipPath={`url(#${bodyClip})`}>
        <path d={blob(bodyX-2,bodyY-3,bodyRx-1,bodyRy-2)} fill={coat} /><path d={blob(bodyX-5,bodyY-5,bodyRx-5,bodyRy-3)} fill={bright} />
        <path d={`M${bodyX+7} ${bodyY-7}h4v4h2v10h-3v4h-4v-2h2v-6h1v-6h-2zM${bodyX-4} ${bodyY+8}h9v3h-9z`} fill={deep} />
        <Markings {...{breed,traits,cream}} head={false} cx={bodyX} cy={bodyY} rx={bodyRx} ry={bodyRy} />
        {custom!=="solid"&&<Pattern pattern={custom} fill={patternColor} head={false} cx={bodyX} cy={bodyY} rx={bodyRx} ry={bodyRy} />}
        {fluffy&&<path d="M42 39h2v2h2v2h-2v-1h-2zM48 34h2v2h2v2h-2v-1h-2zM40 48h2v2h3v2h-4v-1h-1z" fill={bright} />}
      </g>
      {leg(53,50,true,3)}
      <path d={blob(28,43,11,10,fluffy?1:0)} fill={shade} /><path d={blob(25,41,10,10,fluffy?1:0)} fill={coat} />
      {leg(29,49,true,1)}
      <g className="dog-head" style={{transformOrigin:"25px 40px"}}>
        {ears()}
        <path d={blob(cx,cy,rx+1,ry+1,fringe)} fill={ink} /><path d={head} fill={shade} />
        <g clipPath={`url(#${headClip})`}>
          <path d={blob(cx-1,cy-2,rx-1,ry-1,fringe)} fill={coat} /><path d={blob(cx-2,cy-4,rx-3,ry-4,fringe)} fill={bright} />
          <path d={`M${cx-rx+2} ${cy}h2v6h2v4h3v3h4v2h-5v-2h-4v-3h-2v-4h-2zM${cx+rx-4} ${cy-5}h2v7h-2v5h-3v-3h2z`} fill={shade} />
          <path d={blob(cx-4,cy+6,7,6)+blob(cx+4,cy+6,7,6)+blob(cx,cy+10,9,5)} fill={cream} />
          <Markings {...{breed,traits,cream}} head cx={cx} cy={cy} rx={rx} ry={ry} />
          {custom!=="solid"&&<Pattern pattern={custom} fill={patternColor} head shiba={breed==="shiba"} cx={cx} cy={cy} rx={rx} ry={ry} />}
          {fluffy&&<path d={`M${cx-11} ${cy+6}h2v3h2v3h-2v-2h-2zM${cx+8} ${cy+8}h2v3h-2v2h-2v-2h2zM${cx-2} ${cy+12}h2v2h2v2h-3v-2h-1z`} fill={shade} />}
        </g>
        {ears(true)}
        {traits.detail==="topknot"&&<g data-breed-detail="topknot"><path d={blob(cx-2,Math.max(5,top),3,4)+blob(cx+2,Math.max(5,top),3,4)} fill={ink} /><path d={blob(cx-2,Math.max(5,top),2,3)+blob(cx+2,Math.max(5,top),2,3)} fill={cream} /><path d={`M${cx-4} ${Math.max(6,top+2)}h8v2h-8z`} fill="#d48891" /></g>}
        {traits.detail==="beard"&&<g data-breed-detail="beard"><path d={blob(cx,cy+10,9,7,1)} fill={cream} /><path d={blob(cx-gap,faceY-4,4,1)+blob(cx+gap,faceY-4,4,1)} fill={cream} /><path d={`M${cx-4} ${cy+11}v3h1v-3zM${cx+3} ${cy+11}v3h1v-3z`} fill={shade} /></g>}
        {traits.detail==="wrinkles"&&<path d={`M${cx-7} ${cy-6}h5v1h-5zM${cx+3} ${cy-6}h5v1h-5zM${cx-2} ${cy-3}h4v1h-4z`} fill={deep} />}
        <g transform={`translate(${eyeLook} 0)`}>
          {mood==="sleep"?<path d={`M${cx-gap-2} ${faceY}h2v1h2v-1h2v2h-6zM${cx+gap-2} ${faceY}h2v1h2v-1h2v2h-6z`} fill={eye} />:mood==="love"?<path d={`M${cx-gap-2} ${faceY+1}v-2h1v-1h2v1h1v2h-1v-1h-2v1zM${cx+gap-2} ${faceY+1}v-2h1v-1h2v1h1v2h-1v-1h-2v1z`} fill={eye} />:<g className="dog-eyes">
            {(lightness(coat)<100||breed==="frenchbulldog")&&<path d={blob(cx-gap,faceY,2.5,3)+blob(cx+gap,faceY,2.5,3)} fill={shade} />}
            <path d={`M${cx-gap-1} ${faceY-2}h2v3h-2zM${cx+gap-1} ${faceY-1}h2v3h-2z`} fill={eye} /><path d={`M${cx-gap-1} ${faceY-2}h1v1h-1zM${cx+gap-1} ${faceY-1}h1v1h-1z`} fill="#fffdf4" />
          </g>}
          <path d={`M${cx-1} ${cy+3}h3v2h-1v1h-1v-1h-1z`} fill={ink} /><path d={`M${cx-1} ${cy+3}h1v1h-1z`} fill="#756052" />
          <path d={`M${cx} ${cy+5}h1v2h2v-1h1v2h-2v1h-3v-1h-2v-2h1v1h2z`} fill={ink} />
          {mood!=="sleep"&&<><path d={`M${cx-1} ${cy+8}h3v3h-1v1h-1v-1h-1z`} fill={ink} /><path d={`M${cx} ${cy+8}h1v3h-1z`} fill={tongue} /></>}
        </g>
        {accessory!=="none"&&accessory!=="scarf"&&accessory!=="angel-wings"&&<Cosmetic id={accessory} {...{cx,top,faceY,gap,cream}} />}
      </g>
      {accessory==="scarf"&&<g data-cosmetic="scarf"><path d="M16 43h5v2h12v-2h5v5h-8v10h-5V48h-6v-2h-3z" fill="#9b4d49" /><path d="M18 44h3v2h13v-2h3v3H20v-2h-2zM26 48h3v8h-3z" fill="#d57e70" /></g>}
    </g>
    {mood==="love"&&<g className="dog-hearts" fill="#d8848f"><path d="M4 17h2v1h1v-1h2v3H8v1H6v-1H5v-1H4zM42 3h2v1h1V3h2v3h-1v1h-2V6h-1V5h-1z" /></g>}
    {mood==="sleep"&&<path d="M42 7h6v2h-2v2h-2v2h4v1h-6v-2h2v-2h2V9h-4zM51 2h6v1h-2v2h-2v2h4v1h-6V6h2V4h2V3h-4z" fill="#858198" />}
    {mood==="eat"&&<g><path d="M13 54h23v5H13zM16 59h17v2H16z" fill="#76483d" /><path d="M14 55h21v3H14zM17 58h15v2H17z" fill="#cc806a" /><path d="M15 53h18v3H15z" fill="#956740" /><path d="M17 52h3v2h-3zM23 53h3v2h-3zM29 52h2v2h-2z" fill="#cca16a" /></g>}
    {(mood==="typing"||mood==="excited")&&<g><path d="M8 54h31v8H8z" fill="#69605a" /><path d="M9 55h29v5H9z" fill="#e3d9c9" /><path d="M11 56h3v1h-3zM16 56h3v1h-3zM21 56h3v1h-3zM26 56h3v1h-3zM31 56h3v1h-3zM16 58h13v1H16z" fill="#a29b92" />{[19,29].map((x,i)=><g key={x} className={i?"typing-paw-right":"typing-paw-left"} transform={`translate(0 ${f===i?-2:0})`}><path d={blob(x,53,4,3)} fill={ink} /><path d={blob(x,52,3,2)} fill={cream} /></g>)}</g>}
    {mood==="scroll"&&<g><path d="M7 47h6v14H7z" fill="#a17c5b" /><path d="M8 48h4v10H8zM10 60h12v2H10z" fill="#eee1c5" /></g>}
  </svg>;
}
