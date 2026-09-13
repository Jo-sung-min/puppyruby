import { dogBreeds, dogBreedIds, type PixelBreed } from "./dog-breeds";
import { cuteDogStyles } from "./cute-dog-styles";
import { premiumDogStyles } from "./premium-dog-styles";
import { originalArtDogStyles } from "./original-art-dog-styles";
import { art16SceneStyles } from "./art16-scene-styles";
import { spSceneStyles } from "./sp-scene-styles";

const pixelStyleCatalog = [
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
  { id: "marshmallow", name: "마시멜로", description: "네모동글 얼굴과 폭신한 작은 몸" },
  { id: "dumpling", name: "꼬마 만두", description: "통통한 볼과 접힌 귀의 동그란 만두" },
  { id: "pebble", name: "조약돌", description: "납작하고 매끈한 머리와 조그만 발" },
  { id: "jellybean", name: "젤리빈", description: "길쭉한 얼굴에 반짝이는 타원 눈" },
  { id: "teacup", name: "찻잔 꼬마", description: "아주 작은 몸과 아래로 모인 앞발" },
  { id: "loaf", name: "식빵 자세", description: "긴 몸 아래 발을 쏙 감춘 강아지" },
  { id: "pear", name: "통통 배", description: "작은 얼굴 아래 둥글게 넓어지는 몸" },
  { id: "egg", name: "달걀 친구", description: "세로로 동그란 얼굴과 작은 콩알 눈" },
  { id: "snowball", name: "눈뭉치", description: "둥근 털뭉치 머리와 두툼한 발" },
  { id: "teddy", name: "테디 퍼피", description: "커다란 둥근 귀와 봉제 인형 팔" },
  { id: "panda", name: "판다 눈망울", description: "동그란 눈 무늬와 모아 앉은 앞발" },
  { id: "cub", name: "아기 곰돌", description: "넓은 주둥이와 낮게 달린 둥근 귀" },
  { id: "foxlet", name: "아기 여우", description: "각진 볼과 길게 선 귀, 날렵한 눈" },
  { id: "longbody", name: "기다란 친구", description: "아담한 머리와 옆으로 긴 몸통" },
  { id: "tinyhead", name: "작은 머리", description: "동그란 작은 머리와 긴 다리의 반전" },
  { id: "bigpaws", name: "왕발 꼬마", description: "큼직한 앞발을 내민 호기심쟁이" },
  { id: "cheeky", name: "볼빵빵", description: "옆으로 부푼 볼과 콕 찍힌 주근깨" },
  { id: "squircle", name: "말랑 사각", description: "모서리를 깎은 사각 얼굴과 단추 눈" },
  { id: "diamond", name: "보석 얼굴", description: "작은 마름모 눈과 보석처럼 각진 볼" },
  { id: "toast", name: "토스트 도트", description: "키 큰 식빵 얼굴과 짧은 다리" },
  { id: "waffle", name: "와플 친구", description: "격자 무늬 털과 납작한 사각 얼굴" },
  { id: "pixel8", name: "여덟 비트", description: "큼직한 도트와 간결한 네모 눈" },
  { id: "arcade", name: "아케이드", description: "두꺼운 윤곽과 반짝이는 게임 눈" },
  { id: "robot", name: "로봇 퍼피", description: "반듯한 몸과 사각 귀, 작은 이음새" },
  { id: "paper", name: "종이 인형", description: "얇고 각진 얼굴선과 길쭉한 앞발" },
  { id: "origami", name: "종이접기", description: "접힌 귀와 삼각 털무늬의 작은 친구" },
  { id: "patchwork", name: "조각 인형", description: "한쪽 눈의 털무늬와 점선 바느질" },
  { id: "pompom", name: "폼폼 털뭉치", description: "크고 작은 털방울이 둘러싼 얼굴" },
  { id: "cloudlet", name: "뭉게 구름", description: "넓게 퍼진 구름 볼과 가는 초승달 눈" },
  { id: "sprout", name: "새싹 앞머리", description: "삐죽 솟은 앞머리와 기다란 귀" },
  { id: "sleepy", name: "졸린 꼬마", description: "반쯤 감긴 눈과 낮게 웅크린 몸" },
  { id: "wink", name: "윙크 친구", description: "한쪽 눈을 찡긋 감은 둥근 얼굴" },
  { id: "happy", name: "활짝 웃음", description: "커다란 웃는 눈과 동그란 입" },
  { id: "hug", name: "꼬옥 안아줘", description: "앞으로 팔을 모아 안기는 포근한 자세" },
  { id: "meadow", name: "산책 도트", description: "네 발로 선 자세와 진한 윤곽, 층층이 포근한 털" },
] as const;

