import { useId, type CSSProperties } from "react";
import type { PixelBreed, PixelMood } from "./pixel-dog";
import type { DogVariantLook } from "../lib/dog-styles";
import { dogBreedById } from "../lib/dog-breeds";
import { breedArt, type BreedArt } from "./dog-breed-art";
import styles from "./animated-dog.module.css";

export type AnimatedDogAction = "idle" | "blink" | "wag" | "walk" | "sit" | "sleep";
export type AnimatedDogProps = {
  breed?: PixelBreed; mood?: PixelMood; fur?: string; eyes?: string; accessory?: string;
  look?: number; frame?: number; className?: string; decorative?: boolean; groundShadow?: boolean;
  action?: AnimatedDogAction; paused?: boolean; variant?: DogVariantLook;
};

const actionNames: Record<AnimatedDogAction, string> = { idle: "쉬고 있는", blink: "눈을 깜빡이는", wag: "꼬리를 흔드는", walk: "걷는", sit: "앉아 있는", sleep: "잠자는" };
const moodActions: Partial<Record<PixelMood, AnimatedDogAction>> = { sleep: "sleep", walk: "walk", love: "blink", play: "wag", excited: "wag", typing: "walk", scroll: "wag", eat: "sit", drag: "wag" };

function color(value: string | undefined, fallback: string) { return value && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback; }

function Bow({ fill }: { fill: string }) {
  return <g transform="translate(145 46) rotate(13)"><path d="M-2 0C-22-15-27-10-22 5c-2 12 6 12 20 1C13 20 24 15 21 4 25-9 18-14 2 0Z" fill={fill} /><ellipse cx="0" cy="4" rx="5" ry="7" fill={fill} /><path d="m-16-3 9 5m14 0 9-6" fill="none" opacity=".35" /></g>;
}

function HeadAccessory({ id }: { id: string }) {
  if (id === "none" || id === "scarf" || id === "angel-wings") return null;
  return <g data-cosmetic={id} strokeWidth="2.5">
    {(id === "ribbon" || id === "bow-blue" || id === "bow-lilac") && <Bow fill={id === "bow-blue" ? "#8abadd" : id === "bow-lilac" ? "#ba9ad8" : "#ee9caa"} />}
    {id === "crown" && <g><path d="m78 30-4-24 15 12L100 3l11 15 15-12-4 24Z" fill="#f5cf70" /><path d="M79 27h42v9H79Z" fill="#e9ba52" /><circle cx="100" cy="26" r="3" fill="#ed9f9c" stroke="none" /></g>}
    {id === "party-hat" && <g><path d="M79 35 100 4l22 31Z" fill="#bda2df" /><path d="m87 23 27 1m-22-9h15" stroke="#ffe3a0" strokeWidth="5" /><path d="M78 35h44" strokeWidth="5" /><circle cx="100" cy="5" r="5" fill="#fff0ba" /></g>}
    {id === "flower" && <g transform="translate(148 46)"><path d="M0 1C-20-10-7-25 1-13 12-25 23-9 11 0 26 10 9 23 3 12-5 27-21 11-9 4Z" fill="#f0b0bf" /><circle r="6" fill="#f6d47e" /><path d="M9 14q17-7 13 8-12 5-13-8Z" fill="#aac18e" /></g>}
    {id === "glasses" && <g fill="none" stroke="#4b4140" strokeWidth="3"><circle cx="81" cy="85" r="13" /><circle cx="119" cy="85" r="13" /><path d="M94 84q6-4 12 0M62 82l6 1m64 0 6-1" /></g>}
    {id === "halo" && <g fill="none"><ellipse cx="100" cy="15" rx="28" ry="7" stroke="#cda25b" strokeWidth="7" /><ellipse cx="100" cy="14" rx="28" ry="7" stroke="#ffe5a0" strokeWidth="4" /></g>}
  </g>;
}

