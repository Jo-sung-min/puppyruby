import type { RubyEyeAnchor } from "./ruby-round-scene-styles";

/** Track the head with one rigid eye pair; animation frames cannot change its spacing. */
export function rubyRoundEyePair(anchors: RubyEyeAnchor[], reference: RubyEyeAnchor[]): RubyEyeAnchor[] {
  if (anchors.length !== 2 || reference.length !== 2) return anchors;
  const center = (pair: RubyEyeAnchor[], axis: "x" | "y", size: "width" | "height") =>
    pair.reduce((sum, eye) => sum + eye[axis] + eye[size] / 2, 0) / 2;
  const dx = Math.round(center(anchors, "x", "width") - center(reference, "x", "width"));
  const dy = Math.round(center(anchors, "y", "height") - center(reference, "y", "height"));
  return reference.map(eye => ({ ...eye, x: eye.x + dx, y: eye.y + dy }));
}

/** One bounded translation is shared by both eyes, including unequal legacy anchors. */
export function rubyRoundGazeOffset(anchors: RubyEyeAnchor[], look: number, lookY: number) {
  const unit = (value: number) => Number.isFinite(value) ? Math.max(-1, Math.min(1, value / 3)) : 0;
  const width = anchors.length ? Math.min(...anchors.map(eye => eye.width)) : 0;
  const height = anchors.length ? Math.min(...anchors.map(eye => eye.height)) : 0;
  return { x: Math.round(unit(look) * width * .13), y: Math.round(unit(lookY) * height * .13) };
}
