import { assetUrl } from "../lib/asset-url";
import type { PixelMood } from "./pixel-dog";
import { CuteDogAccessories } from "./cute-pixel-dog";

export type MasterArtReactionProps = {
  mood: PixelMood; accessory?: string; look?: number; frame?: number;
  className?: string; decorative?: boolean; groundShadow?: boolean;
};
type Props = MasterArtReactionProps & { styleId: string; png: string; name: string; styleClass: string };

/** The original RGBA image is the artwork. Breed colors, eye colors and shapes never rewrite its pixels. */
export function MasterArtPixelDog({ styleId, png, name, styleClass, mood, accessory = "none", look = 0, frame = 0, className = "", decorative = false, groundShadow = true }: Props) {
  const step = mood === "walk" && Number.isFinite(frame) ? Math.abs(Math.trunc(frame)) % 2 : 0;
  const gaze = Number.isFinite(look) ? Math.max(-1, Math.min(1, look)) : 0;
  const anchors = { faceX: 32, eyeY: 28, eyeGap: 7, headTop: 8, headBottom: 40, footY: 57 };
  return <svg viewBox="0 0 64 64" className={`pixel-dog pixel-${mood} ${styleClass} ${className}`}
    data-dog-style={styleId} data-original-colors="true" role={decorative ? undefined : "img"}
    aria-hidden={decorative || undefined} aria-label={decorative ? undefined : name}>
    {groundShadow && <ellipse cx="32" cy="59" rx="18" ry="1" fill="#574e45" opacity=".12" />}
    <g className="dog-body">
      <g transform={`translate(${gaze} ${-step})`}>
        {accessory === "angel-wings" && <g data-cosmetic={accessory} shapeRendering="crispEdges"><path d="M18 39 7 29H3v10l5 8 14 5zM46 39l11-10h4v10l-5 8-14 5z" fill="#a8b3c7" /><path d="M17 40 5 32v7l5 7 11 4zM47 40l12-8v7l-5 7-11 4z" fill="#f4f5fc" /></g>}
        <image data-original-art="true" href={assetUrl(png)} x="0" y="0" width="64" height="64"
          preserveAspectRatio="xMidYMid meet" style={{ imageRendering: "pixelated" }} />
        <g shapeRendering="crispEdges"><CuteDogAccessories id={accessory} a={anchors} /></g>
      </g>
    </g>
    {mood === "love" && <g fill="#d98691" className="dog-hearts" shapeRendering="crispEdges"><path d="M3 10h3v2h2v-2h3v5H9v2H7v2H5v-2H3zM53 3h3v2h2V3h3v5h-2v2h-2v2h-2v-2h-2z" /></g>}
    {mood === "sleep" && <path fill="#a49aba" shapeRendering="crispEdges" d="M50 7h7v2h-2v2h-2v2h4v2h-7v-2h2v-2h2V9h-4z" />}
    {mood === "eat" && <g shapeRendering="crispEdges"><path d="M24 55h20v4H24zM27 59h14v2H27z" fill="#cd8277" /><path d="M26 53h16v3H26z" fill="#70513e" /></g>}
    {(mood === "typing" || mood === "excited") && <g shapeRendering="crispEdges"><path d="M15 54h34v7H15z" fill="#827b76" /><path d="M17 55h30v4H17z" fill="#e8e1d7" /><path d="M19 56h3v1h-3zM24 56h3v1h-3zM29 56h3v1h-3zM34 56h3v1h-3zM39 56h3v1h-3z" fill="#ada296" /></g>}
    {mood === "excited" && <path d="M15 2h2v6h-2zM31 0h2v6h-2zM47 2h2v6h-2z" fill="#d9b577" />}
    {mood === "scroll" && <g shapeRendering="crispEdges"><path d="M6 43h8v17H6zM8 41h4v2H8z" fill="#ddc7a9" /><path d="M8 46h4v11H8z" fill="#b2906d" /></g>}
  </svg>;
}