function Paw({ x, y, rear = false, sitting = false, side, sockColor }: { x: number; y: number; rear?: boolean; sitting?: boolean; side: "left" | "right"; sockColor?: string }) {
  return <g transform={`translate(${x} ${y})`} data-dog-part={`${rear ? "back" : "front"}-paw-${side}`}>
    <g className={rear ? styles.backPaw : side === "left" ? styles.leftPaw : styles.rightPaw}>
      <path d={sitting && rear ? "M-11-12C-19-9-20 2-15 9c7 9 24 8 29-1 4-10-5-14-8-24-3-8-11-6-17 4Z" : "M-11-15C-15-6-16 5-11 10c4 4 8 3 10 1 5 5 10 3 11 0 6 2 9-3 8-7l-3-20"} fill={sockColor || "var(--animated-coat)"} />
      {sitting && rear ? <g fill="#dca58e" stroke="none"><ellipse cy="4" rx="7" ry="5" /><circle cx="-7" cy="-4" r="2.4" /><circle cx="0" cy="-7" r="2.4" /><circle cx="7" cy="-4" r="2.4" /></g> : <path d="M-5 7v4m10-4v4" fill="none" strokeWidth="2.4" />}
    </g>
  </g>;
}

function CoatPattern({ pattern, fill, area, breed }: { pattern: DogVariantLook["pattern"]; fill: string; area: "face" | "body"; breed?:PixelBreed }) {
  if (pattern === "solid" || pattern === "socks") return null;
  if (area === "body") return <g fill={fill} stroke="none" data-dog-pattern={pattern}>
    {(pattern === "tuxedo" || pattern === "blaze") && <path d="M76 123q22 20 47 0c-1 24 12 36 3 48-13 15-45 13-51-2-6-13 4-31 1-46Z" />}
    {pattern === "patches" && <><ellipse cx="135" cy="148" rx="21" ry="19" /><ellipse cx="64" cy="164" rx="15" ry="12" /></>}
    {pattern === "freckles" && <>{[[71,145],[88,151],[115,146],[131,160],[103,169],[74,166]].map(([cx,cy]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="3.7" />)}</>}
  </g>;
  if (breed === "shiba" && pattern === "tuxedo") return <g fill={fill} stroke="none" data-dog-pattern={pattern}><path d="M60 100q20-13 40-4 20-9 40 4-1 28-40 29-39-1-40-29Z" /><ellipse cx="81" cy="66" rx="7" ry="4" /><ellipse cx="119" cy="66" rx="7" ry="4" /></g>;
  return <g fill={fill} stroke="none" data-dog-pattern={pattern}>
    {pattern === "tuxedo" && <><path d="M19 23h71c-1 16-4 33-7 48-3 22-28 31-42 29H17Zm91 0h73v77h-26c-15 0-39-7-42-28-2-15-4-33-5-49Z" /><path d="M92 119q8-5 16 0l7 17H85Z" /></>}
    {pattern === "patches" && <><path d="M126 41c25-8 44 9 40 28 10 21-12 40-29 35-23 1-35-21-22-36-5-11 1-23 11-27Z" /><ellipse cx="65" cy="113" rx="18" ry="10" /></>}
    {pattern === "freckles" && <>{[[67,94],[62,104],[76,104],[133,94],[128,103],[140,103],[88,49],[103,54],[111,44]].map(([cx,cy]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={cy < 60 ? 4 : 2.8} />)}</>}
    {pattern === "blaze" && <path d="M97 25h8c-1 21 5 34 11 49 4 10 12 15 15 29 5 19-14 29-31 29s-36-10-31-29c3-14 11-19 15-29 6-15 12-28 13-49Z" />}
  </g>;
}

function breedHeadShape(traits: BreedArt) {
  const rx=62*(traits.headWidth ?? 1), ry=48*(traits.headHeight ?? 1), cy=80;
  if (traits.fluff) {
    const count=traits.fluff, steps=count*2, points=Array.from({length:steps},(_,i) => {
      const angle=i*Math.PI*2/steps, extra=i%2===0 ? (traits.tuftSize ?? 3)*1.6 : 0;
      return [100+Math.cos(angle)*(rx+extra),cy+Math.sin(angle)*(ry+extra)];
    });
    let d=`M${points[0][0]} ${points[0][1]}`;
    for(let i=1;i<=steps;i++){const p=points[i%steps], next=points[(i+1)%steps];d+=`Q${p[0]} ${p[1]} ${(p[0]+next[0])/2} ${(p[1]+next[1])/2}`;}
    return d+"Z";
  }
  return `M${100-rx} 80C${100-rx} ${cy-ry*.8} ${100-rx*.63} ${cy-ry} 100 ${cy-ry}S${100+rx} ${cy-ry*.8} ${100+rx} 80C${100+rx} ${cy+ry*.8} ${100+rx*.6} ${cy+ry} 100 ${cy+ry}S${100-rx} ${cy+ry*.8} ${100-rx} 80Z`;
}
function breedBodyShape(traits: BreedArt) {
  const rx=43*(traits.bodyWidth ?? 1), ry=Math.min(33,28*(traits.bodyHeight ?? 1)), cy=151;
  return `M${100-rx} ${cy}C${100-rx} ${cy-ry} ${100-rx*.5} ${cy-ry} 100 ${cy-ry}S${100+rx} ${cy-ry} ${100+rx} ${cy}S${100+rx*.5} ${cy+ry} 100 ${cy+ry}S${100-rx} ${cy+ry} ${100-rx} ${cy}Z`;
}
function NaturalEars({ traits }: { traits: BreedArt }) {
  const width=(traits.earWidth ?? 6)*2.7, length=62*(traits.earLength ?? .7), top=Math.max(5,29-(traits.earHeight ?? 5)*2);
  return <g fill="var(--animated-coat)">{[-1,1].map(side => <g key={side} transform={side===1 ? "translate(200 0) scale(-1 1)" : undefined}>
    <g className={side===-1 ? styles.leftEar : styles.rightEar} data-dog-part={side===-1 ? "left-ear" : "right-ear"}>
      {traits.ears === "point" && <><path d={`M41 64Q${39-width*.2} 27 49 ${top}Q${49+width} ${top+4} ${49+width+10} 61Z`} /><path d={`M49 47V${top+13}Q${width+45} 35 ${width+44} 53Z`} fill="#e5bba9" stroke="none" /></>}
      {traits.ears === "bat" && <><path d={`M39 66C${39-width*.5} 47 ${39-width*.4} ${top-1} 49 ${top}C${49+width} ${top-2} ${49+width} 36 ${49+width-5} 62Z`} /><ellipse cx={48+width*.1} cy={top+23} rx={width*.46} ry="18" fill="#e9b4aa" stroke="none" /></>}
      {traits.ears === "round" && <><circle cx="51" cy="40" r={width+3} /><circle cx="51" cy="40" r={width*.58} fill="var(--animated-ear)" stroke="none" /></>}
      {traits.ears === "fold" && <><path d={`M47 43Q${44-width} 42 ${33-width*.25} 62L51 75 69 51Z`} /><path d="m38 56 13 19 8-23" fill="var(--animated-ear)" strokeWidth="2.5" /></>}
      {traits.ears === "drop" && <><path d={`M45 51C${43-width} 52 ${43-width} ${53+length*.6} ${43-width*.65} ${53+length}Q43 ${70+length} ${43+width*.55} ${53+length}C${43+width*.85} ${53+length*.5} 54 54 45 51Z`} fill="var(--animated-ear)" /><path d={`M${42-width*.4} 65q-3 ${length*.25} 2 ${length*.65}`} fill="none" stroke="#fff3df" strokeWidth="3" opacity=".4" />{traits.detail === "feathers" && <path d={`M${46-width*.3} 78v${length*.43}m-5-7v7`} fill="none" strokeWidth="2" opacity=".4" />}</>}
    </g>
  </g>)}</g>;
}
function NaturalCoat({ breed, traits, cream, area }: { breed:PixelBreed; traits:BreedArt; cream:string; area:"face"|"body" }) {
  const mark=traits.marking, dark="#343238";
  return <g stroke="none" data-breed-marking={`${breed}-${area}`}>
    {area === "body" ? <>
      {mark === "spots" && <g fill={dark}>{[[70,140,10],[127,142,12],[81,171,7],[127,174,7]].map(([cx,cy,r])=><ellipse key={`${cx}-${cy}`} cx={cx} cy={cy} rx={r} ry={r*.8} />)}</g>}
      {mark === "saddle" && <ellipse cx="128" cy="144" rx="31" ry="29" fill={breed === "yorkshireterrier" ? "#64636c" : "#6d554b"} />}
      {(mark === "tuxedo" || mark === "mask" || mark === "blaze") && <path d="M88 120q12 16 24 0l16 62H72Z" fill={cream} />}
      {mark === "blacktan" && <g fill={cream}><ellipse cx="74" cy="175" rx="16" ry="14" /><ellipse cx="127" cy="175" rx="16" ry="14" /></g>}
    </> : <>
      {(mark === "blaze" || mark === "tuxedo" || (mark === "saddle" && breed !== "yorkshireterrier")) && <path d="M96 20h9l-1 35q1 23 17 47l-4 33H83l-4-33q16-24 17-47Z" fill={cream} />}
      {mark === "eyepatch" && <ellipse cx="74" cy="68" rx="29" ry="36" fill={dark} />}
      {mark === "saddle" && breed === "saintbernard" && <g fill="#5b4841"><ellipse cx="67" cy="78" rx="21" ry="33" /><ellipse cx="135" cy="78" rx="21" ry="33" /></g>}
      {mark === "mask" && (breed === "husky" ? <><path d="M59 49q10-14 27 16l13 18 14-18q17-30 28-16l23 57q-12 27-64 26-52 1-64-26Z" fill={cream} /><path d="M92 26h16l-8 56Z" fill="var(--animated-coat)" /></> : <g fill={cream}><ellipse cx="65" cy="106" rx="25" ry="18" /><ellipse cx="135" cy="106" rx="25" ry="18" /><ellipse cx="81" cy="65" rx="8" ry="5" /><ellipse cx="119" cy="65" rx="8" ry="5" /></g>)}
      {mark === "blacktan" && <g fill={cream}><ellipse cx="81" cy="67" rx="8" ry="5" /><ellipse cx="119" cy="67" rx="8" ry="5" /><ellipse cx="56" cy="103" rx="9" ry="13" /><ellipse cx="144" cy="103" rx="9" ry="13" /></g>}
      {mark === "spots" && <g fill={dark}>{[[75,45,9],[122,59,11],[48,83,8],[145,112,6],[90,30,6]].map(([cx,cy,r])=><ellipse key={`${cx}-${cy}`} cx={cx} cy={cy} rx={r} ry={r*.85} />)}</g>}
    </>}
  </g>;
}
function NaturalDetails({ traits, cream }: { traits:BreedArt; cream:string }) {
  return <g data-breed-detail={traits.detail}>
    {traits.detail === "topknot" && <><path d="M89 37c-19-2-18-22-5-23 1-15 18-14 19-3 18-10 29 8 14 18l-9 9Z" fill={cream} /><path d="M85 31h28v8H85Z" fill="#d9848b" strokeWidth="2" /><path d="M97 29h8v12h-8Z" fill="#e9a4ad" strokeWidth="2" /></>}
    {traits.detail === "beard" && <><path d="M68 101q10-15 31-3 24-13 34 4l-4 30-15-5-14 14-15-14-14 5Z" fill={cream} strokeWidth="2" /><path d="M88 124v7m12-5v10m12-12v7" stroke="#ada49a" strokeWidth="2" /><path d="M69 71q11-12 25-5m12 0q14-7 25 5" fill="none" stroke={cream} strokeWidth="10" /></>}
    {traits.detail === "eyebrows" && <path d="M70 80q10-8 23 0m15 0q11-7 22 0" fill="none" stroke="var(--animated-ear)" strokeWidth="4" />}
    {traits.detail === "wrinkles" && <path d="M68 68q14-8 24 0m16 0q12-8 24 0M91 77q9-5 18 0M73 110q-4 10 5 12m45-12q4 10-5 12" fill="none" opacity=".6" strokeWidth="2.6" />}
    {traits.detail === "wisps" && <path d="m48 99 7 16m5-8 7 15m85-23-7 16m-5-8-7 15m-40 4 3 8m12-8-3 8" fill="none" stroke="var(--animated-ear)" strokeWidth="2.4" />}
  </g>;
}

/** Independent SVG parts keep motion smooth at every display size. */
export function AnimatedDog({ breed = "maltese", mood = "idle", fur, eyes, accessory = "none", look = 0, frame = 0, className = "", decorative = false, groundShadow = true, action, paused = false, variant }: AnimatedDogProps) {
  const breedInfo = dogBreedById(breed);
  breed = breedInfo.id;
  const traits = breedArt[breed];
  const instance = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const currentAction = action ?? moodActions[mood] ?? "idle";
  const sleeping = currentAction === "sleep", sitting = currentAction === "sit";
  const [base, ear, cream] = breedInfo.palette, name = breedInfo.name;
  const coat = color(fur, color(variant?.coatColor ?? undefined, base)), eye = color(eyes, "#342b27");
  const teddy = variant?.shape === "teddy", fox = variant?.shape === "fox";
  const pattern = variant?.pattern ?? "solid", patternColor = color(variant?.patternColor, "#fffaf0");
  const pointEars = fox || (!teddy && (traits ? traits.ears === "point" : ["shiba", "corgi", "samoyed", "pomeranian"].includes(breed)));
  const naturalEars = !teddy && !fox && traits;
  const headShape = teddy ? "M43 65c0-24 26-35 56-35 32-1 59 12 60 36 15 20 10 44-5 54-27 21-80 22-109 0-17-13-16-35-2-55Z"
    : fox ? "M44 61c13-15 35-20 55-19 22-2 45 6 58 22l21 30-15 1 8 11-24 3c-14 19-33 29-46 31-14-2-35-11-49-29l-24-4 9-11-15-2Z"
      : traits ? breedHeadShape(traits) : "M45 107c-12 2-19-6-16-15-9-6-8-18 1-24-2-11 5-19 15-21 2-11 14-16 24-13 6-10 20-12 30-6 9-8 24-5 29 4 13-3 25 5 27 15 11 0 20 11 18 21 11 7 12 19 5 27 3 9-4 18-15 17-7 13-19 18-34 18-15 9-40 10-57 0-14 0-24-10-27-23Z";
  const bodyShape = sleeping ? "M46 174c-8-17 13-35 38-33 14-11 46-10 62 2 24-1 35 17 28 32-18 11-111 12-128-1Z" : traits ? breedBodyShape(traits) : "M73 121c-10 6-14 14-12 22-8 6-8 16-4 21-5 10 4 16 13 14 13 9 23 5 29 1 10 7 23 7 29 0 14 3 22-4 17-14 5-7 2-16-5-20 2-13-10-25-22-25Z";
  const sockColor = pattern === "socks" ? patternColor : undefined;
  const faceLook = Number.isFinite(look) ? Math.max(-4, Math.min(4, look * 1.5)) : 0;
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" shapeRendering="geometricPrecision"
    className={`pixel-dog ${styles.dog} ${className}`} data-dog-style="animated-2d" data-dog-action={currentAction} data-dog-shape={variant?.shape ?? "original"} data-coat-pattern={pattern} data-paused={paused || undefined} data-frame={frame}
    role={decorative ? undefined : "img"} aria-hidden={decorative || undefined} aria-label={decorative ? undefined : `${actionNames[currentAction]} ${name} 2D 강아지`}
    style={{ "--animated-coat": coat, "--animated-ear": fur || variant?.coatColor ? coat : ear, imageRendering: "auto" } as CSSProperties}>
    <defs><clipPath id={`dog-face-${instance}`}><path d={headShape} /></clipPath><clipPath id={`dog-body-${instance}`}><path d={bodyShape} /></clipPath></defs>
    {groundShadow && <ellipse className={styles.shadow} cx="101" cy="184" rx={sleeping ? 65 : 51} ry="8" fill="#796451" opacity=".12" />}
    <g className={styles.motion} stroke="#423730" strokeWidth="3.7" strokeLinecap="round" strokeLinejoin="round">
      {accessory === "angel-wings" && <g data-cosmetic="angel-wings" fill="#f3f5fd" stroke="#a5b4c9" strokeWidth="3"><path d="M70 143C49 144 37 139 26 115c-7 20 0 41 19 47l26 6Zm60 0c21 1 33-4 44-28 7 20 0 41-19 47l-26 6Z" /><path d="m35 139 22 16m108-16-22 16" fill="none" /></g>}
      <g transform={sleeping ? "translate(10 15)" : undefined}>
        <g className={styles.tail} data-dog-part="tail"><path d="M139 165c19 3 36-9 36-24 9-9 7-18-1-21 0-11-11-17-19-10-10-3-17 5-14 13 4 7 3 13-4 18-10 7-9 17 2 24Z" fill="var(--animated-coat)" /><path d="M143 156c10 2 20-5 21-13" fill="none" stroke="#ecdac4" strokeWidth="4" /></g>
      </g>
      <g className={styles.body} data-dog-part="body">
        <path d={bodyShape} fill="var(--animated-coat)" />
        {!sleeping && pattern === "solid" && <path d="M80 127q20 11 39-1c10 7 10 31 1 42-9 8-30 8-38-1-9-10-11-30-2-40Z" fill="#fffbf3" stroke="none" opacity=".8" />}
        <g clipPath={`url(#dog-body-${instance})`}>{traits?.marking && <NaturalCoat {...{breed,traits,cream}} area="body" />}<CoatPattern breed={breed} pattern={pattern} fill={patternColor} area="body" /></g>
        {pattern !== "solid" && <path d={bodyShape} fill="none" />}
        {!sleeping && <><Paw x={sitting ? 64 : 68} y={169} rear sitting={sitting} side="left" sockColor={sockColor} /><Paw x={sitting ? 139 : 132} y={169} rear sitting={sitting} side="right" sockColor={sockColor} /></>}
      </g>
      {accessory === "scarf" && <g data-cosmetic="scarf" fill="#d9857c" strokeWidth="2.6"><path d="M72 128q27 9 55-1v12q-26 8-56-1Z" /><path d="m117 137 13-1 7 25-13 3Z" /><path d="m74 132 47 1m6 16 7-2" stroke="#f6c1a9" strokeWidth="3" /></g>}
      <g transform={sleeping ? "translate(-2 40) rotate(-4 100 95)" : undefined}>
        <g className={styles.head} data-dog-part="head">
          {teddy && <g fill="var(--animated-coat)"><g className={styles.leftEar} data-dog-part="left-ear"><circle cx="49" cy="43" r="22" /><circle cx="49" cy="43" r="12" fill="var(--animated-ear)" stroke="none" /></g><g className={styles.rightEar} data-dog-part="right-ear"><circle cx="151" cy="43" r="22" /><circle cx="151" cy="43" r="12" fill="var(--animated-ear)" stroke="none" /></g></g>}
          {naturalEars && traits.ears !== "drop" && <NaturalEars traits={traits} />}
          {pointEars && !naturalEars && <g fill="var(--animated-coat)"><g className={styles.leftEar} data-dog-part="left-ear"><path d="M47 58C41 42 43 18 49 12c8-1 29 20 32 35Z" /><path d="M52 44V24q13 10 18 21Z" fill="#e8b5a1" stroke="none" /></g><g className={styles.rightEar} data-dog-part="right-ear"><path d="M153 58c6-16 4-40-2-46-8-1-29 20-32 35Z" /><path d="M148 44V24q-13 10-18 21Z" fill="#e8b5a1" stroke="none" /></g></g>}
          <path d={headShape} fill="var(--animated-coat)" data-dog-part="face" />
          <path d="M61 101c2 14 20 24 39 24 23 0 39-12 42-25-10-9-24-7-42-5-17-2-29-4-39 6Z" fill={cream} stroke="none" opacity=".92" transform={traits ? `translate(100 105) scale(${traits.muzzle ?? 1} 1) translate(-100 -105)` : undefined} />
          <g clipPath={`url(#dog-face-${instance})`}>{traits?.marking && <NaturalCoat {...{breed,traits,cream}} area="face" />}<CoatPattern breed={breed} pattern={pattern} fill={patternColor} area="face" /></g>
          {pattern !== "solid" && <path d={headShape} fill="none" />}
          {naturalEars && traits.ears === "drop" && <NaturalEars traits={traits} />}
          {!pointEars && !teddy && !naturalEars && <g fill="var(--animated-ear)"><g className={styles.leftEar} data-dog-part="left-ear"><path d="M42 54c-10 2-17 15-17 26-8 6-8 17-1 24-1 13 12 21 23 14 10 1 16-8 12-16-8-12-5-24-7-34" /><path d="M36 68c-4 8-5 17-2 24" fill="none" stroke="#fff3dd" strokeWidth="4" opacity=".5" /></g><g className={styles.rightEar} data-dog-part="right-ear"><path d="M158 54c10 2 17 15 17 26 8 6 8 17 1 24 1 13-12 21-23 14-10 1-16-8-12-16 8-12 5-24 7-34" /><path d="M164 68c4 8 5 17 2 24" fill="none" stroke="#fff3dd" strokeWidth="4" opacity=".5" /></g></g>}
          {traits?.detail && <NaturalDetails traits={traits} cream={cream} />}
          {pattern === "solid" && (breed === "beagle" || breed === "corgi") && <path d="M98 39q-1 30-12 51c5 4 23 4 29-1-13-20-15-35-14-50Z" fill="#fffaf0" stroke="none" />}
          <g transform={`translate(${faceLook} 0)`}>
            <g fill="#eeb6ab" stroke="none" opacity=".55"><ellipse cx="66" cy="101" rx="8" ry="4" /><ellipse cx="135" cy="101" rx="8" ry="4" /></g>
            {sleeping ? <path d="M75 85q7 7 14 0m22 0q7 7 14 0" fill="none" stroke={eye} strokeWidth="4.2" data-dog-part="eyes" /> : <g data-dog-part="eyes"><g className={styles.openEyes} fill={eye} stroke="none"><ellipse cx="82" cy="85" rx="5.6" ry="6.4" /><ellipse cx="119" cy="85" rx="5.6" ry="6.4" /><g fill="#fffdf7"><circle cx="80.4" cy="82.8" r="1.5" /><circle cx="117.4" cy="82.8" r="1.5" /></g></g><path className={styles.closedEyes} d="M76 86q6-7 12 0m25 0q6-7 12 0" fill="none" stroke={eye} strokeWidth="3.8" /></g>}
            <path d="M91 99c0-8 18-8 18 0 0 5-6 9-9 9s-9-4-9-9Z" fill="#392d28" stroke="none" /><ellipse cx="97" cy="96" rx="3" ry="1.7" fill="#6f5a4e" stroke="none" opacity=".7" />
            {!sleeping && <g className={styles.tongue} data-dog-part="tongue"><path d="M91 112q9-5 18 0v7c-2 13-16 13-18 0Z" fill={traits?.tongue ?? "#ee9c97"} strokeWidth="3" /><path d="M100 114v7" stroke={traits?.tongue ? "#62558f" : "#d87e79"} strokeWidth="2" /></g>}
            <path d="M100 106v4c-3 8-13 8-17 1m17-1c3 8 13 8 17 1" fill="none" strokeWidth="3.7" />
          </g>
          <HeadAccessory id={accessory} />
        </g>
      </g>
      {sleeping ? <g fill={sockColor || "var(--animated-coat)"}><path d="M46 171c-10-3-17 0-17 8 2 8 24 8 28 2 1-5-3-9-11-10Zm73 0c-10-3-17 0-17 8 2 8 24 8 28 2 1-5-3-9-11-10Z" /><path d="M38 178v5m10-6v6m63-5v5m10-6v6" fill="none" strokeWidth="2.3" /></g> : <><Paw x={85} y={169} side="left" sockColor={sockColor} /><Paw x={115} y={169} side="right" sockColor={sockColor} /></>}
    </g>
    {sleeping && <g className={styles.sleepMarks} fill="#8d8290" fontFamily="ui-rounded, system-ui, sans-serif" fontWeight="700" aria-hidden="true"><text x="151" y="104" fontSize="13">z</text><text x="165" y="87" fontSize="17">z</text><text x="181" y="66" fontSize="22">Z</text></g>}
    {mood === "love" && !sleeping && <g className={styles.hearts} fill="#eaa1aa" aria-hidden="true"><path d="M30 34c-8-11-18 0 0 12 18-12 8-23 0-12Zm143-14c-7-10-16 0 0 11 16-11 7-21 0-11Z" /></g>}
    {mood === "eat" && <g stroke="#856358" strokeWidth="2.5"><path d="M77 175h48l-5 14H82Z" fill="#dda399" /><ellipse cx="101" cy="175" rx="24" ry="5" fill="#b48058" /><path d="M85 173h6m8 2h7m6-3h5" stroke="#ebc493" strokeWidth="4" strokeLinecap="round" /></g>}
    {(mood === "typing" || mood === "excited") && <g stroke="#837d77" strokeWidth="2"><rect x="68" y="177" width="65" height="13" rx="4" fill="#efeee8" /><path d="M75 182h5m5 0h5m5 0h5m5 0h5m5 0h9m-37 5h25" strokeWidth="3" strokeLinecap="round" /></g>}
  </svg>;
}
