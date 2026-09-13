import generated from "./generated/cute-puppy-sprites.json";
import { cuteDogStyles, type CuteDogStyleId } from "./cute-dog-styles";

export const spriteRoles = ["transparent", "outline", "coat", "shade", "light", "cream", "detail", "blush", "tongue"] as const;
export type SpriteRole = (typeof spriteRoles)[number];
export type SpriteAnchors = { faceX: number; eyeY: number; eyeGap: number; headTop: number; headBottom: number; footY: number };
export type CutePuppySprite = {
  width: 64;
  height: 64;
  palette: string[];
  roles: SpriteRole[];
  rows: string[];
  anchors?: SpriteAnchors;
};

/** Invalid or unfinished source art is an error, never an unrelated fallback puppy. */
export function validateCutePuppySprites(value: unknown): Record<CuteDogStyleId, CutePuppySprite> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("귀여운 강아지 도트 데이터가 없습니다.");
  const root = value as Record<string, unknown>;
  if (root.schemaVersion !== 1 || !root.sprites || typeof root.sprites !== "object" || Array.isArray(root.sprites)) throw new Error("귀여운 강아지 도트 데이터 형식이 다릅니다.");
  const entries = root.sprites as Record<string, unknown>;
  for (const { id } of cuteDogStyles) {
    const sprite = entries[id] as CutePuppySprite | undefined;
    if (!sprite || sprite.width !== 64 || sprite.height !== 64 || !Array.isArray(sprite.palette) || sprite.palette.length < 2 || sprite.palette.length > 12
      || !sprite.palette.every(color => typeof color === "string" && /^#[\da-f]{6}(?:00|ff)$/i.test(color)) || sprite.palette[0].slice(-2) !== "00"
      || sprite.palette.slice(1).some(color => color.slice(-2).toLowerCase() !== "ff")
      || !Array.isArray(sprite.roles) || sprite.roles.length !== sprite.palette.length || sprite.roles[0] !== "transparent"
      || !sprite.roles.every(role => spriteRoles.includes(role)) || sprite.roles.slice(1).includes("transparent")
      || !Array.isArray(sprite.rows) || sprite.rows.length !== 64 || !sprite.rows.every(row => typeof row === "string" && row.length === 64 && [...row].every(index => /^[0-9a-b]$/.test(index) && parseInt(index, 36) < sprite.palette.length))
      || !sprite.rows.some(row => /[1-9ab]/.test(row))) throw new Error(`${id}의 완성된 64×64 도트 에셋을 확인해 주세요.`);
    if (sprite.anchors && (!Object.values(sprite.anchors).every(number => Number.isFinite(number) && Number.isInteger(number * 2) && number >= 0 && number <= 64)
      || !["faceX", "eyeY", "eyeGap", "headTop", "headBottom", "footY"].every(key => Object.hasOwn(sprite.anchors!, key)))) throw new Error(`${id}의 표정 기준점이 올바르지 않습니다.`);
  }
  if (Object.keys(entries).length !== cuteDogStyles.length) throw new Error("귀여운 강아지 도트 목록과 에셋 수가 다릅니다.");
  return entries as Record<CuteDogStyleId, CutePuppySprite>;
}

let validated: Record<CuteDogStyleId, CutePuppySprite> | undefined;
export function getCutePuppySprite(id: CuteDogStyleId): CutePuppySprite {
  validated ??= validateCutePuppySprites(generated);
  return validated[id];
}
