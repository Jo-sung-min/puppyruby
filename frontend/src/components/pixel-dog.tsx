import type { CSSProperties } from "react";
import type { DogStyleId } from "../lib/dog-styles";

export type PixelBreed = "shiba" | "samoyed" | "poodle" | "corgi" | "maltese" | "beagle" | "pomeranian";
export type PixelMood = "idle" | "love" | "eat" | "play" | "sleep" | "typing" | "excited" | "scroll" | "drag" | "walk";
export const pixelBreeds: { id: PixelBreed; name: string; note: string; color: string }[] = [
  { id: "shiba", name: "시바견", note: "츤데레 속 따뜻한 마음", color: "#f4dfbd" },
  { id: "samoyed", name: "사모예드", note: "언제나 웃는 솜사탕", color: "#e9e9df" },
  { id: "poodle", name: "토이 푸들", note: "호기심 가득한 똑똑이", color: "#ead7cd" },
  { id: "corgi", name: "웰시 코기", note: "짧은 다리, 커다란 사랑", color: "#e3e9d6" },
  { id: "maltese", name: "말티즈", note: "네 곁이 제일 좋은 애교쟁이", color: "#e6e0ed" },
  { id: "beagle", name: "비글", note: "매일이 신나는 장난꾸러기", color: "#f3dfd6" },
];

const palettes: Record<PixelBreed, [string, string, string]> = {
  shiba: ["#edb77e", "#bd9069", "#fff1dc"], samoyed: ["#fff9ed", "#c8beb0", "#fffdf7"],
  poodle: ["#d5aa86", "#ad8568", "#f3dcc2"], corgi: ["#e8b57e", "#b88c65", "#fff4df"],
  maltese: ["#fffaf0", "#c7bbb0", "#fffdf9"], beagle: ["#d8aa82", "#a07c60", "#fff3de"],
  pomeranian: ["#f1c895", "#c29d77", "#fff0d9"],
};

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

