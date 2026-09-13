import type { CSSProperties } from "react";
import { dogBreedById, type PixelBreed } from "../lib/dog-breeds";
import { cuteDogStyles, type CuteDogStyleId } from "../lib/cute-dog-styles";
import { getCutePuppySprite, type CutePuppySprite, type SpriteAnchors } from "../lib/cute-puppy-sprite-data";
import type { DogVariantLook } from "../lib/dog-styles";
import type { PixelMood } from "./pixel-dog";
import { breedArt } from "./dog-breed-art";

function mix(first: string, second: string, amount: number) {
  return "#" + [1, 3, 5].map(index => Math.round(parseInt(first.slice(index, index + 2), 16) * (1 - amount) + parseInt(second.slice(index, index + 2), 16) * amount).toString(16).padStart(2, "0")).join("");
}
function color(value: string | null | undefined, fallback: string) { return value && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback; }
function lightness(value: string) { return [1,3,5].reduce((total,index)=>total+parseInt(value.slice(index,index+2),16),0)/3; }
function ellipse(x: number, y: number, cx: number, cy: number, rx: number, ry: number) { return ((x-cx)/rx) ** 2 + ((y-cy)/ry) ** 2 <= 1; }

export function cuteSpriteAnchors(sprite: CutePuppySprite, id: CuteDogStyleId): SpriteAnchors {
  if (sprite.anchors) return sprite.anchors;
  const occupied = sprite.rows.flatMap((row, y) => [...row].flatMap((index, x) => index === "0" ? [] : [{x,y}]));
  const minY = Math.min(...occupied.map(pixel => pixel.y)), maxY = Math.max(...occupied.map(pixel => pixel.y));
  const height = maxY-minY;
  return { faceX: 32, eyeY: Math.round(minY + height*(id.endsWith("tall") ? .30 : .38)), eyeGap: 7,
    headTop: minY, headBottom: Math.round(minY+height*.63), footY: maxY };
}

function patternAt(pattern: DogVariantLook["pattern"], x: number, y: number, a: SpriteAnchors) {
  const head = y < a.headBottom, mid = head ? a.eyeY : (a.headBottom+a.footY)/2;
  if (pattern === "tuxedo") return ellipse(x,y,a.faceX,head?a.eyeY+9:mid,head?12:9,head?5:12);
  if (pattern === "patches") return ellipse(x,y,a.faceX-11,a.eyeY-2,7,8) || ellipse(x,y,a.faceX+12,mid+5,6,8);
  if (pattern === "freckles") return [[-13,-8],[9,-7],[-17,5],[15,7],[-8,19],[10,24]].some(([dx,dy]) => ellipse(x,y,a.faceX+dx,a.eyeY+dy,2,2));
  if (pattern === "socks") return y >= a.footY-5;
  if (pattern === "blaze") return Math.abs(x-a.faceX) <= (head ? 2+Math.max(0,y-a.eyeY)*.2 : 5);
  return false;
}

function breedMarking(breed: PixelBreed, x: number, y: number, a: SpriteAnchors): "cream" | "dark" | undefined {
  const mark = breedArt[breed]?.marking ?? (breed === "corgi" || breed === "beagle" ? "blaze" : breed === "shiba" ? "mask" : undefined);
  const head = y < a.headBottom;
  if (mark === "spots" && [[-13,-10],[9,-12],[-17,3],[16,5],[-7,20],[10,22]].some(([dx,dy]) => ellipse(x,y,a.faceX+dx,a.eyeY+dy,3,3))) return "dark";
  if (mark === "eyepatch" && ellipse(x,y,a.faceX-a.eyeGap,a.eyeY,8,11)) return "dark";
  if ((mark === "blaze" || mark === "tuxedo" || mark === "saddle") && head && Math.abs(x-a.faceX) <= 2+Math.max(0,y-a.eyeY)*.3) return "cream";
  if (mark === "mask" && head && (ellipse(x,y,a.faceX-a.eyeGap,a.eyeY+6,9,7) || ellipse(x,y,a.faceX+a.eyeGap,a.eyeY+6,9,7))) return "cream";
  if (mark === "blacktan" && (ellipse(x,y,a.faceX-a.eyeGap,a.eyeY-5,3,2) || ellipse(x,y,a.faceX+a.eyeGap,a.eyeY-5,3,2) || y>=a.footY-5)) return "cream";
  if ((mark === "tuxedo" || mark === "blaze") && !head && Math.abs(x-a.faceX)<8) return "cream";
  if (mark === "saddle" && !head && x>a.faceX+1 && y<a.footY-5) return "dark";
  return undefined;
}

