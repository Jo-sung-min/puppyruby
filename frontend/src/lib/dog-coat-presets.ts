import type { AppearanceConfig, DogVariety } from "./dog-styles";

export type DogCoatPreset = {
  id: string;
  varietyId: string;
  breed: DogVariety["breed"];
  name: string;
  description: string;
  shape: DogVariety["shape"];
  pattern: DogVariety["pattern"];
  coatColor: string;
  patternColor: string;
};

// Fixed IDs make a renamed or recolored preset select its existing draft entry instead of adding duplicates.
export const shibaCoatPresets: readonly DogCoatPreset[] = [
  { id: "shiba-normal", varietyId: "9345a680-2819-4cb6-a5ec-000000000001", breed: "shiba", name: "일반 시바", description: "적황색", shape: "original", pattern: "solid", coatColor: "#E9B57C", patternColor: "#FFF4E4" },
  { id: "shiba-black-tan", varietyId: "9345a680-2819-4cb6-a5ec-000000000002", breed: "shiba", name: "흑시바", description: "블랙탄", shape: "original", pattern: "tuxedo", coatColor: "#393633", patternColor: "#D8A775" },
  { id: "shiba-white", varietyId: "9345a680-2819-4cb6-a5ec-000000000003", breed: "shiba", name: "백시바", description: "크림", shape: "original", pattern: "solid", coatColor: "#FFF7E9", patternColor: "#FFFDF8" },
  { id: "shiba-red", varietyId: "9345a680-2819-4cb6-a5ec-000000000004", breed: "shiba", name: "적시바", description: "레드", shape: "original", pattern: "solid", coatColor: "#C78252", patternColor: "#FFEADB" },
  { id: "shiba-sesame", varietyId: "9345a680-2819-4cb6-a5ec-000000000005", breed: "shiba", name: "참깨시바", description: "세서미", shape: "original", pattern: "freckles", coatColor: "#8C7866", patternColor: "#4E433A" },
  { id: "shiba-grey", varietyId: "9345a680-2819-4cb6-a5ec-000000000006", breed: "shiba", name: "회색시바", description: "그레이", shape: "original", pattern: "solid", coatColor: "#9F9C96", patternColor: "#F6F1E7" },
  { id: "shiba-parti", varietyId: "9345a680-2819-4cb6-a5ec-000000000007", breed: "shiba", name: "파티시바", description: "화이트탄", shape: "original", pattern: "patches", coatColor: "#F5EADB", patternColor: "#DCA570" },
  { id: "shiba-black-white", varietyId: "9345a680-2819-4cb6-a5ec-000000000008", breed: "shiba", name: "흑백시바", description: "블랙앤화이트", shape: "original", pattern: "tuxedo", coatColor: "#373736", patternColor: "#FFF9EF" },
  { id: "shiba-ivory", varietyId: "9345a680-2819-4cb6-a5ec-000000000009", breed: "shiba", name: "아이보리시바", description: "연크림", shape: "original", pattern: "solid", coatColor: "#EDD4B1", patternColor: "#FFF9EF" },
  { id: "shiba-chocolate", varietyId: "9345a680-2819-4cb6-a5ec-000000000010", breed: "shiba", name: "초코시바", description: "초콜릿", shape: "original", pattern: "tuxedo", coatColor: "#79563E", patternColor: "#D4A06F" },
];

const nameKey = (name: string) => name.trim().replace(/\s+/gu, "").toLocaleLowerCase();

export function findCoatPresetVariety(config: AppearanceConfig, preset: DogCoatPreset): DogVariety | undefined {
  const varieties = config.varieties ?? [];
  return varieties.find(item => item.breed === preset.breed && item.id === preset.varietyId)
    ?? varieties.find(item => item.breed === preset.breed && nameKey(item.name) === nameKey(preset.name));
}

/** Creates only a draft kind. Selecting a preset never changes the applied breed or server settings. */
export function addCoatPreset(config: AppearanceConfig, preset: DogCoatPreset): { config: AppearanceConfig; variety: DogVariety; added: boolean } {
  const existing = findCoatPresetVariety(config, preset);
  if (existing) return { config, variety: existing, added: false };
  const varieties = config.varieties ?? [];
  if (varieties.filter(item => item.breed === preset.breed).length >= 20) throw new Error("한 견종에는 종류를 20개까지 남길 수 있어요. 먼저 사용하지 않는 종류를 지워 주세요.");
  if (varieties.length >= 140) throw new Error("전체 종류는 140개까지 남길 수 있어요. 먼저 사용하지 않는 종류를 지워 주세요.");
  if (varieties.some(item => item.id === preset.varietyId)) throw new Error("이 종류의 등록 정보를 확인해 주세요.");
  const variety: DogVariety = { id: preset.varietyId, breed: preset.breed, name: preset.name, style: null,
    shape: preset.shape, pattern: preset.pattern, coatColor: preset.coatColor, patternColor: preset.patternColor };
  return { config: { ...config, varieties: [...varieties, variety] }, variety, added: true };
}
