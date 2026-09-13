import completedAssets from "./generated/pixel-art-dog-assets.json";
import { pixelArtCandidates } from "./pixel-art-candidates";

export const originalArtDogStyleIds = [
  "art-01", "art-02", "art-03", "art-04", "art-05", "art-06", "art-07", "art-08", "art-09", "art-10",
  "art-11", "art-12", "art-13", "art-14", "art-15", "art-16", "art-17", "art-18", "art-19", "art-20",
  "art-21", "art-22", "art-23", "art-24", "art-25", "art-26", "art-27", "art-28", "art-29", "art-30",
] as const;

export type OriginalArtDogStyleId = (typeof originalArtDogStyleIds)[number];
export type OriginalArtDogAsset = { id: OriginalArtDogStyleId; width: number; height: number; png: string; aseprite: string };

export function isOriginalArtDogStyleId(value: unknown): value is OriginalArtDogStyleId {
  return typeof value === "string" && originalArtDogStyleIds.some(id => id === value);
}

export const originalArtDogCatalog = originalArtDogStyleIds.flatMap(id => {
  const candidate = pixelArtCandidates.find(item => item.id === id);
  return candidate ? [{ id, code: id.toUpperCase(), name: candidate.name, description: candidate.direction, breed: candidate.breed }] : [];
});

/** Only full-resolution artwork with an editable counterpart becomes an applicable style. */
export function parseOriginalArtDogAssets(input: unknown): OriginalArtDogAsset[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<OriginalArtDogStyleId>();
  return input.flatMap(entry => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry) || !isOriginalArtDogStyleId(entry.id)
      || seen.has(entry.id) || !Number.isInteger(entry.width) || !Number.isInteger(entry.height)
      || entry.width < 256 || entry.height < 256 || entry.width > 4096 || entry.height > 4096
      || entry.png !== `/images/pixel-art-dogs-v1/${entry.id}.png`
      || entry.aseprite !== `/downloads/pixel-art-dogs-v1/${entry.id}.aseprite`) return [];
    seen.add(entry.id);
    return [{ id: entry.id, width: entry.width, height: entry.height, png: entry.png, aseprite: entry.aseprite }];
  });
}

export const originalArtDogAssets = parseOriginalArtDogAssets(completedAssets);
export const originalArtDogStyles = originalArtDogCatalog.filter(style => originalArtDogAssets.some(asset => asset.id === style.id))
  .map(style => ({ ...style, kind: "pixel" as const }));
export const originalArtDogArchive = "/downloads/puppyruby-pixel-art-dogs-30.zip";
export function originalArtDogAsset(id: unknown) { return originalArtDogAssets.find(asset => asset.id === id); }
