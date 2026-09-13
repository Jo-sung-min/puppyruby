"use client";

import { useId } from "react";
import { assetUrl } from "@/lib/asset-url";
import { defaultSoftPixelColor, softPixelEyeOffset, type SoftPixelCandidate, type SoftPixelEye, type SoftPixelLook } from "@/lib/soft-pixel-candidates";
import styles from "./soft-pixel-dog.module.css";

export function SoftPixelDog({ candidate, eye = "bean", color = defaultSoftPixelColor, look = { x: 0, y: 0 }, decorative = false }: {
  candidate: SoftPixelCandidate;
  eye?: SoftPixelEye;
  color?: string;
  look?: SoftPixelLook;
  decorative?: boolean;
}) {
  const id = useId();
  const offset = softPixelEyeOffset(candidate, look, eye);
  const safeColor = /^#[\da-f]{6}$/iu.test(color) ? color : defaultSoftPixelColor;
  const channels = [1, 3, 5].map(start => parseInt(safeColor.slice(start, start + 2), 16) / 255);
  return <svg className={styles.dog} viewBox={`0 0 ${candidate.width} ${candidate.height}`} width={candidate.width} height={candidate.height}
    role={decorative ? undefined : "img"} aria-hidden={decorative || undefined} aria-label={decorative ? undefined : `${candidate.code} ${candidate.name}`}
    data-soft-pixel-candidate={candidate.id} data-eye={eye} data-eye-color={safeColor} data-eye-x={offset.x} data-eye-y={offset.y}>
    <defs>
      <filter id={`${id}-eye-color`} colorInterpolationFilters="sRGB" x="-5%" y="-5%" width="110%" height="110%">
        <feComponentTransfer>
          <feFuncR type="table" tableValues={`${channels[0]} 1`} />
          <feFuncG type="table" tableValues={`${channels[1]} 1`} />
          <feFuncB type="table" tableValues={`${channels[2]} 1`} />
        </feComponentTransfer>
      </filter>
    </defs>
    <image href={assetUrl(candidate.body)} width={candidate.width} height={candidate.height} />
    <g transform={`translate(${offset.x} ${offset.y})`} filter={`url(#${id}-eye-color)`}>
      <image href={assetUrl(candidate.eyes[eye])} width={candidate.width} height={candidate.height} />
    </g>
  </svg>;
}
