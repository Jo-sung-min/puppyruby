import type { PixelBreed } from "../components/pixel-dog";

export const dogStyles = [
  { id: "classic", name: "클래식 도트", description: "따뜻한 털빛과 작은 발의 원래 강아지" },
  { id: "round", name: "동글 얼굴", description: "둥근 볼과 짧은 귀, 반짝이는 눈" },
  { id: "mochi", name: "말랑 찹쌀떡", description: "옆으로 통통한 얼굴과 쏙 숨은 발" },
  { id: "chibi", name: "왕머리 꼬마", description: "커다란 얼굴 아래 아주 작은 몸" },
  { id: "bean", name: "콩알 친구", description: "얼굴과 몸이 이어진 길쭉한 콩 모양" },
  { id: "plush", name: "폭신 인형", description: "도톰한 귀와 단추 눈, 둥근 인형 발" },
  { id: "storybook", name: "동화 속 산책", description: "아담한 머리와 긴 몸, 순한 미소" },
  { id: "bold", name: "또렷한 만화", description: "굵은 테두리와 큼직한 눈썹" },
  { id: "retro", name: "레트로 게임", description: "네모난 큰 도트로 그린 게임 친구" },
  { id: "mini", name: "미니 도트", description: "작은 픽셀로 꼭 필요한 표정만 쏙" },
  { id: "sticker", name: "방긋 스티커", description: "하얀 테두리를 두른 활짝 웃는 얼굴" },
  { id: "soft", name: "포근한 구름", description: "부드러운 얼굴선과 수줍은 작은 눈" },
  { id: "fluffy", name: "복슬복슬", description: "볼과 머리에 풍성한 털이 가득" },
  { id: "pocket", name: "주머니 강아지", description: "앞발을 모으고 주머니에서 빼꼼" },
  { id: "cookie", name: "바삭 쿠키", description: "물결 가장자리와 콕콕 찍힌 쿠키 눈" },
  { id: "badge", name: "얼굴 배지", description: "몸 대신 얼굴을 담은 동그란 배지" },
] as const;

export type DogStyleId = (typeof dogStyles)[number]["id"];
export const styleBreedIds = ["pomeranian", "poodle", "maltese", "shiba", "corgi", "beagle", "samoyed"] as const satisfies readonly PixelBreed[];
export const styleBreeds: { id: PixelBreed; name: string }[] = [
  { id: "pomeranian", name: "포메라니안" }, { id: "poodle", name: "토이 푸들" },
  { id: "maltese", name: "말티즈" }, { id: "shiba", name: "시바견" },
  { id: "corgi", name: "웰시 코기" }, { id: "beagle", name: "비글" }, { id: "samoyed", name: "사모예드" },
];
export type AppearanceConfig = {
  defaultStyle: DogStyleId;
  breedStyles: Partial<Record<PixelBreed, DogStyleId>>;
  revision: number;
  updatedAt: number | null;
};
export const defaultAppearance: AppearanceConfig = { defaultStyle: "classic", breedStyles: {}, revision: 0, updatedAt: null };

export function isDogStyleId(value: unknown): value is DogStyleId {
  return typeof value === "string" && dogStyles.some(style => style.id === value);
}
export function resolveDogStyle(config: AppearanceConfig | null | undefined, breed: PixelBreed): DogStyleId {
  const override = config?.breedStyles?.[breed];
  if (isDogStyleId(override)) return override;
  return isDogStyleId(config?.defaultStyle) ? config.defaultStyle : "classic";
}
