export type Grade = "N" | "R" | "SR" | "SSR";
export type Puppy = {
  id: string; name: string; breed: number; grade: Grade; xp: number;
  hunger: number; happiness: number; energy: number;
  fur: string; eyes: string; accessory: string;
  lastFeed: number; lastPlay: number; lastRest: number; lastTrain: number;
};
export type GradeInfo = { id: Grade; label: string; obedience: number; probability: number };
export type GameState = {
  coins: number; selectedId: string; puppies: Puppy[]; giftAvailable: boolean;
  careCount: number; trainingCount: number; grades: GradeInfo[]; adoptionCost: number; promotionXp: number;
};
export type ActionResult = { state: GameState; message: string; success: boolean; newPuppyId: string | null };
export const breeds = [
  { name: "포메라니안", personality: "작은 몸에 가득한 사랑", color: "#f8eddf" },
  { name: "토이 푸들", personality: "호기심 많은 똑똑이", color: "#f5e5db" },
  { name: "말티즈", personality: "네 곁이 가장 좋은 애교쟁이", color: "#eeedf7" },
  { name: "시바 이누", personality: "알수록 사랑스러운 친구", color: "#f9ebd9" },
  { name: "웰시 코기", personality: "짧은 다리로 성큼 오는 행복", color: "#e7efe5" },
  { name: "비글", personality: "매일이 신나는 장난꾸러기", color: "#f7e6e6" },
];
export const furOptions = [
  { id: "original", label: "원래 털색", color: "#f4d6aa" },
  { id: "cream", label: "바닐라 크림", color: "#ffefd1" },
  { id: "chocolate", label: "초코 브라운", color: "#865744" },
  { id: "rose", label: "딸기 우유", color: "#dfa9b3" },
  { id: "silver", label: "실버 그레이", color: "#b9c1ca" },
];
export const eyeOptions = [
  { id: "original", label: "초코 눈동자", color: "#433024" },
  { id: "blue", label: "오션 블루", color: "#499cca" },
  { id: "green", label: "올리브 그린", color: "#789e61" },
  { id: "amber", label: "허니 앰버", color: "#d4a347" },
];
export const accessories = [
  { id: "none", label: "장착 해제", emoji: "—" }, { id: "ribbon", label: "복숭아 리본", emoji: "🎀" },
  { id: "scarf", label: "포근한 목도리", emoji: "🧣" }, { id: "crown", label: "작은 왕관", emoji: "👑" },
];

export async function requestGame<T>(path = "", body?: Record<string, unknown>): Promise<T> {
  const response = await fetch(`/api/game${path}`, {
    method: body ? "POST" : "GET", headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined, cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "잠시 연결이 어려워요. 다시 시도해 주세요.");
  return data;
}
