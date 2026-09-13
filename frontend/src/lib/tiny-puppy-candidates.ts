import generatedCandidates from "./generated/tiny-puppy-candidates.json";

export type TinyPuppyCandidate = {
  id: string;
  name: string;
  direction: string;
  png: string;
  aseprite?: string | null;
  width: number;
  height: number;
};

function isCandidate(value: unknown): value is TinyPuppyCandidate {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "string" && /^C(?:0[1-9]|1[0-2])$/.test(item.id)
    && typeof item.name === "string" && item.name.trim().length > 0
    && typeof item.direction === "string"
    && item.png === `/images/imaginary-pixel-v1/${item.id}.png`
    && (item.aseprite == null || item.aseprite === `/downloads/imaginary-pixel-v1/${item.id}.aseprite`)
    && typeof item.width === "number" && Number.isSafeInteger(item.width) && item.width > 0
    && typeof item.height === "number" && Number.isSafeInteger(item.height) && item.height > 0;
}

const entries: unknown = generatedCandidates;
const ids = new Set<string>();
/** Only finished raster artwork is listed; this catalog never changes live dog settings. */
export const tinyPuppyCandidates: TinyPuppyCandidate[] = (Array.isArray(entries) ? entries : [])
  .filter(isCandidate)
  .filter(item => {
    if (ids.has(item.id)) return false;
    ids.add(item.id);
    return true;
  })
  .sort((first, second) => first.id.localeCompare(second.id));

export const tinyPuppyFavoriteStorageKey = "puppyruby:tiny-puppy-favorites:v1";
export const tinyPuppyArchive = "/downloads/puppyruby-imaginary-pixel-12.zip";

export function parseTinyPuppyFavorites(value: string | null): string[] {
  try {
    const parsed: unknown = JSON.parse(value ?? "[]");
    if (!Array.isArray(parsed)) return [];
    const selected = new Set(parsed.filter((id): id is string => typeof id === "string"));
    return tinyPuppyCandidates.filter(candidate => selected.has(candidate.id)).map(candidate => candidate.id);
  } catch {
    return [];
  }
}
