import placements from "./generated/art16-accessory-anchors.json";
import { art16FrameIndex, type Art16SceneId } from "./art16-scene-styles";
import type { PixelBreed } from "./dog-breeds";

export type Art16AccessoryEye = { x: number; y: number; rx: number; ry: number };
export type Art16AccessoryPlacement = {
  headCenterX: number; foreheadY: number; neckCenterX: number; neckY: number;
  ribbonX: number; ribbonY: number; eyeY: number;
  eyes?: Art16AccessoryEye[];
};
type PlacementEntry = {
  width: number; height: number; scenes: Record<Art16SceneId, Art16AccessoryPlacement>;
  walkOffsets?: { x: number; y: number }[];
};

/** Reviewed attachment points use a 64-unit coordinate system, without resizing the source art. */
export function art16AccessoryPlacement(breed: PixelBreed, scene: Art16SceneId, width: number, height: number, frame = 0) {
  const entry = (placements as Record<string, PlacementEntry>)[breed];
  if (!entry || entry.width !== width || entry.height !== height) return;
  const pose = entry.scenes[scene];
  const offset = scene === "walk" ? entry.walkOffsets?.[art16FrameIndex(frame, 8)] : undefined;
  if (!offset) return pose;
  return { ...pose,
    headCenterX: pose.headCenterX + offset.x, foreheadY: pose.foreheadY + offset.y,
    neckCenterX: pose.neckCenterX + offset.x, neckY: pose.neckY + offset.y,
    ribbonX: pose.ribbonX + offset.x, ribbonY: pose.ribbonY + offset.y,
    eyeY: pose.eyeY + offset.y,
    eyes: pose.eyes?.map(eye => ({ ...eye, x: eye.x + offset.x, y: eye.y + offset.y })),
  };
}
