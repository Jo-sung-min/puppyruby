export const cuteDogFamilies = [
  { id: "cozy", source: "C12", name: "졸린 순둥이", description: "나른한 눈과 부드럽게 내려온 귀" },
  { id: "bean", source: "C01", name: "콩알 꼬미", description: "콩알 눈과 크림빛 작은 얼굴" },
  { id: "bright", source: "C06", name: "초롱 눈망울", description: "커다란 눈으로 빤히 보는 호기심쟁이" },
  { id: "button", source: "C04", name: "동글 단추", description: "동그란 볼과 짧고 보드라운 귀" },
] as const;

export const cuteDogBodies = [
  { id: "chubby", name: "통통", description: "빵빵한 배와 짧고 도톰한 발" },
  { id: "slim", name: "날씬", description: "가느다란 몸과 가볍게 모은 발" },
  { id: "tall", name: "긴다리", description: "작은 몸 아래 길쭉한 다리" },
  { id: "loaf", name: "짧은다리", description: "옆으로 긴 몸과 쏙 나온 짧은 발" },
] as const;

export type CuteDogFamily = (typeof cuteDogFamilies)[number]["id"];
export type CuteDogBody = (typeof cuteDogBodies)[number]["id"];
export type CuteDogStyleId = `${CuteDogFamily}-${CuteDogBody}`;

export const cuteDogStyles = cuteDogFamilies.flatMap(family => cuteDogBodies.map(body => ({
  id: `${family.id}-${body.id}` as CuteDogStyleId,
  name: `${family.name} · ${body.name}`,
  description: body.description,
  family: family.id,
  familyName: family.name,
  source: family.source,
  body: body.id,
  kind: "pixel" as const,
})));

export function isCuteDogStyleId(value: unknown): value is CuteDogStyleId {
  return typeof value === "string" && cuteDogStyles.some(style => style.id === value);
}

export function cuteDogAssetPaths(id: CuteDogStyleId) {
  return { png: `/images/cute-puppies-v1/${id}.png`, aseprite: `/downloads/cute-puppies-v1/${id}.aseprite` };
}

export const cuteDogArchive = "/downloads/puppyruby-cute-puppies-16.zip";