type Props = {
  styleId: CuteDogStyleId; breed: PixelBreed; mood: PixelMood; fur?: string; eyes?: string; accessory?: string;
  look?: number; frame?: number; className?: string; decorative?: boolean; groundShadow?: boolean; variant?: DogVariantLook;
};

/** Raster runs retain the Aseprite silhouette. Only fur pixels receive breed or variety markings. */
export function cuteSpritePaths({ styleId, breed, fur, eyes, variant }: Pick<Props,"styleId"|"breed"|"fur"|"eyes"|"variant">) {
  const sprite = getCutePuppySprite(styleId), a = cuteSpriteAnchors(sprite,styleId);
  const [base,edge,cream] = dogBreedById(breed).palette;
  const coat = color(fur,color(variant?.coatColor,base));
  const customCoat = [fur,variant?.coatColor].some(value=>typeof value==="string" && /^#[0-9a-f]{6}$/i.test(value));
  const shade = customCoat ? mix(coat,"#534637",.27) : edge;
  const pattern = color(variant?.patternColor,"#ffffff"), dark = "#3d3532";
  const eye = color(eyes,"#3e332c"), paths = new Map<string,string>();
  function retainTone(target:string,entry:string,index:number) {
    const related=sprite.palette.filter((_,i)=>sprite.roles[i]===sprite.roles[index]);
    const average=related.reduce((sum,item)=>sum+lightness(item),0)/related.length;
    const delta=(lightness(entry)-average)/255;
    return Math.abs(delta)<.035?target:mix(target,delta>0?"#fffdf7":"#332927",Math.min(.32,Math.abs(delta)*1.35));
  }
  const fills = sprite.palette.map((entry,index) => {
    switch (sprite.roles[index]) {
      case "coat": return retainTone(coat,entry,index);
      case "shade": return retainTone(shade,entry,index);
      case "light": return retainTone(mix(coat,cream,.58),entry,index);
      case "cream": return retainTone(cream,entry,index);
      case "tongue": return breedArt[breed]?.tongue ?? entry.slice(0,7);
      default: return entry.slice(0,7);
    }
  });
  function fillAt(x: number,y: number) {
    const headScale = y<a.headBottom ? variant?.shape === "teddy" ? 1.07 : variant?.shape === "fox" ? .9 : 1 : 1;
    const sourceX = Math.round(a.faceX+(x-a.faceX)/headScale);
    if (sourceX<0 || sourceX>63) return null;
    const index = parseInt(sprite.rows[y][sourceX],36);
    if (!index) return null;
    const role = sprite.roles[index];
    if ((role==="outline" || role==="detail") && (ellipse(sourceX,y,a.faceX-a.eyeGap,a.eyeY,4,3) || ellipse(sourceX,y,a.faceX+a.eyeGap,a.eyeY,4,3))) return eye;
    if (!["coat","shade","light","cream"].includes(role)) return fills[index];
    const marking = breedMarking(breed,x,y,a);
    if (variant && patternAt(variant.pattern,x,y,a)) return pattern;
    if (marking === "cream") return cream;
    if (marking === "dark") return role === "shade" ? mix(dark,"#161111",.2) : dark;
    return fills[index];
  }
  for(let y=0;y<64;y++) {
    for(let x=0;x<64;) {
      const fill=fillAt(x,y),start=x++;
      while(x<64 && fillAt(x,y)===fill)x++;
      if(fill)paths.set(fill,(paths.get(fill)??"")+`M${start} ${y}h${x-start}v1H${start}z`);
    }
  }
  return { a,coat,cream,shade,paths:[...paths].map(([fill,d])=>({fill,d})) };
}

export function CuteDogAccessories({id,a,detailed=false}:{id:string;a:SpriteAnchors;detailed?:boolean}) {
  const x=a.faceX, top=Math.max(3,a.headTop), side=Math.min(51,x+15), eyeY=a.eyeY;
  if(detailed && (id==="ribbon" || id==="bow-blue" || id==="bow-lilac")) {
    const colors=id==="bow-blue"?["#385477","#6badd4","#b1e1ee"]:id==="bow-lilac"?["#604777","#ad86c8","#dfc5ed"]:["#863a52","#d8708a","#f7b4c0"];
    return <g data-cosmetic={id} transform={`translate(${side-4} ${top+3}) scale(.5)`}>
      <path d="M1 0h3v1h3v1h2v2h2V2h2V1h3V0h3v1h1v12h-1v1h-3v-1h-3v-1h-2v-2H9v2H7v1H4v1H1v-1H0V1h1z" fill={colors[0]}/>
      <path d="M2 2h2v1h3v1h2v6H7v1H4v1H2zM12 4h2V3h3V2h1v10h-2v-1h-3v-1h-1z" fill={colors[1]}/>
      <path d="M2 2h2v1h2v1H3v3H2zM15 3h2v1h1v3h-1V5h-2zM9 5h3v4H9z" fill={colors[2]}/>
      <path d="M5 6h3v2H5zM13 6h3v2h-3zM8 4h1v6H8zM12 4h1v6h-1z" fill={colors[0]}/>
    </g>;
  }
  if(detailed && id==="crown") return <g data-cosmetic={id} transform={`translate(${x-8} ${Math.max(0,top-5)}) scale(.5)`}>
    <path d="M0 0h5v3h2v3h6V3h2V0h4v3h2v3h6V3h2V0h5v16h-2v2H2v-2H0z" fill="#856037"/>
    <path d="M2 3h2v3h3v2h8V5h4v3h8V6h3V3h2v12H2z" fill="#e6b954"/>
    <path d="M3 10h28v3H3zM4 15h26v1H4zM16 2h2v3h-2z" fill="#ffe69b"/>
    <path d="M7 10h3v3H7zM24 10h3v3h-3z" fill="#ba6b87"/><path d="M16 9h3v4h-3z" fill="#6babb1"/>
  </g>;
  if(detailed && id==="scarf") return <g data-cosmetic={id} transform={`translate(${x-10} ${a.headBottom-2}) scale(.5)`}>
    <path d="M0 0h4v1h32V0h4v5h-3v2h-1v13h-7V7H4V6H0z" fill="#8d4954"/>
    <path d="M2 1h2v1h32V1h2v3h-3v2H5V5H2zM30 6h5v12h-5z" fill="#da8390"/>
    <path d="M6 3h27v1H6zM31 8h3v6h-3zM30 17h5v1h-5z" fill="#f5bdbe"/>
  </g>;
  if(id==="ribbon" || id==="bow-blue" || id==="bow-lilac")return <g data-cosmetic={id} transform={`translate(${side-4} ${top+3})`}><path d="M0 0h3v1h3V0h4v7H6V5H3v2H0z" fill={id==="bow-blue"?"#69a6d7":id==="bow-lilac"?"#b091cd":"#d68791"}/><path d="M3 2h3v3H3z" fill="#7a586c"/></g>;
  if(id==="scarf")return <g data-cosmetic={id} fill="#cb7368"><path d={`M${x-10} ${a.headBottom-2}h20v3h-20zM${x+5} ${a.headBottom}h4v7h-4z`}/></g>;
  if(id==="crown")return <g data-cosmetic={id} transform={`translate(${x-8} ${Math.max(0,top-5)})`}><path d="M0 0h3v3h4V0h3v3h4V0h3v8H0z" fill="#e2b651"/><path d="M0 7h17v2H0z" fill="#997333"/></g>;
  if(id==="party-hat")return <g data-cosmetic={id} transform={`translate(${x-6} ${Math.max(0,top-8)})`}><path d="M5 0h3v3h2v4h2v5H0V7h2V3h3z" fill="#ab95ca"/><path d="M2 6h8v2H2zM0 11h12v2H0z" fill="#e7bf72"/></g>;
  if(id==="flower")return <g data-cosmetic={id} transform={`translate(${side} ${top+5})`}><path d="M-2-5h4v3h3v4H2v3h-4V2h-3v-4h3z" fill="#eeabb5"/><path d="M-2-2h4v4h-4z" fill="#eac260"/></g>;
  if(id==="glasses")return <g data-cosmetic={id} fill="none" stroke="#39343a" strokeWidth="1"><path d={`M${x-a.eyeGap-4} ${eyeY-3}h8v6h-8zM${x+a.eyeGap-4} ${eyeY-3}h8v6h-8zM${x-a.eyeGap+4} ${eyeY}h${2*a.eyeGap-8}`}/></g>;
  if(id==="halo")return <g data-cosmetic={id}><path d={`M${x-8} ${Math.max(0,top-4)}h16v1h2v3h-2v1h-16v-1h-2v-3h2z`} fill="#d8b454"/><path d={`M${x-6} ${Math.max(1,top-3)}h12v2h-12z`} fill="#fff5c9"/></g>;
  return null;
}

export function CutePixelDog({styleId,breed,mood,fur,eyes,accessory="none",look=0,frame=0,className="",decorative=false,groundShadow=true,variant}:Props) {
  const {a,coat,cream,shade,paths}=cuteSpritePaths({styleId,breed,fur,eyes,variant});
  const f=Number.isFinite(frame)?Math.abs(Math.trunc(frame))%2:0, gaze=Number.isFinite(look)?Math.max(-1,Math.min(1,Math.round(look))):0;
  const step=mood==="walk"?(f?-1:0):0, info=dogBreedById(breed), label=cuteDogStyles.find(style=>style.id===styleId)!.name;
  return <svg viewBox="0 0 64 64" shapeRendering="crispEdges" className={`pixel-dog pixel-${mood} dog-style-cute ${className}`} data-dog-style={styleId} data-dog-breed={breed} data-dog-shape={variant?.shape??"original"} data-coat-pattern={variant?.pattern??"solid"} role={decorative?undefined:"img"} aria-hidden={decorative||undefined} aria-label={decorative?undefined:`${info.name} ${label} 강아지`} style={{"--dog-coat":coat} as CSSProperties}>
    {groundShadow&&<path d={`M14 ${Math.min(62,a.footY+1)}h36v1h-36z`} fill="#574e45" opacity=".14"/>}
    <g className="dog-body" style={{transformOrigin:`${a.faceX}px ${a.footY}px`}}>
      <g transform={`translate(${gaze} ${step})`}>
        {accessory==="angel-wings"&&<g data-cosmetic={accessory}><path d="M18 39 7 29H3v10l5 8 14 5zM46 39l11-10h4v10l-5 8-14 5z" fill="#a8b3c7"/><path d="M17 40 5 32v7l5 7 11 4zM47 40l12-8v7l-5 7-11 4z" fill="#f4f5fc"/></g>}
        {paths.map(({fill,d})=><path key={fill} fill={fill} d={d}/>)}
        <CuteDogAccessories id={accessory} a={a}/>
      </g>
    </g>
    {mood==="love"&&<g fill="#d98691" className="dog-hearts"><path d="M3 10h3v2h2v-2h3v5H9v2H7v2H5v-2H3zM53 3h3v2h2V3h3v5h-2v2h-2v2h-2v-2h-2z"/></g>}
    {mood==="sleep"&&<g fill="#8c869c"><path d="M49 12h7v2h-2v2h-2v2h4v2h-7v-2h2v-2h2v-2h-4zM55 2h6v2h-2v2h-2v2h4v2h-6V8h2V6h2V4h-4z"/></g>}
    {mood==="eat"&&<g><path d="M22 54h23v5H22zM25 59h17v2H25z" fill="#cd8277"/><path d="M24 52h19v3H24z" fill="#70513e"/><path d="M26 51h4v2h-4zM36 51h3v2h-3z" fill="#bc9367"/></g>}
    {(mood==="typing"||mood==="excited")&&<g><path d="M14 53h36v8H14z" fill="#827b76"/><path d="M16 54h32v5H16z" fill="#e8e1d7"/><path d="M18 55h3v2h-3zM23 55h3v2h-3zM28 55h3v2h-3zM33 55h3v2h-3zM38 55h3v2h-3zM43 55h3v2h-3z" fill="#ada296"/><g className="typing-paw-left" transform={`translate(0 ${f?-2:0})`}><path d="M21 50h7v5h-7z" fill={shade}/><path d="M22 50h5v4h-5z" fill={cream}/></g><g className="typing-paw-right" transform={`translate(0 ${f?0:-2})`}><path d="M37 50h7v5h-7z" fill={shade}/><path d="M38 50h5v4h-5z" fill={cream}/></g></g>}
    {mood==="excited"&&<path d="M15 2h2v6h-2zM31 0h2v6h-2zM47 2h2v6h-2z" fill="#d9b577"/>}
    {mood==="scroll"&&<g><path d="M6 43h8v17H6zM8 41h4v2H8z" fill="#ddc7a9"/><path d="M8 46h4v11H8z" fill="#b2906d"/></g>}
  </svg>;
}
