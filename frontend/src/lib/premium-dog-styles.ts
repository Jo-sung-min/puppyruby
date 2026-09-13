import completedAssets from "./generated/premium-puppy-assets.json";

export const premiumDogCatalog = [
  { id: "premium-marshmallow", code: "P01", name: "말랑 동그리", description: "폭신한 둥근 몸과 작은 크림빛 앞발" },
  { id: "premium-milkbean", code: "P02", name: "우유 콩알", description: "동그란 콩알 얼굴과 보드라운 작은 귀" },
  { id: "premium-honeybun", code: "P03", name: "꿀떡 순둥이", description: "꿀빛 볼과 포동포동한 빵 같은 몸" },
  { id: "premium-cloudpuff", code: "P04", name: "구름 몽실", description: "뭉게뭉게 둥근 털과 수줍은 표정" },
  { id: "premium-biscuit", code: "P05", name: "비스킷 볼살", description: "따뜻한 쿠키빛 귀와 도톰한 발" },
  { id: "premium-naploaf", code: "P06", name: "낮잠 포동이", description: "발을 쏙 모은 통통한 낮잠 친구" },
  { id: "premium-teddycub", code: "P07", name: "테디 꼬물이", description: "둥근 볼과 폭신한 곰돌이 같은 귀" },
  { id: "premium-peachcheek", code: "P08", name: "복숭아 볼콩", description: "분홍빛 볼에 작은 미소가 콕" },
  { id: "premium-buttonpaw", code: "P09", name: "왕발 토리", description: "단추 같은 눈과 동글동글한 앞발" },
  { id: "premium-rounddrop", code: "P10", name: "방울 졸리", description: "둥근 물방울 몸과 살짝 접힌 귀" },
  { id: "premium-cottonball", code: "P11", name: "솜솜 아기", description: "포근한 솜 같은 털과 짧고 작은 발" },
  { id: "premium-caramel", code: "P12", name: "카라멜 몽실", description: "말랑한 카라멜빛 몸과 순한 눈망울" },
] as const;

export type PremiumDogStyleId = (typeof premiumDogCatalog)[number]["id"];
export type PremiumDogAsset = { id: PremiumDogStyleId; width: number; height: number; png: string; aseprite: string };

export function isPremiumDogStyleId(value: unknown): value is PremiumDogStyleId {
  return typeof value === "string" && premiumDogCatalog.some(style => style.id === value);
}

/** Publish a choice only when its original PNG and editable Aseprite have both been verified. */
export function parsePremiumDogAssets(input: unknown): PremiumDogAsset[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  return input.flatMap(entry => {
    if (!entry || typeof entry !== "object" || !isPremiumDogStyleId(entry.id) || seen.has(entry.id)
      || !Number.isInteger(entry.width) || !Number.isInteger(entry.height)
      || entry.width < 256 || entry.height < 256 || entry.width > 4096 || entry.height > 4096) return [];
    seen.add(entry.id);
    return [{ id: entry.id, width: entry.width, height: entry.height,
      png: `/images/premium-puppies-v1/${entry.id}.png`, aseprite: `/downloads/premium-puppies-v1/${entry.id}.aseprite` }];
  });
}

export const premiumDogAssets = parsePremiumDogAssets(completedAssets);
export const premiumDogStyles = premiumDogCatalog.filter(style => premiumDogAssets.some(asset => asset.id === style.id))
  .map(style => ({ ...style, kind: "pixel" as const }));
export const premiumDogArchive = "/downloads/puppyruby-premium-puppies-12.zip";
export function premiumDogAsset(id: unknown) { return premiumDogAssets.find(asset => asset.id === id); }
