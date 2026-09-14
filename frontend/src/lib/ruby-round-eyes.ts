/** Stable IDs are stored in the existing puppy eyes field, alongside the original four colors. */
const labels = [
  "기본 검은눈", "갈색 순둥눈", "파란 반짝눈", "초록 반짝눈", "금빛 눈", "분홍 사랑눈",
  "보랏빛 몽환눈", "쉬는 미소", "도도 반눈", "졸린 눈", "무표정 쿨눈", "초승달 웃음",
  "반짝 별눈", "동그란 아기눈", "호기심 눈", "새침한 눈", "장난기 눈", "슬픈 촉촉눈",
  "자신감 눈", "깜짝 큰눈", "윙크눈", "삐진 눈", "용맹한 눈", "온화한 눈",
  "청록 신비눈", "붉은 열정눈", "회색 차분눈", "쌍하트 눈", "까만 유리알눈", "힐링 순둥눈",
] as const;
const colors: Record<number, string> = { 2: "#75513a", 3: "#499cca", 4: "#789e61", 5: "#d4a347", 6: "#e37898", 7: "#a16fca", 13: "#d4a347", 18: "#499cca", 25: "#29a6a0", 26: "#bd4343", 27: "#7a848f", 28: "#e37898" };
export type RubyEyeStyleId = `ruby-eye-${string}`;
export const rubyEyeStyles = labels.map((label, index) => ({
  id: `ruby-eye-${String(index + 1).padStart(2, "0")}` as RubyEyeStyleId,
  label, color: colors[index + 1] ?? "#292323", number: index + 1,
  png: `/images/ruby-round-v1/eyes/eye-${String(index + 1).padStart(2, "0")}.png`,
}));
export function isRubyEyeStyleId(value: unknown): value is RubyEyeStyleId { return typeof value === "string" && rubyEyeStyles.some(eye => eye.id === value); }
export function rubyEyeStyle(value: unknown) {
  const mapped = value === "blue" ? "ruby-eye-03" : value === "green" ? "ruby-eye-04" : value === "amber" ? "ruby-eye-05" : value;
  return rubyEyeStyles.find(eye => eye.id === mapped) ?? rubyEyeStyles[0];
}
