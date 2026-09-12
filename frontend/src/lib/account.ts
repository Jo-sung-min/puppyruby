export type AccountUser = {
  id: string;
  email: string | null;
  displayName: string;
  role: "USER" | "ADMIN";
  status: "ACTIVE" | "SUSPENDED";
  emailVerified: boolean;
  provider: "EMAIL" | "KAKAO";
  createdAt: number | string;
};

export type AccountConfig = { emailEnabled: boolean; kakaoEnabled: boolean };
export type AccountSession = { user: AccountUser | null; config: AccountConfig };
export type AccountResult = { user: AccountUser; message: string };
export type MessageResult = { message: string; logout?: boolean };
export type AdminOverview = {
  members: number;
  activeMembers: number;
  suspendedMembers: number;
  puppies: number;
  rooms: number;
  messages: number;
};
export type AdminMember = Omit<AccountUser, "provider"> & { puppyCount: number };
export type AdminMembers = {
  items: AdminMember[];
  page: number;
  totalPages: number;
  totalElements: number;
};
export type AdminRoom = {
  id: string;
  title: string;
  ownerLabel: string;
  memberCount: number;
  messageCount: number;
  createdAt: number | string;
};
export type AdminMessage = {
  id: string;
  authorLabel: string;
  text: string;
  createdAt: number | string;
};
export type AdminPage<T> = { items: T[]; page: number; totalElements: number };

export class AccountError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "AccountError";
  }
}

async function accountRequest<T>(prefix: string, path: string, body?: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${prefix}/${path.replace(/^\//, "")}`, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const fallback = response.status === 401
      ? "로그인이 필요해요. 다시 로그인해 주세요."
      : response.status === 403
        ? "이 작업을 진행할 수 없어요. 계정 상태와 권한을 확인해 주세요."
        : response.status === 503
          ? "아직 준비 중인 기능이에요. 잠시 후 다시 확인해 주세요."
          : "연결이 원활하지 않아요. 잠시 후 다시 시도해 주세요.";
    throw new AccountError(typeof data?.message === "string" ? data.message : fallback, response.status);
  }
  if (!data || typeof data !== "object") {
    throw new AccountError("응답을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.", response.status);
  }
  return data as T;
}

export function authFetch<T>(path: string, body?: Record<string, unknown>, signal?: AbortSignal) {
  return accountRequest<T>("/api/auth", path, body, signal);
}

export function adminFetch<T>(path: string, body?: Record<string, unknown>, signal?: AbortSignal) {
  return accountRequest<T>("/api/admin", path, body, signal);
}

export function accountChanged() {
  window.dispatchEvent(new Event("puppyruby-auth-changed"));
  try { localStorage.setItem("puppyruby-auth-revision", String(Date.now())); }
  catch { /* This tab still updates when the browser blocks local storage. */ }
}

export function accountErrorMessage(problem: unknown) {
  return problem instanceof Error ? problem.message : "연결이 원활하지 않아요. 다시 시도해 주세요.";
}

export function accountDate(value: number | string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("ko-KR");
}

export function isAccountAccessError(problem: unknown) {
  return problem instanceof AccountError && (problem.status === 401 || problem.status === 403);
}

export function passwordProblem(password: string) {
  if ([...password].length < 8) return "비밀번호는 8자 이상으로 입력해 주세요.";
  if (new TextEncoder().encode(password).length > 72) return "비밀번호가 너무 길어요. 영문·숫자는 72자, 한글은 24자 이내로 입력해 주세요.";
  return "";
}
