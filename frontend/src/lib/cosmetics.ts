export const auraStyles = {
  snow: { label: "눈꽃 아우라", color: "#cbdcf2" },
  peach: { label: "복숭아 아우라", color: "#ef9cad" },
  mint: { label: "민트 아우라", color: "#61c8a9" },
  ocean: { label: "바다 아우라", color: "#579fe7" },
  lilac: { label: "라일락 아우라", color: "#b196ed" },
  gold: { label: "황금 아우라", color: "#e6b749" },
  rainbow: { label: "무지개 아우라", color: "#c48cf0" },
  starlight: { label: "별빛 아우라", color: "#899aef" },
} as const;
export const paidAccessories = [
  { id: "bow-blue", label: "하늘 리본" }, { id: "bow-lilac", label: "라일락 리본" },
  { id: "party-hat", label: "파티 모자" }, { id: "flower", label: "꽃 장식" },
  { id: "glasses", label: "동그란 안경" }, { id: "halo", label: "천사 링" },
  { id: "angel-wings", label: "천사 날개" },
] as const;
export function auraColor(id?: string | null) {
  return id && Object.hasOwn(auraStyles, id) ? auraStyles[id as keyof typeof auraStyles].color : undefined;
}
