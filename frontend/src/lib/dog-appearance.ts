import { isDogStyleId, styleBreedIds, type AppearanceConfig } from "./dog-styles";

/** Only the public, finite catalog is accepted, including when a server response is malformed. */
export function parseAppearance(value: unknown): AppearanceConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("도트 설정을 확인하지 못했어요.");
  const data = value as Record<string, unknown>;
  if (!isDogStyleId(data.defaultStyle) || !Number.isSafeInteger(data.revision) || (data.revision as number) < 0
    || !(data.updatedAt === null || (typeof data.updatedAt === "number" && Number.isSafeInteger(data.updatedAt) && data.updatedAt >= 0))
    || !data.breedStyles || typeof data.breedStyles !== "object" || Array.isArray(data.breedStyles)) throw new Error("도트 설정을 확인하지 못했어요.");
  const breedStyles: AppearanceConfig["breedStyles"] = {};
  for (const [breed, style] of Object.entries(data.breedStyles)) {
    if (!(styleBreedIds as readonly string[]).includes(breed) || !isDogStyleId(style)) throw new Error("등록되지 않은 도트 설정이에요.");
    breedStyles[breed as keyof typeof breedStyles] = style;
  }
  return { defaultStyle: data.defaultStyle, breedStyles, revision: data.revision as number, updatedAt: data.updatedAt as number | null };
}
