import manifest from "./generated/soft-pixel-candidates.json";

export const softPixelEyes = [
  { id: "dot", name: "동글 눈" },
  { id: "bean", name: "콩알 눈" },
  { id: "sparkle", name: "반짝 눈" },
  { id: "sleep", name: "웃는 눈" },
] as const;
export type SoftPixelEye = (typeof softPixelEyes)[number]["id"];
export type SoftPixelCandidate = {
  id: string;
  code: string;
  name: string;
  description: string;
  width: number;
  height: number;
  png: string;
  body: string;
  defaultEyes?: SoftPixelEye;
  eyes: Record<SoftPixelEye, string>;
  aseprite: string;
  eyeAnchors: { x: number; y: number; rx: number; ry: number }[];
};
export type SoftPixelLook = { x: number; y: number };
export type SoftPixelChoice = { id: string; eye: SoftPixelEye; color: string };
export const softPixelChoiceKey = "puppyruby.admin.soft-pixel-choice.v1";
export const defaultSoftPixelColor = "#30263B";

/** These are comparison candidates, deliberately separate from the live appearance catalog. */
export const softPixelCandidates: readonly SoftPixelCandidate[] = manifest as SoftPixelCandidate[];

export function parseSoftPixelChoice(value: unknown): SoftPixelChoice | null {
  if (!value || typeof value !== "object") return null;
  const choice = value as Partial<SoftPixelChoice>;
  if (!softPixelCandidates.some(candidate => candidate.id === choice.id)
    || !softPixelEyes.some(eye => eye.id === choice.eye)
    || typeof choice.color !== "string" || !/^#[\da-f]{6}$/iu.test(choice.color)) return null;
  return { id: choice.id!, eye: choice.eye!, color: choice.color };
}

export function softPixelEyeOffset(candidate: SoftPixelCandidate, look: SoftPixelLook, eye: SoftPixelEye): SoftPixelLook {
  if (eye === "sleep") return { x: 0, y: 0 };
  const anchors = candidate.eyeAnchors;
  const rangeX = Math.min(3, ...anchors.map(anchor => anchor.rx * .3));
  const rangeY = Math.min(2, ...anchors.map(anchor => anchor.ry * .25));
  return {
    x: Math.round(Math.max(-1, Math.min(1, Number.isFinite(look.x) ? look.x : 0)) * rangeX),
    y: Math.round(Math.max(-1, Math.min(1, Number.isFinite(look.y) ? look.y : 0)) * rangeY),
  };
}
