import reactionAnchors from "./generated/art16-reaction-anchors.json";
import type { PixelBreed } from "./dog-breeds";

export type Art16ReactionPatch = { x: number; y: number; rx: number; ry: number };
export type Art16ReactionAnchors = {
  width: number; height: number; eyes: Art16ReactionPatch[]; paws: Art16ReactionPatch[]; footY: number;
};

/** Native source coordinates are shared with the Windows renderer, never guessed from a generic face. */
export function art16ReactionAnchors(breed: PixelBreed, width: number, height: number): Art16ReactionAnchors | undefined {
  const entry = (reactionAnchors as Record<string, Art16ReactionAnchors>)[breed];
  if (!entry || entry.width !== width || entry.height !== height || entry.eyes.length !== 2 || entry.paws.length !== 2) return;
  if (![...entry.eyes, ...entry.paws].every(patch => [patch.x, patch.y, patch.rx, patch.ry].every(Number.isFinite)
    && patch.rx > 0 && patch.ry > 0 && patch.x - patch.rx >= 0 && patch.y - patch.ry >= 0
    && patch.x + patch.rx <= width && patch.y + patch.ry <= height)) return;
  return entry;
}

/** Small integral shifts preserve the source pixels and keep both pupils inside their original eye sockets. */
export function art16GazeOffset(eye: Art16ReactionPatch, look: number, lookY: number, paused = false) {
  const clamp = (value: number) => Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
  return paused ? { x: 0, y: 0 } : {
    x: Math.round(clamp(look) * Math.min(4, eye.rx * .25)),
    y: Math.round(clamp(lookY) * Math.min(3, eye.ry * .2)),
  };
}
