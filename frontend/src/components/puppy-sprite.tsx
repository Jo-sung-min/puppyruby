"use client";
import { useId } from "react";
import { breeds, type Puppy, eyeOptions } from "@/lib/game";

const eyes = [ [[160.2,329.5],[259.6,338.2]], [[580.6,326.3],[677.8,336.8]], [[998.2,332.3],[1097.9,339.2]], [[182.7,827.6],[284.9,822.7]], [[575.6,826.9],[675.3,838]], [[986,816.6],[1094.3,828.6]] ];
const furFilters: Record<string, string> = {
  original: "none", cream: "sepia(.3) saturate(.65) brightness(1.12)",
  chocolate: "sepia(.55) saturate(1.2) brightness(.67)",
  rose: "sepia(.4) hue-rotate(303deg) saturate(.85)", silver: "grayscale(.92) brightness(.91)",
};
type Props = { puppy: Pick<Puppy, "breed"> & Partial<Puppy>; className?: string; decorative?: boolean };
export function PuppySprite({ puppy, className = "", decorative = false }: Props) {
  const id = useId().replace(/:/g, "");
  const breed = Math.max(0, Math.min(5, puppy.breed));
  const x = (breed % 3) * 418, y = breed < 3 ? 150 : 650;
  const iris = eyeOptions.find(e => e.id === puppy.eyes)?.color;
  return <div className={`puppy-sprite ${className}`}>
    <svg viewBox={`${x} ${y} 418 495`} role={decorative ? undefined : "img"} aria-hidden={decorative || undefined} aria-label={decorative ? undefined : `${puppy.name || breeds[breed].name}${puppy.fur && puppy.fur !== "original" ? ", 꾸민 모습" : ""}`}>
      <defs><clipPath id={id}><rect x={x} y={y} width="418" height="495" /></clipPath></defs>
      <g clipPath={`url(#${id})`}>
        <image href="/images/puppies.png" width="1254" height="1254" style={{ filter: furFilters[puppy.fur || "original"] }} />
        {puppy.eyes && puppy.eyes !== "original" && eyes[breed].map(([cx, cy], i) => <g key={i}>
          <ellipse cx={cx} cy={cy} rx="14" ry="17" fill={iris} opacity=".7" />
          <ellipse cx={cx} cy={cy + 1} rx="7" ry="11" fill="#201f21" />
          <circle cx={cx + 4} cy={cy - 7} r="4" fill="white" opacity=".9" />
        </g>)}
      </g>
    </svg>
    {puppy.accessory && puppy.accessory !== "none" && <span aria-hidden="true" className={`pet-accessory ${puppy.accessory}`}>{puppy.accessory === "ribbon" ? "🎀" : puppy.accessory === "scarf" ? "🧣" : "👑"}</span>}
  </div>;
}
