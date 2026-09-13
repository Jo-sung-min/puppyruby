import { useId, type CSSProperties } from "react";
import type { DogStyleId, DogVariantLook } from "../lib/dog-styles";
import { AnimatedDog } from "./animated-dog";
import { MeadowPixelDog } from "./meadow-pixel-dog";
import { dogBreeds, type PixelBreed } from "../lib/dog-breeds";
import { breedArt, type BreedArt } from "./dog-breed-art";
import { isCuteDogStyleId, type CuteDogStyleId } from "../lib/cute-dog-styles";
import { CutePixelDog } from "./cute-pixel-dog";
import { isPremiumDogStyleId, type PremiumDogStyleId } from "../lib/premium-dog-styles";
import { PremiumPixelDog } from "./premium-pixel-dog";
import { isOriginalArtDogStyleId, type OriginalArtDogStyleId } from "../lib/original-art-dog-styles";
import { OriginalArtPixelDog } from "./original-art-pixel-dog";
import { art16SceneStyleId } from "../lib/art16-scene-styles";
import { Art16ScenePixelDog } from "./art16-scene-pixel-dog";
import { isSpSceneStyleId, type SpSceneStyleId } from "../lib/sp-scene-styles";
import type { DogSceneId } from "../lib/native-dog-scenes";
import { SpScenePixelDog } from "./sp-scene-pixel-dog";
import bellyStyles from "./puppy-belly-reaction.module.css";

export type { PixelBreed } from "../lib/dog-breeds";
export type PixelMood = "idle" | "love" | "eat" | "play" | "sleep" | "typing" | "excited" | "scroll" | "drag" | "walk" | "belly";
export const pixelBreeds: { id: PixelBreed; name: string; note: string; color: string }[] = dogBreeds.map(({ id, name, note, color }) => ({ id, name, note, color }));
const palettes = Object.fromEntries(dogBreeds.map(item => [item.id,item.palette])) as Record<PixelBreed, readonly [string,string,string]>;