export const pixelDogStyles = [...pixelStyleCatalog.map(style => ({ ...style, kind: "pixel" as const })), ...cuteDogStyles, ...premiumDogStyles, ...originalArtDogStyles, ...art16SceneStyles, ...spSceneStyles];
export const dogStyles = [...pixelDogStyles,
  { id: "animated-2d", name: "살아있는 2D", description: "부드러운 곡선과 자연스럽게 움직이는 강아지", kind: "animated" },
] as const;

export type DogStyleId = (typeof dogStyles)[number]["id"];
export const styleBreedIds = dogBreedIds;
export const styleBreeds: { id: PixelBreed; name: string }[] = dogBreeds.map(({ id, name }) => ({ id, name }));
export const varietyShapes = ["original", "teddy", "fox"] as const;
export const varietyPatterns = ["solid", "tuxedo", "patches", "freckles", "socks", "blaze"] as const;
export type DogVariantLook = {
  shape: (typeof varietyShapes)[number];
  pattern: (typeof varietyPatterns)[number];
  coatColor: string | null;
  patternColor: string;
};
export type DogVariety = DogVariantLook & { id: string; breed: PixelBreed; name: string; style: DogStyleId | null };
export const defaultVariantLook: DogVariantLook = { shape: "original", pattern: "solid", coatColor: null, patternColor: "#FFFFFF" };
export type AppearanceConfig = {
  defaultStyle: DogStyleId;
  breedStyles: Partial<Record<PixelBreed, DogStyleId>>;
  deletedStyles?: DogStyleId[];
  varieties?: DogVariety[];
  breedVarieties?: Partial<Record<PixelBreed, string>>;
  revision: number;
  updatedAt: number | null;
};
export const defaultAppearance: AppearanceConfig = { defaultStyle: "classic", breedStyles: {}, deletedStyles: [], varieties: [], breedVarieties: {}, revision: 0, updatedAt: null };

export function isDogStyleId(value: unknown): value is DogStyleId {
  return typeof value === "string" && dogStyles.some(style => style.id === value);
}
export function isStyleAvailable(config: AppearanceConfig | null | undefined, style: unknown): style is DogStyleId {
  return isDogStyleId(style) && !(Array.isArray(config?.deletedStyles) && config.deletedStyles.includes(style));
}
export function activeDogStyles(config: AppearanceConfig | null | undefined) {
  return dogStyles.filter(style => isStyleAvailable(config, style.id));
}
export function resolveDogStyle(config: AppearanceConfig | null | undefined, breed: PixelBreed): DogStyleId {
  const varietyStyle = resolveDogVariety(config, breed)?.style;
  if (isStyleAvailable(config, varietyStyle)) return varietyStyle;
  const override = config?.breedStyles?.[breed];
  if (isStyleAvailable(config, override)) return override;
  if (isStyleAvailable(config, config?.defaultStyle)) return config.defaultStyle;
  return activeDogStyles(config)[0]?.id ?? "classic";
}

export function resolveDogVariety(config: AppearanceConfig | null | undefined, breed: PixelBreed): DogVariety | undefined {
  const id = config?.breedVarieties?.[breed];
  return config?.varieties?.find(variety => variety.id === id && variety.breed === breed);
}
