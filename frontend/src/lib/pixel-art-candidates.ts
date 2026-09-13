import generatedCandidates from "./generated/pixel-art-candidates.json";
import { dogBreedIds, type PixelBreed } from "./dog-breeds";

export type PixelArtCandidate = {
  id: string;
  name: string;
  breed: PixelBreed;
  direction: string;
  png: string;
  width: number;
  height: number;
};

function isCandidate(value: unknown): value is PixelArtCandidate {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "string" && /^art-\d{2}$/.test(item.id)
    && typeof item.name === "string" && item.name.trim().length > 0
    && typeof item.breed === "string" && (dogBreedIds as string[]).includes(item.breed)
    && typeof item.direction === "string"
    && item.png === `/images/pixel-art-v1/${item.id}.png`
    && typeof item.width === "number" && Number.isSafeInteger(item.width) && item.width > 0
    && typeof item.height === "number" && Number.isSafeInteger(item.height) && item.height > 0;
}

const entries: unknown = generatedCandidates;
const ids = new Set<string>();
/** Only finished, manifest-backed artwork belongs in the preview gallery. */
export const pixelArtCandidates: PixelArtCandidate[] = (Array.isArray(entries) ? entries : [])
  .filter(isCandidate)
  .filter(item => {
    if (ids.has(item.id)) return false;
    ids.add(item.id);
    return true;
  });

export const pixelArtArchive = "/downloads/puppyruby-pixel-art-30.zip";
