import { eyeOptions, type Puppy } from "@/lib/game";
import type { CSSProperties } from "react";
import { auraColor } from "../lib/cosmetics";
import { PixelDog, type PixelBreed } from "./styled-pixel-dog";

const breedMap: PixelBreed[] = ["pomeranian", "poodle", "maltese", "shiba", "corgi", "beagle"];
const furColors: Record<string, string> = { cream: "#f5e5c5", chocolate: "#886046", rose: "#d7a0a2", silver: "#b7b8b3" };

type Props = { puppy: Pick<Puppy, "breed"> & Partial<Puppy>; className?: string; decorative?: boolean };
export function PuppySprite({ puppy, className = "", decorative = false }: Props) {
  const color = auraColor(puppy.aura);
  return <div className={`puppy-sprite ${color ? "puppy-aura" : ""} ${className}`} data-aura={color ? puppy.aura : undefined} style={color ? { "--puppy-aura-color": color } as CSSProperties : undefined}>
    <PixelDog breed={breedMap[puppy.breed] || "pomeranian"} fur={furColors[puppy.fur || "original"]} eyes={eyeOptions.find(e => e.id === puppy.eyes)?.color} accessory={puppy.accessory} decorative={decorative} groundShadow={!color} />
  </div>;
}
