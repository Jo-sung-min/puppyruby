import { AccountError } from "./account";
import type { GameState, Grade } from "./game";

export type CommerceKind = "dog" | "aura" | "accessory";
export type CosmeticKind = Exclude<CommerceKind, "dog">;
export const commerceKinds: { id: CommerceKind; name: string; ticketName: string; description: string }[] = [
  { id: "dog", name: "강아지", ticketName: "강아지 뽑기권", description: "함께 지낼 새로운 강아지 친구를 만나요." },
  { id: "aura", name: "아우라", ticketName: "아우라 뽑기권", description: "강아지 주위에 은은한 빛을 더해요." },
  { id: "accessory", name: "치장품", ticketName: "치장품 뽑기권", description: "작은 소품으로 강아지의 모습을 꾸며요." },
];
export type CommerceProduct = { id: string; kind: CommerceKind; name: string; quantity: number; price: number; enabled: boolean };
export type CommerceEntry = {
  id: string; label: string; grade: Grade; breed: number | null; itemId: string | null;
  weight: number; probability: string;
};
export type CommercePool = { kind: CommerceKind; name: string; entries: CommerceEntry[] };
export type CommerceCatalog = {
  revision: number; updatedAt: number | null; salesEnabled: boolean;
  products: CommerceProduct[]; pools: CommercePool[];
};
export type CommerceReward = {
  id: string; kind: CommerceKind; entryId: string; label: string; grade: Grade;
  breed: number | null; itemId: string | null; puppyId: string | null;
  createdAt: number; catalogRevision: number; duplicate: boolean;
};
export type CommerceWallet = {
  tickets: Record<CommerceKind, number>;
  items: { kind: CosmeticKind; itemId: string; count: number }[];
  history: CommerceReward[]; balanceHold: boolean;
};
export type CommerceDrawResult = { wallet: CommerceWallet; reward: CommerceReward; game: GameState };
export function checkedDrawResult(value: CommerceDrawResult, expectedKind: CommerceKind): CommerceDrawResult {
  const valid = value && typeof value === "object"
    && value.wallet && typeof value.wallet === "object" && typeof value.wallet.balanceHold === "boolean"
    && value.wallet.tickets && commerceKinds.every(kind => Number.isSafeInteger(value.wallet.tickets[kind.id]))
    && Array.isArray(value.wallet.items) && Array.isArray(value.wallet.history)
    && value.reward && value.reward.kind === expectedKind && typeof value.reward.id === "string" && typeof value.reward.label === "string"
    && value.game && typeof value.game.selectedId === "string" && Array.isArray(value.game.puppies);
  if (!valid) throw new Error("뽑기 결과를 확인하지 못했어요. 같은 요청을 다시 확인해 주세요.");
  return value;
}
export type PaymentConfig = { enabled: boolean; mode: string; clientKey: string | null; message: string };
export type PaymentOrder = {
  orderId: string; orderName: string; amount: number; quantity: number; kind: CommerceKind;
  status: string; createdAt: number; paidAt: number | null; refundedAmount: number;
  ticketsGranted: boolean; receiptUrl?: string | null;
};
export type PaymentOrders = { orders: PaymentOrder[] };

async function commerceRequest<T>(prefix: string, path: string, body?: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${prefix}/${path.replace(/^\//, "")}`, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin", cache: "no-store", signal,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const fallback = response.status === 401 ? "로그인한 뒤 이용해 주세요."
      : response.status === 403 ? "현재 계정으로 이용할 수 없어요."
        : response.status === 503 ? "아직 준비 중이에요. 잠시 후 다시 확인해 주세요."
          : "연결이 원활하지 않아요. 잠시 후 다시 시도해 주세요.";
    throw new AccountError(typeof data?.message === "string" ? data.message : fallback, response.status);
  }
  if (!data || typeof data !== "object") throw new Error("결과를 확인하지 못했어요. 다시 확인해 주세요.");
  return data as T;
}

export function commerceFetch<T>(path: string, body?: Record<string, unknown>, signal?: AbortSignal) {
  return commerceRequest<T>("/api/commerce", path, body, signal);
}
export function paymentsFetch<T>(path: string, body?: Record<string, unknown>, signal?: AbortSignal) {
  return commerceRequest<T>("/api/payments", path, body, signal);
}
export function commerceKindName(kind: CommerceKind) {
  return commerceKinds.find(item => item.id === kind)?.name ?? "뽑기";
}
export function commerceMoney(amount: number) { return `${amount.toLocaleString("ko-KR")}원`; }
export function commerceDate(value: number) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Seoul" });
}
export function probabilityText(value: string) { return value.endsWith("%") ? value : `${value}%`; }
export function paymentStatusLabel(status: string) {
  const labels: Record<string, string> = {
    READY: "결제 전", CREATED: "결제 전", IN_PROGRESS: "결제 진행 중", WAITING_FOR_DEPOSIT: "입금 대기",
    APPROVING: "결제 확인 중", CONFIRMING: "결제 확인 중", VERIFYING: "결제 확인 중", DONE: "결제 완료", PAID: "결제 완료",
    CANCELED: "결제 취소", CANCELLED: "결제 취소", PARTIAL_CANCELED: "일부 취소", REFUNDED: "환불 완료",
    PARTIALLY_REFUNDED: "일부 환불", FAILED: "결제 실패", ABORTED: "결제 중단", EXPIRED: "유효 시간 만료",
  };
  return labels[status] ?? "상태 확인 필요";
}

/** Allocate the last decimal places so the displayed relative weights sum to exactly 100%. */
export function relativeProbabilities(weights: number[]): string[] {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (!total || weights.some(weight => !Number.isSafeInteger(weight) || weight < 0 || weight > 1_000_000)) return weights.map(() => "—");
  const scale = 100_000_000;
  const portions = weights.map((weight, index) => ({ index, units: Math.floor(weight * scale / total), remainder: weight * scale % total }));
  let remaining = scale - portions.reduce((sum, item) => sum + item.units, 0);
  const byRemainder = [...portions].sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const item of byRemainder) { if (remaining-- <= 0) break; item.units++; }
  return portions.map(item => `${(item.units / 1_000_000).toFixed(6).replace(/\.?0+$/, "")}%`);
}