export function PixelDog({ breed = "shiba", mood = "idle", fur, eyes = "#3e332c", accessory = "none", look = 0, frame = 0, className = "", decorative = false, groundShadow = true, styleId = "classic" }: {
  breed?: PixelBreed; mood?: PixelMood; fur?: string; eyes?: string; accessory?: string; look?: number; frame?: number; className?: string; decorative?: boolean; groundShadow?: boolean; styleId?: DogStyleId;
}) {
  if (styleId !== "classic" && Object.hasOwn(styleShapes, styleId)) return <DesignedDog {...{ breed, mood, fur, eyes, accessory, look, frame, className, decorative, groundShadow, styleId }} />;
  const [base, edge, cream] = palettes[breed];
  const coat = fur || base;
  const shadow = fur ? mix(coat, "#685345", .4) : edge;
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
        {(breed === "shiba" || breed === "corgi") && <path d={oval(24, 25, 2, 1.5) + oval(40, 25, 2, 1.5)} fill={cream} />}
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
type StyledId = Exclude<DogStyleId, "classic">;
type Shape = {
  head: [number, number, number, number]; body: [number, number, number, number];
  feet: [number, number, number, number]; faceY: number; eyeGap: number;
  eye: "sparkle" | "dots" | "button" | "square" | "smile" | "tiny";
  mouth: "smile" | "small" | "open" | "w"; ear: "point" | "round" | "short";
  border: number; grid: number; face: "oval" | "box"; muzzle: number;
};
const styleShapes: Record<StyledId, Shape> = {
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
  className: string; decorative: boolean; groundShadow: boolean; styleId: StyledId;
};
function DesignedDog({ breed, mood, fur, eyes, accessory, look, frame, className, decorative, groundShadow, styleId }: DesignedProps) {
  const s = styleShapes[styleId], [hx, hy, rx, ry] = s.head, [bx, by, brx, bry] = s.body;
  const [leftFoot, rightFoot, footY, footSize] = s.feet;
  const [base, baseEdge, cream] = palettes[breed];
  const coat = fur || base;
  const shade = fur ? mix(coat, "#685345", .4) : baseEdge;
  const edge = styleId === "bold" || styleId === "retro" ? mix(shade, "#332d29", .72)
    : styleId === "soft" ? mix(shade, coat, .48) : styleId === "cookie" ? mix(shade, "#75503c", .28) : shade;
  const highlight = mix(coat, "#fff8eb", styleId === "soft" ? .12 : .28);
  const ink = styleId === "cookie" ? mix(eyes, "#66432d", .25) : eyes;
  const floppy = breed === "poodle" || breed === "maltese" || breed === "beagle";
  const naturallyFluffy = breed === "pomeranian" || breed === "samoyed" || breed === "poodle";
  const coarse = s.grid, p = (x: number, y: number, w: number, h: number) => gridOval(x, y, w, h, coarse);
  const face = (w: number, h: number) => s.face === "box" ? gridBox(hx, hy, w, h, coarse) : p(hx, hy, w, h);
  const earX = Math.round(rx * .7), earTop = Math.max(2, hy - ry - (s.ear === "short" ? 1 : breed === "corgi" ? 10 : 6));
  const earBottom = hy - Math.round(ry * .35);
  const earWidth = styleId === "mini" ? 4 : breed === "corgi" ? 8 : 6;
  const earFill = breed === "beagle" ? mix(coat, "#6c4d39", .56) : coat;
  const dropX = Math.round(rx * .88), dropY = hy + (breed === "maltese" ? 3 : 1);
  const dropW = styleId === "mini" ? 4 : breed === "beagle" ? 7 : breed === "poodle" ? 6 : 5;
  const dropH = Math.round(ry * (breed === "beagle" ? .83 : breed === "maltese" ? .76 : .62));
  const tufts: [number, number, number][] = [];
  if (naturallyFluffy || styleId === "fluffy" || styleId === "cookie") {
    const count = styleId === "fluffy" ? 18 : styleId === "cookie" ? 12 : breed === "poodle" ? 11 : 9;
    const tuftSize = styleId === "mini" ? 2 : styleId === "fluffy" ? 4 : styleId === "cookie" ? 4 : 3;
    for (let index = 0; index < count; index++) {
      const angle = (index / count) * Math.PI * 2;
      if (!naturallyFluffy && styleId !== "fluffy" && styleId !== "cookie") continue;
      tufts.push([Math.round(hx + Math.cos(angle) * (rx - 2)), Math.round(hy + Math.sin(angle) * (ry - 1)), tuftSize]);
    }
  }
  const muzzleY = s.faceY + (styleId === "mini" ? 4 : 6);
  const muzzleH = styleId === "mini" ? 4 : styleId === "storybook" ? 5 : 6;
  const eyeX1 = hx - s.eyeGap, eyeX2 = hx + s.eyeGap;
  const noseY = muzzleY - 1;
  const lookX = Number.isFinite(look) ? Math.max(-2, Math.min(2, Math.round(look))) : 0;
  const ribbonX = Math.min(48, hx + Math.round(rx * .57)), ribbonY = Math.max(3, hy - ry + 2);
  const crownY = Math.max(0, hy - ry - 8);
  const isPortrait = styleId === "badge";
  const paws = [leftFoot, rightFoot];
  const breedName = pixelBreeds.find(item => item.id === breed)?.name || "포메라니안";
  function pointedEars(padding = 0) {
    return [-1, 1].map(side => {
      const center = hx + side * earX;
      const roundedY = Math.max(earTop + 7, 11 + padding);
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
    if (mood === "love" || s.eye === "smile") return <path key={x} d={`M${x - 3} ${y + 1}v-2h1v-1h4v1h1v2h-2v-1h-2v1z`} fill={ink} />;
    if (s.eye === "square") return <g key={x}><path d={gridBox(x, y, 3, 3, coarse)} fill={ink} />{styleId !== "retro" && <path d={`M${x - 2} ${y - 2}h2v2h-2z`} fill="#fffdf6" />}</g>;
    if (s.eye === "tiny") return <path key={x} d={`M${x - 1} ${y - 1}h2v2h-2z`} fill={ink} />;
    const sparkle = s.eye === "sparkle", button = s.eye === "button";
    const size = sparkle ? (styleId === "chibi" ? 4 : 3) : button ? 3 : 2;
    return <g key={x}><path d={p(x, y, size, sparkle ? size + 1 : size)} fill={ink} />
      {sparkle && <><path d={`M${x - 2} ${y - 3}h2v2h-2z`} fill="#fffdf6" /><path d={`M${x + 1} ${y + 1}h1v1h-1z`} fill="#fffdf6" /></>}
      {button && styleId === "plush" && <path d={`M${x - 1} ${y - 1}h1v1h-1zM${x + 1} ${y + 1}h1v1h-1z`} fill={highlight} />}
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
        <path d={p(bx,by,brx+s.border,bry+s.border)} fill={edge} />
        <path d={p(bx,by-1,brx,bry)} fill={coat} />
        {styleId !== "bean" && <path d={p(bx,by+1,Math.max(4,brx-5),Math.max(4,bry-2))} fill={cream} />}
        {styleId === "plush" && <><path d={p(18,45,5,9)+p(46,45,5,9)} fill={edge} /><path d={p(18,44,4,8)+p(46,44,4,8)} fill={coat} /></>}
        {styleId === "fluffy" && <g fill={coat}>{[18,25,32,39,46].map(x => <path key={x} d={p(x,52,4,6)} />)}</g>}
        {styleId !== "pocket" && paws.map((x,index) => <g key={x} transform={mood === "walk" ? `translate(${frame % 2 ? -1 : 1} ${frame % 2 === index ? -3 : 0})` : undefined}>
          <path d={styleId === "retro" ? gridBox(x,footY,footSize,4,2) : p(x,footY,footSize,styleId === "plush" ? 5 : 4)} fill={edge} />
          <path d={styleId === "retro" ? gridBox(x,footY-1,footSize-2,3,2) : p(x,footY-1,Math.max(2,footSize-s.border),styleId === "plush" ? 4 : 3)} fill={cream} />
          {styleId === "plush" && <path d={p(x,footY,2,2)} fill={mix(coat,cream,.5)} />}
        </g>)}
      </>}
      <g className="dog-head" transform={mood === "walk" && isPortrait ? `translate(0 ${frame % 2 ? -1 : 0})` : undefined}>
        {!floppy && pointedEars()}
        {styleId !== "bean" && <path d={face(rx+s.border,ry+s.border)} fill={edge} />}
        {styleId === "bean" && <path d={p(hx,hy,rx+1,ry+1)} fill={edge} />}
        {tufts.map(([x,y,size],index) => <path key={`outline-${index}`} d={p(x,y,size+s.border,size+s.border)} fill={edge} />)}
        <path d={face(rx,ry)} fill={coat} />
        {tufts.map(([x,y,size],index) => <path key={`tuft-${index}`} d={p(x,y,size,size)} fill={coat} />)}
        {styleId === "bean" && <path d={p(32,38,16,17)} fill={coat} />}
        {styleId !== "cookie" && styleId !== "retro" && styleId !== "mini" && <path d={p(hx-3,hy-ry+6,Math.round(rx*.4),styleId === "soft" ? 2 : 4)} fill={highlight} />}
        {floppy && [-1,1].map(side => <g key={side}>
          <path d={p(hx+side*dropX,dropY,dropW+s.border,dropH+s.border)} fill={edge} />
          <path d={p(hx+side*dropX,dropY,dropW,dropH)} fill={earFill} />
          {breed === "poodle" ? <g>{[-5,0,5].map(y => <path key={y} d={p(hx+side*(dropX+1),dropY+y,dropW-1,4)} fill={mix(coat,cream,y===0?.08:.18)} />)}</g>
            : breed === "maltese" ? <path d={`M${hx+side*dropX-1} ${dropY-3}v${Math.max(3,dropH-1)}h1V${dropY-3}zM${hx+side*dropX+2} ${dropY-1}v${Math.max(2,dropH-4)}h1V${dropY-1}z`} fill={mix(edge,coat,.5)} />
            : <path d={p(hx+side*dropX,dropY+4,dropW-3,Math.max(3,dropH-6))} fill={mix(earFill,cream,.12)} />}
        </g>)}
        {(breed === "corgi" || breed === "beagle") && <path d={`M${hx-1} ${hy-ry+3}h2v5h1v5h2v5h2v${Math.max(4,muzzleY-(hy-ry+18))}H${hx-7}v-${Math.max(4,muzzleY-(hy-ry+18))}h2v-5h2v-5h1z`} fill={cream} />}
        {breed === "poodle" ? <path d={p(hx-4,muzzleY+1,6,muzzleH)+p(hx+4,muzzleY+1,6,muzzleH)+p(hx,muzzleY+5,6,3)} fill={cream} />
          : <path d={p(hx-Math.round(s.muzzle*.55),muzzleY,s.muzzle*.6,muzzleH)+p(hx+Math.round(s.muzzle*.55),muzzleY,s.muzzle*.6,muzzleH)+p(hx,muzzleY+3,s.muzzle,Math.max(3,muzzleH-1))} fill={cream} />}
        {(breed === "shiba" || breed === "corgi") && <path d={p(eyeX1,s.faceY-6,styleId==="bold"?4:2,styleId==="bold"?2:1)+p(eyeX2,s.faceY-6,styleId==="bold"?4:2,styleId==="bold"?2:1)} fill={cream} />}
        <g transform={`translate(${lookX} 0)`}>
          <g className="dog-eyes">{eye(eyeX1)}{eye(eyeX2)}</g>
          {styleId === "bold" && <path d={`M${eyeX1-4} ${s.faceY-8}h7v2h-7zM${eyeX2-3} ${s.faceY-8}h7v2h-7z`} fill={edge} />}
          <path d={styleId === "retro" ? `M30 ${noseY-1}h4v2h-4z` : p(hx,noseY,styleId === "mini" ? 2 : 3,2)} fill={styleId === "cookie" ? edge : "#514036"} />
          {s.mouth === "small" || mood === "sleep" ? <path d={`M${hx} ${noseY+2}h1v2h2v1h-3v-1h-2v-1h2z`} fill={ink} />
            : s.mouth === "open" ? <><path d={p(hx,noseY+5,4,4)} fill={ink} /><path d={p(hx,noseY+7,3,2)} fill="#e89c98" /></>
            : <><path d={`M${hx-1} ${noseY+2}h2v2h2v-1h2v2h-2v1h-3v-1h-3v-1h-2v-1h2v1h2z`} fill={ink} />
              {s.mouth === "smile" && <path d={p(hx,noseY+6,2,2)} fill="#e89c98" />}</>}
        </g>
        {styleId !== "retro" && styleId !== "mini" && <path d={p(hx-rx+6,s.faceY+5,styleId==="soft"?5:3,2)+p(hx+rx-6,s.faceY+5,styleId==="soft"?5:3,2)} fill={mix(cream,"#dfa09e",.4)} />}
        {styleId === "plush" && <path d={`M29 ${noseY+10}h1v1h-1zM32 ${noseY+10}h1v1h-1zM35 ${noseY+10}h1v1h-1z`} fill={edge} />}
        {styleId === "cookie" && <g fill={edge}>{[[-12,-7],[-5,-12],[6,-12],[13,-6],[-15,2],[15,3]].map(([x,y]) => <path key={`${x}-${y}`} d={p(hx+x,hy+y,1,1)} />)}</g>}
        {styleId === "storybook" && <path d={`M${eyeX1-2} ${s.faceY-4}h4v1h-4zM${eyeX2-2} ${s.faceY-4}h4v1h-4z`} fill={mix(edge,coat,.3)} />}
        {accessory === "ribbon" && <g transform={`translate(${ribbonX-43} ${ribbonY-13})`}><path d="M43 13h3v1h3v-1h4v1h1v5h-1v1h-4v-2h-3v2h-3v-1h-1v-5h1z" fill="#db8290" /><path d="M46 15h3v3h-3z" fill="#b96478" /><path d="M43 14h2v1h-2zM50 14h2v1h-2z" fill="#f3b9c0" /></g>}
        {accessory === "crown" && <g transform={`translate(0 ${crownY})`}><path d="M24 7V1h3v3h4V0h3v4h4V1h3v9H24z" fill="#e7b84c" /><path d="M25 8h15v2H25z" fill="#b67c32" /></g>}
        <PaidAccessory id={accessory} top={ribbonY} faceY={s.faceY} gap={s.eyeGap} side={ribbonX + 3} />
      </g>
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
