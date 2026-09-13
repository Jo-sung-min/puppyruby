import { dogStyles, isDogStyleId, styleBreedIds, varietyPatterns, varietyShapes, type AppearanceConfig, type DogStyleId, type DogVariety } from "./dog-styles";

/** Only the public, finite catalog is accepted, including when a server response is malformed. */
export function parseAppearance(value: unknown): AppearanceConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("도트 설정을 확인하지 못했어요.");
  const data = value as Record<string, unknown>;
  if (!isDogStyleId(data.defaultStyle) || !Number.isSafeInteger(data.revision) || (data.revision as number) < 0
    || !(data.updatedAt === null || (typeof data.updatedAt === "number" && Number.isSafeInteger(data.updatedAt) && data.updatedAt >= 0))
    || !data.breedStyles || typeof data.breedStyles !== "object" || Array.isArray(data.breedStyles)) throw new Error("도트 설정을 확인하지 못했어요.");
  const deleted = Object.hasOwn(data, "deletedStyles") ? data.deletedStyles : [];
  if (!Array.isArray(deleted) || deleted.length >= dogStyles.length || [...deleted].some(style => !isDogStyleId(style))
    || new Set(deleted).size !== deleted.length || deleted.includes(data.defaultStyle)) throw new Error("삭제된 도트 설정을 확인하지 못했어요.");
  const deletedStyles = [...deleted] as DogStyleId[];
  const breedStyles: AppearanceConfig["breedStyles"] = {};
  for (const [breed, style] of Object.entries(data.breedStyles)) {
    if (!(styleBreedIds as readonly string[]).includes(breed) || !isDogStyleId(style) || deletedStyles.includes(style)) throw new Error("등록되지 않은 도트 설정이에요.");
    breedStyles[breed as keyof typeof breedStyles] = style;
  }
  const hasVarieties = Object.hasOwn(data, "varieties"), hasBindings = Object.hasOwn(data, "breedVarieties");
  if (hasVarieties !== hasBindings) throw new Error("종류 설정을 확인하지 못했어요.");
  const rawVarieties = hasVarieties ? data.varieties : [];
  const rawBindings = hasBindings ? data.breedVarieties : {};
  if (!Array.isArray(rawVarieties) || rawVarieties.length > 140 || !rawBindings || typeof rawBindings !== "object" || Array.isArray(rawBindings)) throw new Error("종류 설정을 확인하지 못했어요.");
  const varieties: DogVariety[] = [];
  const ids = new Set<string>(), names = new Set<string>();
  const counts = new Map<string, number>();
  const color = /^#[0-9a-f]{6}$/i;
  for (const value of rawVarieties) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("등록되지 않은 종류예요.");
    const item = value as Record<string, unknown>;
    if (typeof item.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(item.id)
      || typeof item.breed !== "string" || !(styleBreedIds as readonly string[]).includes(item.breed)
      || typeof item.name !== "string" || [...item.name.trim()].length < 1 || [...item.name.trim()].length > 24 || /[\p{Cc}\p{Cf}]/u.test(item.name.trim())
      || !(item.style === null || (isDogStyleId(item.style) && !deletedStyles.includes(item.style)))
      || !(varietyShapes as readonly unknown[]).includes(item.shape) || !(varietyPatterns as readonly unknown[]).includes(item.pattern)
      || !(item.coatColor === null || (typeof item.coatColor === "string" && color.test(item.coatColor)))
      || typeof item.patternColor !== "string" || !color.test(item.patternColor)) throw new Error("종류의 이름과 모습 설정을 확인해 주세요.");
    const name = item.name.trim();
    const nameKey = `${item.breed}:${name.replace(/\s+/gu, " ").toLowerCase()}`;
    const count = (counts.get(item.breed) ?? 0) + 1;
    if (ids.has(item.id) || names.has(nameKey) || count > 20) throw new Error("종류 이름은 중복 없이 견종마다 20개까지 등록할 수 있어요.");
    ids.add(item.id); names.add(nameKey); counts.set(item.breed, count);
    varieties.push({ id: item.id, breed: item.breed as DogVariety["breed"], name, style: item.style as DogVariety["style"],
      shape: item.shape as DogVariety["shape"], pattern: item.pattern as DogVariety["pattern"],
      coatColor: typeof item.coatColor === "string" ? item.coatColor.toUpperCase() : null, patternColor: item.patternColor.toUpperCase() });
  }
  const breedVarieties: NonNullable<AppearanceConfig["breedVarieties"]> = {};
  for (const [breed, varietyId] of Object.entries(rawBindings)) {
    if (!(styleBreedIds as readonly string[]).includes(breed) || typeof varietyId !== "string" || !varieties.some(item => item.id === varietyId && item.breed === breed)) throw new Error("견종에 적용할 종류를 확인해 주세요.");
    breedVarieties[breed as keyof typeof breedVarieties] = varietyId;
  }
  return { defaultStyle: data.defaultStyle, breedStyles, deletedStyles, varieties, breedVarieties, revision: data.revision as number, updatedAt: data.updatedAt as number | null };
}