// Fine one-pixel steps round the silhouette without blurring the pixel grid.
function oval(cx: number, cy: number, rx: number, ry: number) {
  let path = "";
  for (let y = Math.floor(cy - ry); y < Math.ceil(cy + ry); y++) {
    const half = rx * Math.sqrt(Math.max(0, 1 - ((y + .5 - cy) / ry) ** 2));
    const left = Math.ceil(cx - half - .5), right = Math.floor(cx + half - .5);
    if (right >= left) path += `M${left} ${y}h${right - left + 1}v1H${left}z`;
  }
  return path;
}
function mix(coat: string, tint: string, amount: number) {
  if (!/^#[0-9a-f]{6}$/i.test(coat)) return tint;
  return "#" + [1, 3, 5].map(index => Math.round(parseInt(coat.slice(index, index + 2), 16) * (1 - amount) + parseInt(tint.slice(index, index + 2), 16) * amount).toString(16).padStart(2, "0")).join("");
}

function luminance(value:string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? parseInt(value.slice(1,3),16)*.299+parseInt(value.slice(3,5),16)*.587+parseInt(value.slice(5,7),16)*.114 : 255;
}

export function PixelDog({ breed = "shiba", mood = "idle", fur, eyes = "#3e332c", accessory = "none", look = 0, lookY = 0, frame = 0, className = "", decorative = false, groundShadow = true, styleId = "classic", variant, scene, paused }: {
  breed?: PixelBreed; mood?: PixelMood; fur?: string; eyes?: string; accessory?: string; look?: number; lookY?: number; frame?: number; className?: string; decorative?: boolean; groundShadow?: boolean; styleId?: DogStyleId; variant?: DogVariantLook; scene?: DogSceneId; paused?: boolean;
}) {
  breed = dogBreeds.find(item => item.id === breed)?.id ?? "pomeranian";
  if (styleId === art16SceneStyleId) return <Art16ScenePixelDog {...{breed,mood,paused,frame,look,lookY,accessory,className,decorative,groundShadow}} scene={scene === "wag" ? "idle" : scene} />;
  if (isSpSceneStyleId(styleId)) return <SpScenePixelDog {...{styleId,breed,mood,scene,paused,frame,look,lookY,accessory,className,decorative,groundShadow}} />;
  if (mood === "belly") return <PixelDog {...{breed,fur,eyes,accessory,frame,decorative,styleId,variant,scene,paused}} mood="idle" look={0} lookY={0} groundShadow={false} className={`${className}${paused ? "" : ` ${bellyStyles.belly}`}`} />;
  if (isPremiumDogStyleId(styleId)) return <PremiumPixelDog {...{styleId,mood,accessory,look,frame,className,decorative,groundShadow}} />;
  if (isOriginalArtDogStyleId(styleId)) return <OriginalArtPixelDog {...{styleId,mood,accessory,look,frame,className,decorative,groundShadow}} />;
  if (styleId === "animated-2d") return <AnimatedDog {...{ breed, mood, fur, eyes, accessory, look, frame, className, decorative, groundShadow, variant }} />;
  if (styleId === "meadow") return <MeadowPixelDog {...{breed,mood,fur,eyes,accessory,look,frame,className,decorative,groundShadow,variant}} />;
  if (isCuteDogStyleId(styleId)) return <CutePixelDog {...{breed,mood,fur,eyes,accessory,look,frame,className,decorative,groundShadow,styleId,variant}} />;
  if ((styleId !== "classic" || breedArt[breed] || variant?.shape === "teddy" || variant?.shape === "fox") && Object.hasOwn(styleShapes, styleId)) return <DesignedDog {...{ breed, mood, fur, eyes, accessory, look, frame, className, decorative, groundShadow, styleId, variant }} />;
  const [base, edge, cream] = palettes[breed];
  const coat = fur || variant?.coatColor || base;
  const shadow = fur || variant?.coatColor ? mix(coat, "#685345", .4) : edge;
  const light = mix(coat, "#fff8eb", .24);
  const floppy = ["poodle", "maltese", "beagle"].includes(breed);
  const fluffy = ["samoyed", "pomeranian", "poodle"].includes(breed);
  const faceWidth = fluffy ? 23 : breed === "beagle" ? 21 : 22;
  const earCoat = breed === "beagle" ? mix(coat, "#735441", .45) : coat;
  const earEdge = breed === "beagle" ? mix(shadow, "#735441", .25) : mix(shadow, coat, .4);
  const tufts = fluffy ? [[14, 23], [11, 30], [14, 38], [50, 23], [53, 30], [50, 38], [23, 12], [32, 10], [41, 12]] : [];
  return <svg viewBox="0 0 64 64" shapeRendering="crispEdges" className={`pixel-dog pixel-${mood} ${className}`} data-dog-style="classic" role={decorative ? undefined : "img"} aria-hidden={decorative || undefined} aria-label={decorative ? undefined : `${pixelBreeds.find(b => b.id === breed)?.name || "포메라니안"} 픽셀 강아지`} style={{ "--dog-coat": coat } as CSSProperties}>
    {groundShadow && <path d={oval(32, 60, 18, 2)} fill="#7d6b55" opacity=".12" />}
    <g className="dog-body">
      <AngelWings id={accessory} />
      <g className="dog-tail"><path d={oval(51, 47, 8, 7) + oval(55, 42, 5, 5)} fill={shadow} /><path d={oval(51, 46, 7, 6) + oval(55, 42, 4, 4)} fill={coat} /><path d={oval(56, 42, 3, 3)} fill={cream} /></g>
      <path d={oval(32, 48, 14, 11)} fill={shadow} />
      <path d={oval(32, 47, 13, 10)} fill={coat} />
      <path d={oval(32, 49, 9, 8)} fill={cream} />
      {variant && variant.pattern !== "solid" && <CoatPattern variant={variant} breed={breed} region="body" silhouette={oval(32,47,13,10)} cx={32} cy={47} rx={13} ry={10} />}
      <g transform={mood === "walk" ? `translate(${frame % 2 ? -1 : 1} ${frame % 2 ? -3 : 0})` : undefined}><path d={oval(22, 56, 5.5, 3.5)} fill={shadow} /><path d={oval(22, 55, 4.5, 3)} fill={cream} /><path d="M20 57h1v1h-1zM23 57h1v1h-1z" fill={light} /></g>
      <g transform={mood === "walk" ? `translate(${frame % 2 ? -1 : 1} ${frame % 2 ? 0 : -3})` : undefined}><path d={oval(42, 56, 5.5, 3.5)} fill={shadow} /><path d={oval(42, 55, 4.5, 3)} fill={cream} /><path d="M40 57h1v1h-1zM43 57h1v1h-1z" fill={light} /></g>
      <g className="dog-head">
        {!floppy && <g transform={breed === "corgi" ? "translate(0 -3)" : undefined}>
          <path d="M13 21V11h1V7h2V5h3v1h2v2h2v2h2v3h2v8zM37 21v-8h2v-3h2V8h2V6h2V5h3v2h2v4h1v10z" fill={shadow} />
          <path d="M15 20V11h1V8h2V7h1v1h2v2h2v3h2v7zM39 20v-7h2v-3h2V8h2V7h1v1h2v3h1v9z" fill={coat} />
          <path d="M17 11h2v2h2v2h2v4h-6zM41 15h2v-2h2v-2h2v8h-6z" fill={breed === "shiba" || breed === "corgi" ? cream : "#f3d3c6"} />
        </g>}
        <path d={oval(32, 29, faceWidth + 1, 19.5)} fill={shadow} />
        {tufts.map(([x, y]) => <path key={`edge-${x}-${y}`} d={oval(x, y, 5, 5)} fill={shadow} />)}
        <path d={oval(32, 29, faceWidth, 18)} fill={coat} />
        {tufts.map(([x, y]) => <path key={`fur-${x}-${y}`} d={oval(x, y, 4, 4)} fill={coat} />)}
        <path d={oval(29, 18, 9, 4)} fill={light} />
        {floppy && <>
          <path d={oval(12, 32, breed === "beagle" ? 7 : 6, 12) + oval(52, 32, breed === "beagle" ? 7 : 6, 12)} fill={earEdge} />
          <path d={oval(12, 32, breed === "beagle" ? 6 : 5, 11) + oval(52, 32, breed === "beagle" ? 6 : 5, 11)} fill={earCoat} />
          <path d={oval(11, 35, 3, 5) + oval(53, 35, 3, 5)} fill={mix(earCoat, "#fff5df", .14)} />
        </>}
        {breed === "corgi" && <path d="M31 13h2v5h1v6h1v5h3v7H26v-7h3v-5h1v-6h1z" fill={cream} />}
        {breed === "beagle" && <path d="M31 12h2v6h1v5h2v6h3v9H25v-9h3v-6h2v-5h1z" fill={cream} />}
        <path d={oval(22, 38, 10, 7) + oval(42, 38, 10, 7) + oval(32, 41, 15, 6)} fill={cream} />
        {variant && variant.pattern !== "solid" && <CoatPattern variant={variant} breed={breed} region="head" silhouette={oval(32,29,faceWidth,18)} cx={32} cy={29} rx={faceWidth} ry={18} />}
        {(breed === "shiba" || breed === "corgi") && <path d={oval(24, 25, 2, 1.5) + oval(40, 25, 2, 1.5)} fill={breed === "shiba" && variant?.pattern === "tuxedo" ? variant.patternColor : cream} />}
        <g transform={`translate(${look} 0)`}>
          {mood === "sleep" ? <path d="M21 30h2v1h3v-1h1v2h-5v-1h-1zM37 30h2v1h3v-1h1v2h-5v-1h-1z" fill={eyes} /> : mood === "love" ? <path d="M21 30h1v-1h4v1h1v1h-2v-1h-2v1h-2zM37 30h1v-1h4v1h1v1h-2v-1h-2v1h-2z" fill={eyes} /> : <g className="dog-eyes"><path d={oval(24, 30.5, 1.8, 2) + oval(40, 30.5, 1.8, 2)} fill={eyes} /><path d="M23 29h1v1h-1zM39 29h1v1h-1z" fill="#fffaf2" /></g>}
          <path d={oval(32, 36, 2.8, 1.8)} fill="#514036" />
          <path d="M31 35h2v1h-2z" fill="#7d6450" />
          <path d="M31 37h2v2h2v-1h2v2h-2v1h-3v-1h-3v-1h-2v-1h2v1h2z" fill="#655044" />
          {mood !== "sleep" && <><path d={oval(32, 42, 2.5, 3)} fill="#bd807b" /><path d={oval(32, 41.5, 1.5, 2.5)} fill="#efa5a0" /></>}
        </g>
        <path d={oval(17, 35, 3, 1.5) + oval(47, 35, 3, 1.5)} fill={mix(cream, "#e4a19b", .4)} />
        {accessory === "ribbon" && <><path d="M43 13h3v1h3v-1h4v1h1v5h-1v1h-4v-2h-3v2h-3v-1h-1v-5h1z" fill="#db8290" /><path d="M46 15h3v3h-3z" fill="#b96478" /><path d="M43 14h2v1h-2zM50 14h2v1h-2z" fill="#f3b9c0" /></>}
        {accessory === "crown" && <><path d="M24 7V1h3v3h4V0h3v4h4V1h3v9H24z" fill="#e7b84c" /><path d="M25 8h15v2H25z" fill="#b67c32" /></>}
        <PaidAccessory id={accessory} top={10} faceY={30.5} />
      </g>
      {accessory === "scarf" && <><path d="M20 48h24v3H20zM39 50h5v7h-5z" fill="#cf665d" /><path d="M21 48h4v3h-4zM32 48h4v3h-4z" fill="#f5c090" /></>}
    </g>
    {mood === "love" && <g fill="#db716e" className="dog-hearts"><path d="M5 10h3v2h2v-2h3v5h-2v2H9v2H7v-2H5z" /><path d="M52 3h3v2h2V3h3v5h-2v2h-2v2h-2v-2h-2z" /></g>}
    {mood === "sleep" && <g fill="#77739a"><path d="M48 12h7v2h-2v2h-2v2h4v2h-7v-2h2v-2h2v-2h-4zM55 2h7v2h-2v2h-2v2h4v2h-7V8h2V6h2V4h-4z" /></g>}
    {mood === "eat" && <g><path d="M23 53h23v6H23zM26 59h17v2H26z" fill="#d77765" /><path d="M25 52h19v3H25z" fill="#684c35" /><path d="M27 51h4v2h-4zM36 50h4v3h-4z" fill="#b18249" /></g>}
    {(mood === "typing" || mood === "excited") && <g>
      <path d="M14 51h37v9H14zM17 60h31v2H17z" fill="#867f77" /><path d="M16 52h33v6H16z" fill="#e7e2d5" />
      <path d="M18 53h3v2h-3zM23 53h3v2h-3zM28 53h3v2h-3zM33 53h3v2h-3zM38 53h3v2h-3zM43 53h3v2h-3zM23 56h17v1H23z" fill="#aaa396" />
      <g className="typing-paw-left" transform={`translate(0 ${frame % 2 ? -3 : 0})`}><path d={oval(24, 51, 4.5, 4)} fill={shadow} /><path d={oval(24, 50, 3.5, 3)} fill={cream} /></g>
      <g className="typing-paw-right" transform={`translate(0 ${frame % 2 ? 0 : -3})`}><path d={oval(40, 51, 4.5, 4)} fill={shadow} /><path d={oval(40, 50, 3.5, 3)} fill={cream} /></g>
    </g>}
    {mood === "excited" && <g fill="#eab997"><path d="M17 2h3v5h-2v4h-3V7h2zM30 0h3v4h-2v4h-3V4h2zM44 2h3v5h-2v4h-3V7h2z" /></g>}
    {mood === "scroll" && <g><path d="M7 43h9v17H7zM9 41h5v2H9z" fill="#e9debf" /><path d="M9 45h5v12H9zM10 42h3v2h-3z" fill="#c79161" /><path d="M11 59h12v3H11z" fill="#e9debf" /></g>}
  </svg>;
}

function CoatPattern({ variant, breed, region, silhouette, cx, cy, rx, ry }: {
  variant: DogVariantLook; breed?:PixelBreed; region: "head" | "body"; silhouette: string; cx: number; cy: number; rx: number; ry: number;
}) {
  const clip = `coat-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const color = variant.patternColor;
  return <g data-coat-pattern={variant.pattern}>
    <defs><clipPath id={clip}><path d={silhouette} /></clipPath></defs>
    <g clipPath={`url(#${clip})`} fill={color}>
      {variant.pattern === "tuxedo" && <path d={region === "body"
        ? oval(cx,cy+3,rx*.65,ry+2)
        : breed === "shiba" ? oval(cx-rx*.35,cy+ry*.4,rx*.4,ry*.35)+oval(cx+rx*.35,cy+ry*.4,rx*.4,ry*.35)+oval(cx,cy+ry*.7,rx*.76,ry*.4)
          : oval(cx,cy+ry*.67,rx*.76,ry*.38)+pixelEar(cx,cy-ry+2,cy+ry,3,1)} />}
      {variant.pattern === "patches" && <path d={oval(cx-rx*.52,cy-ry*.18,rx*.38,ry*.43)+oval(cx+rx*.7,cy+ry*.63,rx*.38,ry*.35)} />}
      {variant.pattern === "freckles" && <>{[[-.63,.16],[-.38,.45],[-.66,.62],[.39,.25],[.67,.51],[.12,-.55],[-.4,-.68]].map(([x,y],index) => <path key={index} d={oval(cx+x*rx,cy+y*ry,region === "body" ? 1.5 : 2,1.5)} />)}</>}
      {variant.pattern === "socks" && <path d={region === "body"
        ? oval(cx-rx*.58,cy+ry*.65,rx*.43,ry*.58)+oval(cx+rx*.58,cy+ry*.65,rx*.43,ry*.58)
        : oval(cx,cy+ry*.93,rx*.5,ry*.22)} />}
      {variant.pattern === "blaze" && <path d={pixelEar(cx,cy-ry-1,cy+ry+1,region === "head" ? Math.max(3,rx*.3) : rx*.45,1)} />}
    </g>
  </g>;
}

function BreedMarkings({ breed, traits, region, silhouette, cx, cy, rx, ry, faceY, eyeGap, cream, coat }: {
  breed: PixelBreed; traits: BreedArt; region: "head" | "body"; silhouette: string;
  cx: number; cy: number; rx: number; ry: number; faceY: number; eyeGap: number; cream: string; coat: string;
}) {
  const clip = `breed-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`, dark = "#383437";
  const top = cy-ry, mark = traits.marking;
  return <g data-breed-marking={`${breed}-${region}`}><defs><clipPath id={clip}><path d={silhouette} /></clipPath></defs><g clipPath={`url(#${clip})`}>
    {region === "body" ? <>
      {mark === "spots" && <g fill={dark}>{[[-.55,-.4,3],[.55,-.3,4],[-.4,.55,2],[.5,.65,3]].map(([x,y,size],i) => <path key={i} d={oval(cx+rx*x,cy+ry*y,size,size*.8)} />)}</g>}
      {mark === "saddle" && <path d={oval(cx+rx*.45,cy-ry*.4,rx*.8,ry)} fill={breed === "yorkshireterrier" ? "#62616a" : mix(coat,dark,.58)} />}
      {(mark === "tuxedo" || mark === "blaze" || mark === "mask") && <path d={oval(cx,cy+2,rx*.62,ry+2)} fill={cream} />}
      {mark === "blacktan" && <path d={oval(cx-rx*.53,cy+ry*.65,rx*.38,ry*.5)+oval(cx+rx*.53,cy+ry*.65,rx*.38,ry*.5)} fill={cream} />}
    </> : <>
      {(mark === "blaze" || mark === "tuxedo" || (mark === "saddle" && breed !== "yorkshireterrier")) && <path d={pixelEar(cx,top-1,cy+ry,mark === "tuxedo" ? rx*.2 : rx*.29,1)} fill={cream} />}
      {mark === "saddle" && breed === "saintbernard" && <path d={oval(cx-eyeGap-3,faceY-2,rx*.27,ry*.55)+oval(cx+eyeGap+3,faceY-2,rx*.27,ry*.55)} fill={mix(coat,dark,.6)} />}
      {mark === "eyepatch" && <path d={oval(cx-eyeGap-1,faceY-4,rx*.44,ry*.72)} fill={dark} />}
      {mark === "mask" && (breed === "husky" ? <><path d={oval(cx-eyeGap,faceY+1,rx*.37,ry*.6)+oval(cx+eyeGap,faceY+1,rx*.37,ry*.6)+pixelEar(cx,top+1,cy+ry,3,1)} fill={cream} /><path d={pixelEar(cx,top-2,faceY,Math.max(2,rx*.15),1)} fill={coat} /></>
        : <path d={oval(cx-rx*.62,faceY+6,rx*.4,ry*.35)+oval(cx+rx*.62,faceY+6,rx*.4,ry*.35)+oval(cx-eyeGap,faceY-6,3,2)+oval(cx+eyeGap,faceY-6,3,2)} fill={cream} />)}
      {mark === "blacktan" && <path d={oval(cx-eyeGap,faceY-5,3,2)+oval(cx+eyeGap,faceY-5,3,2)+oval(cx-rx*.72,faceY+5,3,4)+oval(cx+rx*.72,faceY+5,3,4)} fill={cream} />}
      {mark === "spots" && <g fill={dark}>{[[-.4,-.65,3],[.42,-.4,4],[-.82,.05,3],[.75,.48,2],[-.65,.65,2],[.08,-.9,2]].map(([x,y,size],i) => <path key={i} d={oval(cx+rx*x,cy+ry*y,size,size*.8)} />)}</g>}
      {mark === "tuxedo" && <path d={oval(cx-rx*.55,faceY+8,rx*.48,ry*.3)+oval(cx+rx*.55,faceY+8,rx*.48,ry*.3)} fill={cream} />}
    </>}
  </g></g>;
}

function BreedDetails({ traits, cx, cy, rx, ry, faceY, eyeGap, muzzleY, coat, cream, edge }: {
  traits: BreedArt; cx:number; cy:number; rx:number; ry:number; faceY:number; eyeGap:number; muzzleY:number; coat:string; cream:string; edge:string;
}) {
  const top = Math.max(5,cy-ry+1), detail=traits.detail;
  return <g data-breed-detail={detail}>
    {detail === "topknot" && <><path d={oval(cx-3,top,4,4)+oval(cx+3,top,4,4)+oval(cx,top-2,3,3)} fill={edge} /><path d={oval(cx-3,top,3,3)+oval(cx+3,top,3,3)+oval(cx,top-2,2,2)} fill={cream} /><path d={`M${cx-5} ${top+2}h10v3h-10zM${cx-2} ${top+1}h4v5h-4z`} fill="#d68082" /></>}
    {detail === "beard" && <><path d={oval(cx,muzzleY+5,rx*.58,7)+oval(cx-rx*.4,muzzleY+2,5,6)+oval(cx+rx*.4,muzzleY+2,5,6)} fill={cream} /><path d={oval(cx-eyeGap,faceY-5,5,2)+oval(cx+eyeGap,faceY-5,5,2)} fill={cream} /><path d={`M${cx-5} ${muzzleY+6}v4h1v-4zM${cx} ${muzzleY+7}v4h1v-4zM${cx+5} ${muzzleY+6}v4h1v-4z`} fill={mix(edge,cream,.6)} /></>}
    {detail === "eyebrows" && <path d={`M${cx-eyeGap-4} ${faceY-3}h7v1h2v1h-3v-1h-6zM${cx+eyeGap-4} ${faceY-2}h3v-1h7v1h-6v1h-4z`} fill={edge} />}
    {detail === "wrinkles" && <path d={`M${cx-eyeGap-4} ${faceY-6}h6v1h-6zM${cx+eyeGap-2} ${faceY-6}h6v1h-6zM${cx-3} ${faceY-3}h6v1h-6zM${cx-10} ${muzzleY+3}v4h2v1h3v-1h-3v-4zM${cx+10} ${muzzleY+3}v4h-2v1h-3v-1h3v-4z`} fill={mix(edge,coat,.32)} />}
    {detail === "wisps" && <path d={`M${cx-rx+5} ${faceY+3}h1v6h-1zM${cx-rx+8} ${faceY+6}h1v6h-1zM${cx+rx-5} ${faceY+3}h1v6h-1zM${cx+rx-8} ${faceY+6}h1v6h-1zM${cx-4} ${muzzleY+6}h1v4h-1zM${cx+3} ${muzzleY+6}h1v4h-1z`} fill={mix(edge,cream,.45)} />}
  </g>;
}

function PaidAccessory({ id, top, faceY, gap = 8, side = 46 }: { id: string; top: number; faceY: number; gap?: number; side?: number }) {
  const y = Math.max(1, top), bow = id === "bow-blue" ? "#66a7dd" : "#b292d8";
  if (id === "bow-blue" || id === "bow-lilac") return <g transform={`translate(${side - 6} ${y + 1})`} data-cosmetic={id}><path d="M0 0h3v1h3V0h4v1h1v5h-1v1H6V5H3v2H0v-1h-1V1h1z" fill={bow} /><path d="M3 2h3v3H3z" fill={mix(bow,"#403c68",.35)} /><path d="M0 1h2v1H0zM7 1h2v1H7z" fill="#f6f3ff" /></g>;
  if (id === "party-hat") return <g transform={`translate(25 ${Math.max(1,y - 5)})`} data-cosmetic={id}><path d="M6 0h3v3h1v3h2v3h2v4H0V9h2V6h2V3h2z" fill="#a28ace" /><path d="M2 8h10v2H2zM5 3h5v2H5z" fill="#f3c976" /><path d="M0 12h14v2H0z" fill="#68547f" /><path d="M6 0h3v2H6z" fill="#fff2c5" /></g>;
  if (id === "flower") return <g transform={`translate(${side} ${y + 5})`} data-cosmetic={id}><path d={oval(0,-3,3,3)+oval(-3,0,3,3)+oval(3,0,3,3)+oval(0,3,3,3)} fill="#f1adc1" /><path d={oval(0,0,2,2)} fill="#f4d26d" /><path d="M2 5h3V3h2v4H2z" fill="#7ca777" /></g>;
  if (id === "glasses") return <g data-cosmetic={id} fill="none" stroke="#3f414c" strokeWidth="1.5"><circle cx={32-gap} cy={faceY} r={Math.max(3,gap-3)} /><circle cx={32+gap} cy={faceY} r={Math.max(3,gap-3)} /><path d={`M${32-gap+Math.max(3,gap-3)} ${faceY}h${2*gap-2*Math.max(3,gap-3)}`} /></g>;
  if (id === "halo") return <g data-cosmetic={id}><path d={oval(32,Math.max(3,y-2),11,3)} fill="#c79434" /><path d={oval(32,Math.max(3,y-2),9,2)} fill="#fbe49b" /><path d={oval(32,Math.max(3,y-2),7,1)} fill="#fff9dc" /></g>;
  return null;
}
function AngelWings({ id }: { id: string }) {
  return id === "angel-wings" ? <g data-cosmetic={id}><path d="M18 44L6 31H3v13l4 7 9 4h7zM46 44l12-13h3v13l-4 7-9 4h-7z" fill="#a6b6d1" /><path d="M18 46L5 34v9l4 6 10 4zM46 46l13-12v9l-4 6-10 4z" fill="#f3f6ff" /><path d="M7 42l8 7M57 42l-8 7" stroke="#c5cee5" strokeWidth="2" /></g> : null;
}

// Every style changes geometry at the native 64px grid. These renderers stay
// independent of browser state so web previews and desktop exports match.
type StyledId = Exclude<DogStyleId, "animated-2d" | "meadow" | CuteDogStyleId | PremiumDogStyleId | OriginalArtDogStyleId | typeof art16SceneStyleId | SpSceneStyleId>;
type Shape = {
  head: [number, number, number, number]; body: [number, number, number, number];
  feet: [number, number, number, number]; faceY: number; eyeGap: number;
  eye: "sparkle" | "dots" | "button" | "square" | "smile" | "tiny" | "oval" | "sleepy" | "wink" | "happy" | "diamond" | "lashes";
  mouth: "smile" | "small" | "open" | "w"; ear: "point" | "round" | "short" | "fold" | "square" | "bat";
  border: number; grid: number; face: "oval" | "box" | "cut" | "diamond" | "hex"; muzzle: number;
  earWidth?: number; earHeight?: number; dropWidth?: number; dropHeight?: number;
  tuftCount?: number; tuftSize?: number; bodyBox?: boolean;
  pose?: "hug" | "loaf" | "tiptoe"; detail?: "freckles" | "patch" | "stitch" | "waffle" | "seams" | "folds" | "sprout" | "panda";
};
const styleShapes: Record<StyledId, Shape> = {
  classic: { head:[32,29,22,18], body:[32,47,13,10], feet:[22,42,56,5], faceY:30, eyeGap:8, eye:"dots", mouth:"smile", ear:"point", border:1, grid:1, face:"oval", muzzle:13 },
  round: { head:[32,29,21,20], body:[32,49,12,10], feet:[21,43,56,5], faceY:31, eyeGap:8, eye:"sparkle", mouth:"smile", ear:"short", border:1, grid:1, face:"oval", muzzle:12 },
  mochi: { head:[32,35,25,17], body:[32,51,16,7], feet:[20,44,57,4], faceY:36, eyeGap:10, eye:"smile", mouth:"small", ear:"short", border:1, grid:1, face:"oval", muzzle:14 },
  chibi: { head:[32,28,24,22], body:[32,52,8,7], feet:[26,38,58,4], faceY:30, eyeGap:10, eye:"sparkle", mouth:"open", ear:"point", border:1, grid:1, face:"oval", muzzle:13 },
  bean: { head:[32,26,17,18], body:[32,40,18,20], feet:[24,40,58,4], faceY:28, eyeGap:6, eye:"dots", mouth:"small", ear:"short", border:1, grid:1, face:"oval", muzzle:9 },
  plush: { head:[32,28,19,18], body:[32,47,15,12], feet:[20,44,56,7], faceY:29, eyeGap:8, eye:"button", mouth:"w", ear:"round", border:2, grid:1, face:"oval", muzzle:10 },
  storybook: { head:[32,23,17,16], body:[32,45,12,14], feet:[24,40,57,5], faceY:25, eyeGap:7, eye:"dots", mouth:"smile", ear:"point", border:1, grid:1, face:"oval", muzzle:9 },
  bold: { head:[32,29,22,18], body:[32,49,13,10], feet:[22,42,56,6], faceY:29, eyeGap:9, eye:"square", mouth:"open", ear:"point", border:3, grid:1, face:"box", muzzle:13 },
  retro: { head:[32,28,22,18], body:[32,48,12,10], feet:[22,42,56,6], faceY:30, eyeGap:8, eye:"square", mouth:"w", ear:"point", border:2, grid:2, face:"box", muzzle:12 },
  mini: { head:[32,35,13,12], body:[32,50,7,8], feet:[27,37,57,3], faceY:35, eyeGap:5, eye:"tiny", mouth:"small", ear:"short", border:1, grid:1, face:"box", muzzle:7 },
  sticker: { head:[32,30,22,20], body:[32,50,11,9], feet:[22,42,57,5], faceY:31, eyeGap:9, eye:"smile", mouth:"open", ear:"point", border:2, grid:1, face:"oval", muzzle:12 },
  soft: { head:[32,31,23,18], body:[32,50,13,9], feet:[22,42,57,5], faceY:33, eyeGap:8, eye:"tiny", mouth:"small", ear:"round", border:1, grid:1, face:"oval", muzzle:13 },
  fluffy: { head:[32,29,21,18], body:[32,48,16,11], feet:[20,44,56,6], faceY:30, eyeGap:8, eye:"dots", mouth:"smile", ear:"point", border:1, grid:1, face:"oval", muzzle:12 },
  pocket: { head:[32,24,21,18], body:[32,47,13,11], feet:[23,41,44,5], faceY:26, eyeGap:8, eye:"button", mouth:"small", ear:"short", border:1, grid:1, face:"oval", muzzle:11 },
  cookie: { head:[32,29,21,19], body:[32,48,14,11], feet:[22,42,57,5], faceY:30, eyeGap:8, eye:"button", mouth:"w", ear:"round", border:2, grid:1, face:"oval", muzzle:11 },
  badge: { head:[32,32,23,22], body:[32,48,0,0], feet:[22,42,57,0], faceY:33, eyeGap:9, eye:"sparkle", mouth:"smile", ear:"point", border:1, grid:1, face:"oval", muzzle:13 },
  marshmallow: { head:[32,30,20,19], body:[32,50,11,9], feet:[23,41,57,5], faceY:31, eyeGap:8, eye:"oval", mouth:"small", ear:"short", border:1, grid:1, face:"cut", muzzle:11, earWidth:5 },
  dumpling: { head:[32,34,24,17], body:[32,51,12,7], feet:[24,40,57,4], faceY:35, eyeGap:9, eye:"dots", mouth:"w", ear:"fold", border:1, grid:1, face:"oval", muzzle:13, earWidth:7, dropHeight:.58 },
  pebble: { head:[32,35,22,14], body:[32,50,10,8], feet:[25,39,57,3], faceY:35, eyeGap:8, eye:"tiny", mouth:"smile", ear:"short", border:1, grid:1, face:"hex", muzzle:12, earWidth:4, dropHeight:.55 },
  jellybean: { head:[32,26,16,20], body:[32,47,13,12], feet:[22,42,57,4], faceY:28, eyeGap:6, eye:"oval", mouth:"open", ear:"round", border:1, grid:1, face:"oval", muzzle:9, earWidth:5, dropWidth:5 },
  teacup: { head:[32,32,19,17], body:[32,51,7,8], feet:[28,36,58,3], faceY:33, eyeGap:7, eye:"sparkle", mouth:"small", ear:"short", border:1, grid:1, face:"oval", muzzle:10, pose:"hug", dropWidth:4 },
  loaf: { head:[30,30,18,16], body:[32,49,23,9], feet:[19,45,56,4], faceY:31, eyeGap:7, eye:"sleepy", mouth:"w", ear:"fold", border:1, grid:1, face:"oval", muzzle:10, pose:"loaf", dropHeight:.55 },
  pear: { head:[32,23,15,15], body:[32,45,19,14], feet:[22,42,57,5], faceY:25, eyeGap:6, eye:"dots", mouth:"smile", ear:"short", border:1, grid:1, face:"oval", muzzle:8, earWidth:5, dropWidth:4 },
  egg: { head:[32,29,17,23], body:[32,51,9,8], feet:[25,39,58,4], faceY:33, eyeGap:6, eye:"tiny", mouth:"small", ear:"round", border:1, grid:1, face:"oval", muzzle:10, earWidth:4, dropHeight:.55 },
  snowball: { head:[32,29,22,21], body:[32,50,14,9], feet:[21,43,56,6], faceY:31, eyeGap:9, eye:"sparkle", mouth:"small", ear:"round", border:1, grid:1, face:"oval", muzzle:13, tuftCount:14, tuftSize:3, dropWidth:5 },
  teddy: { head:[32,25,18,17], body:[32,46,15,13], feet:[21,43,56,6], faceY:27, eyeGap:7, eye:"button", mouth:"w", ear:"round", border:2, grid:1, face:"oval", muzzle:10, earWidth:8, pose:"hug", dropWidth:7, dropHeight:.6 },
  panda: { head:[32,28,21,19], body:[32,48,13,11], feet:[24,40,56,6], faceY:29, eyeGap:8, eye:"dots", mouth:"small", ear:"round", border:1, grid:1, face:"oval", muzzle:11, earWidth:7, detail:"panda", pose:"hug" },
  cub: { head:[32,31,22,17], body:[32,50,13,9], feet:[20,44,57,6], faceY:31, eyeGap:9, eye:"button", mouth:"w", ear:"round", border:2, grid:1, face:"hex", muzzle:14, earWidth:7, earHeight:2, dropHeight:.55 },
  foxlet: { head:[32,29,21,18], body:[32,48,10,11], feet:[25,39,57,4], faceY:28, eyeGap:9, eye:"lashes", mouth:"smile", ear:"point", border:1, grid:1, face:"diamond", muzzle:12, earWidth:7, earHeight:8, dropWidth:5 },
  longbody: { head:[29,26,16,15], body:[33,46,23,11], feet:[17,48,57,4], faceY:28, eyeGap:6, eye:"oval", mouth:"w", ear:"short", border:1, grid:1, face:"oval", muzzle:9, dropWidth:4, dropHeight:.7 },
  tinyhead: { head:[32,19,12,12], body:[32,41,13,16], feet:[24,40,57,4], faceY:21, eyeGap:5, eye:"tiny", mouth:"small", ear:"point", border:1, grid:1, face:"oval", muzzle:7, earWidth:4, dropWidth:4, pose:"tiptoe" },
  bigpaws: { head:[32,25,18,17], body:[32,46,13,10], feet:[20,44,55,9], faceY:27, eyeGap:8, eye:"sparkle", mouth:"open", ear:"short", border:2, grid:1, face:"oval", muzzle:10, dropWidth:5 },
  cheeky: { head:[32,31,24,18], body:[32,51,10,8], feet:[25,39,58,4], faceY:31, eyeGap:8, eye:"wink", mouth:"w", ear:"short", border:1, grid:1, face:"oval", muzzle:15, detail:"freckles", tuftCount:6, tuftSize:3 },
  squircle: { head:[32,28,20,19], body:[32,49,13,10], feet:[22,42,57,5], faceY:29, eyeGap:8, eye:"button", mouth:"small", ear:"round", border:2, grid:1, face:"cut", muzzle:11, bodyBox:true, earWidth:5 },
  diamond: { head:[32,29,23,21], body:[32,49,11,10], feet:[24,40,57,4], faceY:29, eyeGap:8, eye:"diamond", mouth:"smile", ear:"point", border:2, grid:1, face:"diamond", muzzle:11, earWidth:5 },
  toast: { head:[32,27,19,22], body:[32,51,10,8], feet:[24,40,58,4], faceY:31, eyeGap:7, eye:"oval", mouth:"w", ear:"short", border:3, grid:1, face:"cut", muzzle:11, bodyBox:true, dropWidth:4 },
  waffle: { head:[32,31,23,16], body:[32,50,13,9], feet:[22,42,57,5], faceY:31, eyeGap:9, eye:"square", mouth:"small", ear:"square", border:2, grid:1, face:"box", muzzle:12, detail:"waffle", bodyBox:true },
  pixel8: { head:[32,29,20,18], body:[32,48,12,10], feet:[22,42,56,5], faceY:30, eyeGap:8, eye:"tiny", mouth:"w", ear:"square", border:2, grid:2, face:"hex", muzzle:10, bodyBox:true, dropWidth:6 },
  arcade: { head:[32,28,22,19], body:[32,49,12,10], feet:[22,42,56,6], faceY:30, eyeGap:8, eye:"diamond", mouth:"open", ear:"point", border:3, grid:2, face:"cut", muzzle:12, earWidth:7, bodyBox:true },
  robot: { head:[32,26,18,17], body:[32,47,13,11], feet:[22,42,56,6], faceY:27, eyeGap:7, eye:"square", mouth:"small", ear:"square", border:2, grid:1, face:"box", muzzle:10, detail:"seams", bodyBox:true, dropWidth:5, dropHeight:.6 },
  paper: { head:[32,26,19,17], body:[32,47,10,11], feet:[25,39,57,4], faceY:28, eyeGap:7, eye:"lashes", mouth:"smile", ear:"point", border:1, grid:1, face:"hex", muzzle:10, bodyBox:true, pose:"tiptoe", dropWidth:4 },
  origami: { head:[32,29,22,18], body:[32,49,13,10], feet:[22,42,57,5], faceY:30, eyeGap:8, eye:"tiny", mouth:"w", ear:"fold", border:1, grid:1, face:"diamond", muzzle:11, detail:"folds", bodyBox:true, dropHeight:.65 },
  patchwork: { head:[32,28,20,19], body:[32,48,14,11], feet:[21,43,57,6], faceY:30, eyeGap:8, eye:"button", mouth:"w", ear:"fold", border:2, grid:1, face:"cut", muzzle:11, detail:"patch", dropWidth:6 },
  pompom: { head:[32,28,20,18], body:[32,49,15,10], feet:[21,43,57,5], faceY:29, eyeGap:8, eye:"oval", mouth:"open", ear:"round", border:1, grid:1, face:"oval", muzzle:11, tuftCount:10, tuftSize:5, earWidth:5 },
  cloudlet: { head:[32,33,23,15], body:[32,50,15,9], feet:[22,42,57,5], faceY:33, eyeGap:9, eye:"happy", mouth:"small", ear:"short", border:1, grid:1, face:"oval", muzzle:13, tuftCount:8, tuftSize:4, dropHeight:.6 },
  sprout: { head:[32,29,18,19], body:[32,49,12,10], feet:[23,41,57,4], faceY:30, eyeGap:7, eye:"dots", mouth:"smile", ear:"point", border:1, grid:1, face:"oval", muzzle:10, detail:"sprout", earWidth:5, earHeight:7, dropHeight:.9 },
  sleepy: { head:[32,36,23,15], body:[32,51,17,7], feet:[20,44,57,5], faceY:36, eyeGap:9, eye:"sleepy", mouth:"small", ear:"fold", border:1, grid:1, face:"oval", muzzle:12, pose:"loaf", dropHeight:.55 },
  wink: { head:[32,28,21,20], body:[32,49,12,10], feet:[23,41,57,5], faceY:30, eyeGap:8, eye:"wink", mouth:"smile", ear:"round", border:1, grid:1, face:"oval", muzzle:12, earWidth:6, detail:"freckles" },
  happy: { head:[32,29,22,20], body:[32,50,11,9], feet:[22,42,57,5], faceY:29, eyeGap:9, eye:"happy", mouth:"open", ear:"point", border:1, grid:1, face:"cut", muzzle:12, earWidth:6, tuftCount:5, tuftSize:3 },
  hug: { head:[32,24,19,18], body:[32,46,16,13], feet:[21,43,57,6], faceY:26, eyeGap:7, eye:"sparkle", mouth:"smile", ear:"round", border:1, grid:1, face:"oval", muzzle:10, pose:"hug", detail:"stitch", earWidth:6 },
};

function gridOval(cx: number, cy: number, rx: number, ry: number, grid = 1) {
  if (rx <= 0 || ry <= 0) return "";
  if (grid === 1) return oval(cx, cy, rx, ry);
  let path = "";
  for (let y = Math.floor((cy - ry) / grid) * grid; y < cy + ry; y += grid) {
    const half = rx * Math.sqrt(Math.max(0, 1 - ((y + grid / 2 - cy) / ry) ** 2));
    const left = Math.round((cx - half) / grid) * grid, right = Math.round((cx + half) / grid) * grid;
    if (right > left) path += `M${left} ${y}h${right - left}v${grid}H${left}z`;
  }
  return path;
}
function gridBox(cx: number, cy: number, rx: number, ry: number, grid = 1) {
  const x = Math.round((cx - rx) / grid) * grid, y = Math.round((cy - ry) / grid) * grid;
  const w = Math.round(rx * 2 / grid) * grid, h = Math.round(ry * 2 / grid) * grid;
  if (Math.min(w, h) < grid * 4) return `M${x} ${y}h${w}v${h}H${x}z`;
  const step = Math.min(grid * 2, Math.floor(Math.min(w, h) / (4 * grid)) * grid);
  return `M${x + step * 2} ${y}h${w - step * 4}v${step}h${step}v${step}h${step}v${h - step * 4}h-${step}v${step}h-${step}v${step}H${x + step * 2}v-${step}h-${step}v-${step}h-${step}V${y + step * 2}h${step}v-${step}h${step}z`;
}
function angularFace(cx: number, cy: number, rx: number, ry: number, kind: "cut" | "diamond" | "hex", grid: number) {
  let path = "";
  for (let y = Math.floor((cy-ry)/grid)*grid; y < cy+ry; y += grid) {
    const distance = Math.min(1,Math.abs((y+grid/2-cy)/ry));
    const factor = kind === "diamond" ? 1-distance*.65 : kind === "hex" ? 1-Math.max(0,distance-.45)*.7 : 1-Math.max(0,distance-.72)*.72;
    const left = Math.round((cx-rx*factor)/grid)*grid, width = Math.round(rx*factor*2/grid)*grid;
    path += `M${left} ${y}h${width}v${grid}H${left}z`;
  }
  return path;
}
function pixelEar(cx: number, top: number, bottom: number, halfWidth: number, grid: number) {
  let path = "";
  const start = Math.max(grid, Math.round(top / grid) * grid);
  const end = Math.round(bottom / grid) * grid;
  for (let y = start; y < end; y += grid) {
    const half = Math.max(grid, Math.round((1 + (y - start) / Math.max(1, end - start) * halfWidth) / grid) * grid);
    path += `M${Math.round(cx / grid) * grid - half} ${y}h${half * 2}v${grid}h-${half * 2}z`;
  }
  return path;
}

type DesignedProps = {
  breed: PixelBreed; mood: PixelMood; fur?: string; eyes: string; accessory: string; look: number; frame: number;
  className: string; decorative: boolean; groundShadow: boolean; styleId: StyledId; variant?: DogVariantLook;
};
function DesignedDog({ breed, mood, fur, eyes, accessory, look, frame, className, decorative, groundShadow, styleId, variant }: DesignedProps) {
  const traits = breedArt[breed];
  const selectedShape = styleShapes[styleId];
  // Breed proportions are applied before the owner's teddy/fox silhouette choice.
  // The existing seven breeds retain their original style geometry.
  const originalShape: Shape = traits ? { ...selectedShape,
    head: [selectedShape.head[0],selectedShape.head[1],Math.min(24,Math.round(selectedShape.head[2]*(traits.headWidth ?? 1))),Math.min(selectedShape.head[1]-4,Math.round(selectedShape.head[3]*(traits.headHeight ?? 1)))],
    body: [selectedShape.body[0],selectedShape.body[1],Math.min(24,Math.round(selectedShape.body[2]*(traits.bodyWidth ?? 1))),Math.min(60-selectedShape.body[1]-selectedShape.border,Math.round(selectedShape.body[3]*(traits.bodyHeight ?? 1)))],
    muzzle: Math.min(16,Math.round(selectedShape.muzzle*(traits.muzzle ?? 1))),
    ear: traits.ears === "drop" ? selectedShape.ear : traits.ears ?? selectedShape.ear,
    earWidth: traits.earWidth ? Math.max(3,Math.round(traits.earWidth*selectedShape.head[2]/22)) : selectedShape.earWidth,
    earHeight: traits.earHeight ?? selectedShape.earHeight,
    dropWidth: traits.earWidth ? Math.max(3,Math.round(traits.earWidth*selectedShape.head[2]/22)) : selectedShape.dropWidth,
    dropHeight: traits.earLength ?? selectedShape.dropHeight,
  } : selectedShape;
  const s: Shape = variant?.shape === "teddy" ? { ...originalShape,
    head:[originalShape.head[0],originalShape.head[1],Math.min(24,originalShape.head[2]+1),originalShape.head[3]],
    ear:"round", earWidth:7, earHeight:2, muzzle:Math.min(15,originalShape.muzzle+1), face:"oval",
  } : variant?.shape === "fox" ? { ...originalShape,
    head:[originalShape.head[0],originalShape.head[1],Math.max(12,originalShape.head[2]-1),originalShape.head[3]],
    ear:"point", earWidth:6, earHeight:8, muzzle:Math.max(7,originalShape.muzzle-2), face:"diamond",
  } : originalShape;
  const [hx, hy, rx, ry] = s.head, [bx, by, brx, bry] = s.body;
  const [leftFoot, rightFoot, footY, footSize] = s.feet;
  const [base, baseEdge, cream] = palettes[breed];
  const coat = fur || variant?.coatColor || base;
  const shade = fur || variant?.coatColor ? mix(coat, "#685345", .4) : baseEdge;
  const edge = styleId === "bold" || styleId === "retro" ? mix(shade, "#332d29", .72)
    : styleId === "soft" ? mix(shade, coat, .48) : styleId === "cookie" ? mix(shade, "#75503c", .28) : shade;
  const highlight = mix(coat, "#fff8eb", styleId === "soft" ? .12 : .28);
  const ink = styleId === "cookie" ? mix(eyes, "#66432d", .25) : eyes;
  const floppy = (!variant || variant.shape === "original") && (traits ? traits.ears === "drop" : breed === "poodle" || breed === "maltese" || breed === "beagle");
  const naturallyFluffy = Boolean(traits?.fluff) || breed === "pomeranian" || breed === "samoyed" || breed === "poodle";
  const coarse = s.grid, p = (x: number, y: number, w: number, h: number) => gridOval(x, y, w, h, coarse);
  const face = (w: number, h: number) => s.face === "box" ? gridBox(hx, hy, w, h, coarse) : s.face === "oval" ? p(hx, hy, w, h) : angularFace(hx,hy,w,h,s.face,coarse);
  const body = (w: number, h: number, y = by) => s.bodyBox ? gridBox(bx,y,w,h,coarse) : p(bx,y,w,h);
  const earX = Math.round(rx * .7), earTop = Math.max(2, hy - ry - (s.earHeight ?? (s.ear === "short" ? 1 : breed === "corgi" ? 10 : 6)));
  const earBottom = hy - Math.round(ry * .35);
  const earWidth = s.earWidth ?? (styleId === "mini" ? 4 : breed === "corgi" ? 8 : 6);
  const earFill = breed === "beagle" ? mix(coat, "#6c4d39", .56) : traits?.earShade ? mix(coat,"#352d2b",traits.earShade) : coat;
  const dropX = Math.round(rx * (traits ? .83 : .88)), dropY = hy + (breed === "maltese" ? 3 : 1);
  const dropW = s.dropWidth ?? (styleId === "mini" ? 4 : breed === "beagle" ? 7 : breed === "poodle" ? 6 : 5);
  const desiredDropH = Math.round(ry * (s.dropHeight ?? (breed === "beagle" ? .83 : breed === "maltese" ? .76 : .62)));
  const dropH = traits ? Math.min(dropY-s.border-coarse,60-dropY-s.border,desiredDropH) : desiredDropH;
  const tufts: [number, number, number][] = [];
  if (naturallyFluffy || styleId === "fluffy" || styleId === "cookie" || s.tuftCount) {
    const count = s.tuftCount ?? (styleId === "fluffy" ? 18 : styleId === "cookie" ? 12 : traits?.fluff ?? (breed === "poodle" ? 11 : 9));
    const tuftSize = s.tuftSize ?? (styleId === "mini" ? 2 : styleId === "fluffy" ? 4 : styleId === "cookie" ? 4 : traits?.tuftSize ?? 3);
    for (let index = 0; index < count; index++) {
      const angle = (index / count) * Math.PI * 2;
      if (!naturallyFluffy && styleId !== "fluffy" && styleId !== "cookie" && !s.tuftCount) continue;
      const tx=Math.round(hx+Math.cos(angle)*(rx-2)), ty=Math.round(hy+Math.sin(angle)*(ry-1));
      const margin=tuftSize+s.border+coarse;
      tufts.push([traits ? Math.max(margin,Math.min(64-margin,tx)) : tx,traits ? Math.max(margin,Math.min(64-margin,ty)) : ty,tuftSize]);
    }
  }
  const muzzleY = s.faceY + (styleId === "mini" ? 4 : 6);
  const muzzleH = styleId === "mini" ? 4 : styleId === "storybook" ? 5 : 6;
  const eyeX1 = hx - s.eyeGap, eyeX2 = hx + s.eyeGap;
  const noseY = muzzleY - 1;
  const lookX = Number.isFinite(look) ? Math.max(-2, Math.min(2, Math.round(look))) : 0;
  const ribbonX = Math.min(48, hx + Math.round(rx * .57)), ribbonY = Math.max(3, hy - ry + 2);
  const crownY = Math.max(0, hy - ry - 8);
  const sproutY = traits ? Math.max(14,hy-ry+4) : hy-ry+4;
  const isPortrait = styleId === "badge";
  const paws = [leftFoot, rightFoot];
  const breedName = pixelBreeds.find(item => item.id === breed)?.name || "포메라니안";
  function pointedEars(padding = 0) {
    return [-1, 1].map(side => {
      const center = hx + side * earX;
      const roundedY = Math.max(earTop + 7, 11 + padding);
      if (s.ear === "bat") {
        const cy = Math.round((earTop+earBottom+4)/2), height = Math.max(5,Math.floor((earBottom+4-earTop)/2));
        return <g key={side}><path d={p(center,cy,earWidth+padding,height+padding)} fill={padding ? "#fffdf8" : edge} />{!padding && <><path d={p(center,cy,Math.max(2,earWidth-s.border),height-s.border)} fill={coat} /><path d={p(center,cy-1,Math.max(2,earWidth-3),Math.max(3,height-4))} fill="#e8bab0" /></>}</g>;
      }
      if (s.ear === "square") return <g key={side}><path d={gridBox(center,earTop+7,earWidth,7,coarse)} fill={edge} /><path d={gridBox(center,earTop+7,Math.max(2,earWidth-s.border),5,coarse)} fill={coat} /><path d={gridBox(center,earTop+7,2,3,coarse)} fill={cream} /></g>;
      if (s.ear === "fold") return <g key={side}><path d={pixelEar(center,earTop,earBottom+3,earWidth+1,coarse)} fill={edge} /><path d={pixelEar(center,earTop+2,earBottom+2,earWidth-1,coarse)} fill={coat} /><path d={`M${center-earWidth+2} ${earTop+6}h${earWidth*2-4}l-${earWidth-2} 7z`} fill={mix(edge,coat,.3)} /></g>;
      return <g key={side}>
        <path d={s.ear === "round" ? p(center, roundedY, earWidth + padding, 9 + padding) : pixelEar(center, earTop - padding, earBottom + padding, earWidth + padding, coarse)} fill={padding ? "#fffdf8" : edge} />
        {!padding && <><path d={s.ear === "round" ? p(center, roundedY, Math.max(2, earWidth - s.border), 8 - s.border) : pixelEar(center, earTop + s.border + 1, earBottom, Math.max(2, earWidth - s.border), coarse)} fill={coat} />
          <path d={s.ear === "round" ? p(center, roundedY, 3, 5) : pixelEar(center, earTop + 5, earBottom - 1, Math.max(2, earWidth - 4), coarse)} fill={breed === "shiba" || breed === "corgi" ? cream : "#efc9c2"} /></>}
      </g>;
    });
  }
  function eye(x: number) {
    const y = s.faceY;
    if (mood === "sleep") return <path key={x} d={`M${x - 3} ${y}h2v1h3v-1h2v2h-2v1h-3v-1h-2z`} fill={ink} />;
    if (s.eye === "wink" && x > hx && mood !== "love") return <path key={x} d={`M${x-3} ${y-2}h2v1h2v1h2v1h-2v1h-2v1h-2v-2h3v-1h-3z`} fill={ink} />;
    if (s.eye === "sleepy" && mood !== "love") return <g key={x}><path d={`M${x-3} ${y-1}h6v2h-1v2h-4v-2h-1z`} fill={ink} /><path d={`M${x-3} ${y-2}h6v1h-6z`} fill={edge} /></g>;
    if (s.eye === "happy") return <path key={x} d={`M${x-4} ${y+1}v-2h1v-2h2v-1h2v1h2v2h1v2h-2v-2h-4v2z`} fill={ink} />;
    if (s.eye === "diamond" && mood !== "love") return <g key={x}><path d={angularFace(x,y,4,4,"diamond",1)} fill={ink} /><path d={`M${x-1} ${y-2}h2v2h-2z`} fill="#fffdf6" /></g>;
    if (s.eye === "lashes" && mood !== "love") return <g key={x}><path d={p(x,y,3,2)} fill={ink} /><path d={`M${x-4} ${y-2}h2v2h-2zM${x+2} ${y-3}h2v2h-2z`} fill={ink} /><path d={`M${x-1} ${y-1}h1v1h-1z`} fill="#fffdf6" /></g>;
    if (s.eye === "oval" && mood !== "love") return <g key={x}><path d={p(x,y,2.5,4)} fill={ink} /><path d={`M${x-1} ${y-2}h1v2h-1z`} fill="#fffdf6" /></g>;
    if (mood === "love" || s.eye === "smile") return <path key={x} d={`M${x - 3} ${y + 1}v-2h1v-1h4v1h1v2h-2v-1h-2v1z`} fill={ink} />;
    if (s.eye === "square") return <g key={x}><path d={gridBox(x, y, 3, 3, coarse)} fill={ink} />{styleId !== "retro" && <path d={`M${x - 2} ${y - 2}h2v2h-2z`} fill="#fffdf6" />}</g>;
    if (s.eye === "tiny") return <path key={x} d={`M${x - 1} ${y - 1}h2v2h-2z`} fill={ink} />;
    const sparkle = s.eye === "sparkle", button = s.eye === "button";
    const size = (sparkle ? (styleId === "chibi" ? 4 : 3) : button ? 3 : 2)*(traits?.eyeScale ?? 1);
    return <g key={x}><path d={p(x, y, size, sparkle ? size + 1 : size)} fill={ink} />
      {sparkle && <><path d={`M${x - 2} ${y - 3}h2v2h-2z`} fill="#fffdf6" /><path d={`M${x + 1} ${y + 1}h1v1h-1z`} fill="#fffdf6" /></>}
      {button && styleId === "plush" && <path d={`M${x - 1} ${y - 1}h1v1h-1zM${x + 1} ${y + 1}h1v1h-1z`} fill={highlight} />}
      {traits && !sparkle && <path d={`M${x-1} ${y-1}h1v1h-1z`} fill="#fffdf6" />}
    </g>;
  }
  return <svg viewBox="0 0 64 64" shapeRendering="crispEdges" className={`pixel-dog pixel-${mood} dog-style-${styleId} ${className}`} data-dog-style={styleId} role={decorative ? undefined : "img"} aria-hidden={decorative || undefined} aria-label={decorative ? undefined : `${breedName} 픽셀 강아지`} style={{ "--dog-coat": coat } as CSSProperties}>
    {groundShadow && !isPortrait && <path d={p(32, 61, styleId === "mini" ? 11 : 18, 2)} fill="#7d6b55" opacity=".12" />}
    {isPortrait && <><path d={p(32,33,30,30)} fill={edge} /><path d={p(32,33,28,28)} fill={mix(coat,cream,.7)} /><path d="M18 58h28v3H18z" fill={edge} /></>}
    {styleId === "sticker" && <g fill="#fffdf8"><path d={p(bx,by,brx+4,bry+3)+p(hx,hy,rx+4,ry+3)+p(54,47,8,9)} />{!floppy && pointedEars(3)}{floppy && <path d={p(hx-dropX,dropY,dropW+4,dropH+4)+p(hx+dropX,dropY,dropW+4,dropH+4)} />}</g>}
    <g className="dog-body">
      <AngelWings id={accessory} />
      <g className="dog-tail">{!isPortrait && <>
        <path d={p(styleId === "mini" ? 42 : 51,48,styleId === "mini" ? 5 : 8,styleId === "plush" ? 9 : 7)+p(styleId === "mini" ? 45 : 55,42,styleId === "mini" ? 3 : 5,5)} fill={edge} />
        <path d={p(styleId === "mini" ? 42 : 51,47,styleId === "mini" ? 4 : 7,6)+p(styleId === "mini" ? 45 : 55,42,styleId === "mini" ? 2 : 4,4)} fill={coat} />
        <path d={p(styleId === "mini" ? 45 : 56,42,styleId === "mini" ? 1 : 3,3)} fill={cream} />
      </>}</g>
      {!isPortrait && <>
        <path d={body(brx+s.border,bry+s.border)} fill={edge} />
        <path d={body(brx,bry,by-1)} fill={coat} />
        {styleId !== "bean" && <path d={p(bx,by+1,Math.max(4,brx-5),Math.max(4,bry-2))} fill={cream} />}
        {traits?.marking && <BreedMarkings {...{breed,traits,cream,coat}} region="body" silhouette={body(brx,bry,by-1)} cx={bx} cy={by-1} rx={brx} ry={bry} faceY={s.faceY} eyeGap={s.eyeGap} />}
        {variant && variant.pattern !== "solid" && <CoatPattern variant={variant} breed={breed} region="body" silhouette={body(brx,bry,by-1)} cx={bx} cy={by-1} rx={brx} ry={bry} />}
        {styleId === "plush" && <><path d={p(18,45,5,9)+p(46,45,5,9)} fill={edge} /><path d={p(18,44,4,8)+p(46,44,4,8)} fill={coat} /></>}
        {styleId === "fluffy" && <g fill={coat}>{[18,25,32,39,46].map(x => <path key={x} d={p(x,52,4,6)} />)}</g>}
        {styleId !== "pocket" && s.pose !== "loaf" && paws.map((x,index) => <g key={x} transform={mood === "walk" ? `translate(${frame % 2 ? -1 : 1} ${frame % 2 === index ? -3 : 0})` : undefined}>
          <path d={styleId === "retro" ? gridBox(x,footY,footSize,4,2) : p(x,footY,footSize,styleId === "plush" ? 5 : 4)} fill={edge} />
          <path d={styleId === "retro" ? gridBox(x,footY-1,footSize-2,3,2) : p(x,footY-1,Math.max(2,footSize-s.border),styleId === "plush" ? 4 : 3)} fill={cream} />
          {styleId === "plush" && <path d={p(x,footY,2,2)} fill={mix(coat,cream,.5)} />}
          {s.pose === "tiptoe" && <path d={gridBox(x,footY-6,2,5,coarse)} fill={coat} />}
        </g>)}
        {s.pose === "loaf" && <path d={p(bx-brx*.45,by+5,5,2)+p(bx+brx*.45,by+5,5,2)} fill={cream} />}
      </>}
      <g className="dog-head" transform={mood === "walk" && isPortrait ? `translate(0 ${frame % 2 ? -1 : 0})` : undefined}>
        {!floppy && pointedEars()}
        {styleId !== "bean" && <path d={face(rx+s.border,ry+s.border)} fill={edge} />}
        {styleId === "bean" && <path d={p(hx,hy,rx+1,ry+1)} fill={edge} />}
        {tufts.map(([x,y,size],index) => <path key={`outline-${index}`} d={p(x,y,size+s.border,size+s.border)} fill={edge} />)}
        <path d={face(rx,ry)} fill={coat} />
        {tufts.map(([x,y,size],index) => <path key={`tuft-${index}`} d={p(x,y,size,size)} fill={coat} />)}
        {s.detail === "sprout" && <><path d={`M${hx-6} ${sproutY}v-8h2v-2h2v5h2v-7h2v2h2v9z`} fill={edge} /><path d={`M${hx-4} ${sproutY-1}v-7h1v4h3v-7h1v10z`} fill={coat} /></>}
        {styleId === "bean" && <path d={p(32,38,16,17)} fill={coat} />}
        {styleId !== "cookie" && styleId !== "retro" && styleId !== "mini" && <path d={p(hx-3,hy-ry+6,Math.round(rx*.4),styleId === "soft" ? 2 : 4)} fill={highlight} />}
        {floppy && [-1,1].map(side => <g key={side}>
          <path d={p(hx+side*dropX,dropY,dropW+s.border,dropH+s.border)} fill={edge} />
          <path d={p(hx+side*dropX,dropY,dropW,dropH)} fill={earFill} />
          {breed === "poodle" ? <g>{[-5,0,5].map(y => <path key={y} d={p(hx+side*(dropX+1),dropY+y,dropW-1,4)} fill={mix(coat,cream,y===0?.08:.18)} />)}</g>
            : breed === "maltese" ? <path d={`M${hx+side*dropX-1} ${dropY-3}v${Math.max(3,dropH-1)}h1V${dropY-3}zM${hx+side*dropX+2} ${dropY-1}v${Math.max(2,dropH-4)}h1V${dropY-1}z`} fill={mix(edge,coat,.5)} />
            : <path d={p(hx+side*dropX,dropY+4,dropW-3,Math.max(3,dropH-6))} fill={mix(earFill,cream,.12)} />}
          {traits?.detail === "feathers" && <path d={`M${hx+side*dropX-2} ${dropY+2}v${Math.max(2,dropH-4)}h1V${dropY+2}zM${hx+side*dropX+1} ${dropY+5}v${Math.max(2,dropH-7)}h1V${dropY+5}z`} fill={mix(earFill,edge,.4)} />}
          {breed === "dalmatian" && <path d={p(hx+side*dropX,dropY+(side===1?4:-3),Math.max(2,dropW-2),4)} fill="#39383a" />}
        </g>)}
        {(breed === "corgi" || breed === "beagle") && <path d={`M${hx-1} ${hy-ry+3}h2v5h1v5h2v5h2v${Math.max(4,muzzleY-(hy-ry+18))}H${hx-7}v-${Math.max(4,muzzleY-(hy-ry+18))}h2v-5h2v-5h1z`} fill={cream} />}
        {breed === "poodle" ? <path d={p(hx-4,muzzleY+1,6,muzzleH)+p(hx+4,muzzleY+1,6,muzzleH)+p(hx,muzzleY+5,6,3)} fill={cream} />
          : <path d={p(hx-Math.round(s.muzzle*.55),muzzleY,s.muzzle*.6,muzzleH)+p(hx+Math.round(s.muzzle*.55),muzzleY,s.muzzle*.6,muzzleH)+p(hx,muzzleY+3,s.muzzle,Math.max(3,muzzleH-1))} fill={cream} />}
        {traits?.marking && <BreedMarkings {...{breed,traits,cream,coat}} region="head" silhouette={face(rx,ry)} cx={hx} cy={hy} rx={rx} ry={ry} faceY={s.faceY} eyeGap={s.eyeGap} />}
        {traits?.detail && <BreedDetails {...{traits,cream,coat,edge}} cx={hx} cy={hy} rx={rx} ry={ry} faceY={s.faceY} eyeGap={s.eyeGap} muzzleY={muzzleY} />}
        {variant && variant.pattern !== "solid" && <CoatPattern variant={variant} breed={breed} region="head" silhouette={face(rx,ry)} cx={hx} cy={hy} rx={rx} ry={ry} />}
        {s.detail === "panda" && <path d={p(eyeX1,s.faceY,5,6)+p(eyeX2,s.faceY,5,6)} fill={mix(coat,edge,.8)} />}
        {s.detail === "patch" && <><path d={p(eyeX1,s.faceY-1,6,7)} fill={mix(coat,edge,.62)} /><path d={`M${hx-4} ${hy-ry+4}h1v2h-1zM${hx-4} ${hy-ry+8}h1v2h-1zM${hx-4} ${hy-ry+12}h1v2h-1z`} fill={edge} /></>}
        {s.detail === "folds" && <path d={`M${hx-rx+7} ${hy-ry+5}l${rx-7} ${ry-4}V${hy-ry+3}zM${hx+rx-7} ${hy-ry+5}l-${rx-7} ${ry-4}V${hy-ry+3}z`} fill={mix(coat,edge,.3)} />}
        {s.detail === "waffle" && <path d={`M${hx-14} ${hy-ry+3}h2v7h-2zM${hx-7} ${hy-ry+3}h2v7h-2zM${hx} ${hy-ry+3}h2v7h-2zM${hx+7} ${hy-ry+3}h2v7h-2zM${hx+14} ${hy-ry+3}h2v7h-2zM${hx-17} ${hy-ry+5}h35v1h-35zM${hx-17} ${hy-ry+9}h35v1h-35z`} fill={mix(coat,edge,.55)} />}
        {s.detail === "seams" && <path d={`M${hx-rx+3} ${hy-ry+3}h3v3h-3zM${hx+rx-6} ${hy-ry+3}h3v3h-3zM${hx-rx+3} ${hy+ry-6}h3v3h-3zM${hx+rx-6} ${hy+ry-6}h3v3h-3zM${hx-6} ${hy-ry+5}h12v1h-12z`} fill={edge} />}
        {(breed === "shiba" || breed === "corgi") && <path d={p(eyeX1,s.faceY-6,styleId==="bold"?4:2,styleId==="bold"?2:1)+p(eyeX2,s.faceY-6,styleId==="bold"?4:2,styleId==="bold"?2:1)} fill={breed === "shiba" && variant?.pattern === "tuxedo" ? variant.patternColor : cream} />}
        <g transform={`translate(${lookX} 0)`}>
          <g className="dog-eyes">{mood!=="sleep" && mood!=="love" && luminance(ink)<110 && (luminance(coat)<90 || breed==="frenchbulldog") && <path d={p(eyeX1,s.faceY,3.3,3.3)+(breed==="frenchbulldog" ? "" : p(eyeX2,s.faceY,3.3,3.3))} fill="#c7b9aa" />}{eye(eyeX1)}{eye(eyeX2)}</g>
          {styleId === "bold" && <path d={`M${eyeX1-4} ${s.faceY-8}h7v2h-7zM${eyeX2-3} ${s.faceY-8}h7v2h-7z`} fill={edge} />}
          <path d={styleId === "retro" ? `M30 ${noseY-1}h4v2h-4z` : p(hx,noseY,styleId === "mini" ? 2 : 3,2)} fill={styleId === "cookie" ? edge : "#514036"} />
          {s.mouth === "small" || mood === "sleep" ? <path d={`M${hx} ${noseY+2}h1v2h2v1h-3v-1h-2v-1h2z`} fill={ink} />
            : s.mouth === "open" ? <><path d={p(hx,noseY+5,4,4)} fill={ink} /><path d={p(hx,noseY+7,3,2)} fill={traits?.tongue ?? "#e89c98"} /></>
            : <><path d={`M${hx-1} ${noseY+2}h2v2h2v-1h2v2h-2v1h-3v-1h-3v-1h-2v-1h2v1h2z`} fill={ink} />
              {s.mouth === "smile" && <path d={p(hx,noseY+6,2,2)} fill={traits?.tongue ?? "#e89c98"} />}</>}
          {traits?.tongue && mood !== "sleep" && (s.mouth === "small" || s.mouth === "w") && <path d={p(hx,noseY+5,2,2)} fill={traits.tongue} />}
        </g>
        {styleId !== "retro" && styleId !== "mini" && <path d={p(hx-rx+6,s.faceY+5,styleId==="soft"?5:3,2)+p(hx+rx-6,s.faceY+5,styleId==="soft"?5:3,2)} fill={mix(cream,"#dfa09e",.4)} />}
        {styleId === "plush" && <path d={`M29 ${noseY+10}h1v1h-1zM32 ${noseY+10}h1v1h-1zM35 ${noseY+10}h1v1h-1z`} fill={edge} />}
        {styleId === "cookie" && <g fill={edge}>{[[-12,-7],[-5,-12],[6,-12],[13,-6],[-15,2],[15,3]].map(([x,y]) => <path key={`${x}-${y}`} d={p(hx+x,hy+y,1,1)} />)}</g>}
        {styleId === "storybook" && <path d={`M${eyeX1-2} ${s.faceY-4}h4v1h-4zM${eyeX2-2} ${s.faceY-4}h4v1h-4z`} fill={mix(edge,coat,.3)} />}
        {s.detail === "freckles" && <path d={p(hx-rx+6,s.faceY+6,1,1)+p(hx-rx+9,s.faceY+8,1,1)+p(hx-rx+5,s.faceY+9,1,1)+p(hx+rx-6,s.faceY+6,1,1)+p(hx+rx-9,s.faceY+8,1,1)+p(hx+rx-5,s.faceY+9,1,1)} fill={edge} />}
        {accessory === "ribbon" && <g transform={`translate(${ribbonX-43} ${ribbonY-13})`}><path d="M43 13h3v1h3v-1h4v1h1v5h-1v1h-4v-2h-3v2h-3v-1h-1v-5h1z" fill="#db8290" /><path d="M46 15h3v3h-3z" fill="#b96478" /><path d="M43 14h2v1h-2zM50 14h2v1h-2z" fill="#f3b9c0" /></g>}
        {accessory === "crown" && <g transform={`translate(0 ${crownY})`}><path d="M24 7V1h3v3h4V0h3v4h4V1h3v9H24z" fill="#e7b84c" /><path d="M25 8h15v2H25z" fill="#b67c32" /></g>}
        <PaidAccessory id={accessory} top={ribbonY} faceY={s.faceY} gap={s.eyeGap} side={ribbonX + 3} />
      </g>
      {s.pose === "hug" && <g data-dog-pose="hug"><path d={p(bx-8,by+2,6,7)+p(bx+8,by+2,6,7)} fill={edge} /><path d={p(bx-7,by+1,5,6)+p(bx+7,by+1,5,6)} fill={coat} /><path d={p(bx-4,by+4,4,3)+p(bx+4,by+4,4,3)} fill={cream} /></g>}
      {s.detail === "stitch" && <path d={`M${bx-3} ${by+5}h1v1h-1zM${bx} ${by+5}h1v1h-1zM${bx+3} ${by+5}h1v1h-1z`} fill={edge} />}
      {accessory === "scarf" && <g transform={`translate(0 ${styleId === "storybook" ? -8 : styleId === "pocket" ? -7 : styleId === "badge" ? 4 : 0})`}><path d="M20 48h24v3H20zM39 50h5v7h-5z" fill="#cf665d" /><path d="M21 48h4v3h-4zM32 48h4v3h-4z" fill="#f5c090" /></g>}
      {styleId === "pocket" && <><path d="M17 44h30v13h-2v3H19v-3h-2z" fill={edge} /><path d="M19 45h26v12h-2v1H21v-1h-2z" fill={mix(cream,coat,.2)} /><path d="M20 47h24v1H20zM23 56h2v1h-2zM27 56h2v1h-2zM31 56h2v1h-2zM35 56h2v1h-2zM39 56h2v1h-2z" fill={edge} />
        <path d={p(23,44,5,4)+p(41,44,5,4)} fill={edge} /><path d={p(23,43,4,3)+p(41,43,4,3)} fill={cream} /></>}
    </g>
    {mood === "love" && <g fill="#db716e" className="dog-hearts"><path d="M5 10h3v2h2v-2h3v5h-2v2H9v2H7v-2H5zM52 3h3v2h2V3h3v5h-2v2h-2v2h-2v-2h-2z" /></g>}
    {mood === "sleep" && <g fill="#77739a"><path d="M48 12h7v2h-2v2h-2v2h4v2h-7v-2h2v-2h2v-2h-4zM55 2h7v2h-2v2h-2v2h4v2h-7V8h2V6h2V4h-4z" /></g>}
    {mood === "eat" && <g><path d="M23 53h23v6H23zM26 59h17v2H26z" fill="#d77765" /><path d="M25 52h19v3H25z" fill="#684c35" /><path d="M27 51h4v2h-4zM36 50h4v3h-4z" fill="#b18249" /></g>}
    {(mood === "typing" || mood === "excited") && <g><path d="M14 51h37v9H14zM17 60h31v2H17z" fill="#867f77" /><path d="M16 52h33v6H16z" fill="#e7e2d5" /><path d="M18 53h3v2h-3zM23 53h3v2h-3zM28 53h3v2h-3zM33 53h3v2h-3zM38 53h3v2h-3zM43 53h3v2h-3zM23 56h17v1H23z" fill="#aaa396" />
      <g className="typing-paw-left" transform={`translate(0 ${frame%2?-3:0})`}><path d={p(24,51,4,4)} fill={edge} /><path d={p(24,50,3,3)} fill={cream} /></g><g className="typing-paw-right" transform={`translate(0 ${frame%2?0:-3})`}><path d={p(40,51,4,4)} fill={edge} /><path d={p(40,50,3,3)} fill={cream} /></g>
    </g>}
    {mood === "excited" && <g fill="#eab997"><path d="M17 2h3v5h-2v4h-3V7h2zM30 0h3v4h-2v4h-3V4h2zM44 2h3v5h-2v4h-3V7h2z" /></g>}
    {mood === "scroll" && <g><path d="M7 43h9v17H7zM9 41h5v2H9z" fill="#e9debf" /><path d="M9 45h5v12H9zM10 42h3v2h-3z" fill="#c79161" /><path d="M11 59h12v3H11z" fill="#e9debf" /></g>}
  </svg>;
}
