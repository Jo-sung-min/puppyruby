import { eyeOptions, type Puppy } from "@/lib/game";
import type { ComponentProps, CSSProperties } from "react";
import { auraColor } from "../lib/cosmetics";
import { dogBreedAt } from "../lib/dog-breeds";
import { PixelDog } from "./styled-pixel-dog";
import { isRubyEyeStyleId, rubyEyeStyle } from "../lib/ruby-round-eyes";

const furColors: Record<string, string> = { cream: "#f5e5c5", chocolate: "#886046", rose: "#d7a0a2", silver: "#b7b8b3" };

type Props = { puppy: Pick<Puppy, "breed"> & Partial<Puppy>; className?: string; decorative?: boolean }
  & Pick<ComponentProps<typeof PixelDog>, "mood" | "scene" | "paused" | "look" | "lookY" | "frame">;
export function PuppySprite({ puppy, className = "", decorative = false, mood = "idle", scene, paused, look, lookY, frame }: Props) {
  const color = auraColor(puppy.aura);
  const eyes = eyeOptions.find(e => e.id === puppy.eyes)?.color ?? (isRubyEyeStyleId(puppy.eyes) ? rubyEyeStyle(puppy.eyes).color : undefined);
  return <div className={`puppy-sprite ${color ? "puppy-aura" : ""} ${className}`} data-aura={color ? puppy.aura : undefined} style={color ? { "--puppy-aura-color": color } as CSSProperties : undefined}>
    <PixelDog breed={dogBreedAt(puppy.breed).id} fur={furColors[puppy.fur || "original"]} coatId={puppy.fur} eyes={eyes} eyeStyle={puppy.eyes} accessory={puppy.accessory} mood={mood} scene={scene} paused={paused} look={look} lookY={lookY} frame={frame} decorative={decorative} groundShadow={!color} />
  </div>;
}
