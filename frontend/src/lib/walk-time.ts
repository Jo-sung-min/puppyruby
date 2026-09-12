export type WalkPeriod = "day" | "sunset" | "night";
export const walkSchedule = [
  { period: "day", theme: "meadow", label: "낮 산책", hours: "06:00–17:00", description: "햇살이 머무는 잔디밭에서 반갑게 인사해요." },
  { period: "sunset", theme: "sunset", label: "노을 산책", hours: "17:00–20:00", description: "따뜻한 노을을 보며 오늘의 이야기를 나눠요." },
  { period: "night", theme: "night", label: "밤 산책", hours: "20:00–06:00", description: "달과 별 아래, 이웃과 천천히 걸어 보세요." },
] as const;

const seoulClock = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
export type WalkTime = (typeof walkSchedule)[number] & { clock: string; minutes: number; nextChangeAt: number };

/** The caller supplies an instant; machine/browser timezone and UI color theme never affect the scene. */
export function getWalkTime(instant: Date | number): WalkTime {
  const timestamp = instant instanceof Date ? instant.getTime() : instant;
  if (!Number.isFinite(timestamp)) throw new RangeError("A valid instant is required for the walking schedule.");
  const date = new Date(timestamp);
  const parts = seoulClock.formatToParts(date);
  const number = (type: "hour" | "minute" | "second") => Number(parts.find(part => part.type === type)?.value);
  const hour = number("hour"), minute = number("minute"), second = number("second");
  const minutes = hour * 60 + minute;
  const slot = minutes >= 360 && minutes < 1020 ? walkSchedule[0] : minutes >= 1020 && minutes < 1200 ? walkSchedule[1] : walkSchedule[2];
  const next = [360, 1020, 1200].find(boundary => boundary > minutes) ?? 1800;
  return { ...slot, minutes, clock: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    nextChangeAt: timestamp + (next - minutes) * 60_000 - second * 1000 - date.getUTCMilliseconds() };
}
