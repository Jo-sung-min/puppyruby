import { dogBreeds } from "./dog-breeds";

export type Grade = "N" | "R" | "SR" | "SSR";
export const gradeOrder: Grade[] = ["N", "R", "SR", "SSR"];
export type PuppyCommand = {
  id: string; kind: "training" | "shortcut"; app: "puppy" | "excel" | "hwp";
  label: string; requiredGrade: Grade; keys: string; aliases: string[]; context: string; sourceUrl: string;
};
export function commandUnlocked(grade: Grade, command: PuppyCommand) { return gradeOrder.indexOf(grade) >= gradeOrder.indexOf(command.requiredGrade); }
export type Puppy = {
  id: string; name: string; breed: number; grade: Grade; xp: number;
  hunger: number; happiness: number; energy: number;
  fur: string; eyes: string; accessory: string; aura?: string | null;
  lastFeed: number; lastPlay: number; lastRest: number; lastTrain: number;
};
export type GradeInfo = { id: Grade; label: string; obedience: number; probability: number };
export type GameState = {
  coins: number; selectedId: string; puppies: Puppy[]; giftAvailable: boolean;
  careCount: number; trainingCount: number; grades: GradeInfo[]; adoptionCost: number; promotionXp: number; commands: PuppyCommand[];
};
export type ActionResult = { state: GameState; message: string; success: boolean; newPuppyId: string | null };
export const breeds = dogBreeds;
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
