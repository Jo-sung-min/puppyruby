import type { Puppy } from "./game";

export type WalkTheme = "meadow" | "sunset" | "night";
export type Friendship = "self" | "none" | "outgoing" | "incoming" | "friend";
export type WalkProfile = {
  /** Public social ID, never the private visitor cookie ID. */
  id: string; nickname: string; age: number | null; friendship: Friendship;
  realName: string | null; photo: string | null;
};
export type WalkMe = WalkProfile & { configured: boolean };
export type WalkMember = {
  profile: WalkProfile;
  puppy: Pick<Puppy, "id" | "name" | "breed" | "grade" | "fur" | "eyes" | "accessory" | "aura">;
  x: number; y: number; lastSeen: number;
};
export type WalkMessage = { id: string; author: WalkProfile | null; text: string; createdAt: number; system: boolean };
export type WalkRoomSummary = {
  id: string; title: string; description: string; theme: WalkTheme; capacity: number;
  memberCount: number; owner: WalkProfile | null; createdAt: number;
};
export type WalkRoom = WalkRoomSummary & { members: WalkMember[]; messages: WalkMessage[] };
export type WalkState = {
  me: WalkMe; rooms: WalkRoomSummary[]; room: WalkRoom | null;
  friends: WalkProfile[]; requests: WalkProfile[]; serverTime: number;
};
export type WalkResult = { state: WalkState; message: string };
export type WalkAction = "profile" | "create" | "join" | "leave" | "message" | "move" | "friend-request" | "friend-accept" | "friend-decline" | "friend-remove";
export type WalkActionInput = {
  nickname?: string; age?: number | null; realName?: string | null; photo?: string | null;
  title?: string; description?: string; theme?: WalkTheme; capacity?: number; roomId?: string;
  text?: string; clientId?: string; x?: number; y?: number; targetId?: string;
};

export const walkThemes: Record<WalkTheme, { label: string; description: string }> = {
  meadow: { label: "햇살 잔디밭", description: "초록 잔디 위에서 가볍게 인사해요" },
  sunset: { label: "노을 산책길", description: "따스한 노을 아래 도란도란" },
  night: { label: "별빛 공원", description: "별이 빛나는 조용한 밤 산책" },
};
export function ownerLabel(profile: WalkProfile) { return `${profile.nickname}${profile.age === null ? "" : ` (${profile.age})`}`; }
export async function requestWalk<T = WalkState>(action?: WalkAction, body?: WalkActionInput, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/walk${action ? `/${action}` : ""}`, {
    method: action ? "POST" : "GET", headers: { "Content-Type": "application/json" },
    body: action ? JSON.stringify(body || {}) : undefined, cache: "no-store", signal,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "산책길에 잠깐 연결이 어려워요. 다시 시도해 주세요.");
  return data;
}
