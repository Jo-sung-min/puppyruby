// Numeric positions are persisted by the game and desktop sync. Append only.
export const dogBreeds = [
  { id: "pomeranian", name: "포메라니안", note: "풍성한 털, 작은 여우 미소", color: "#f8eddf", personality: "작은 몸에 가득한 사랑", defaultName: "루비", palette: ["#f1c895", "#c29d77", "#fff0d9"] },
  { id: "poodle", name: "토이 푸들", note: "곱슬곱슬한 털과 늘어진 귀", color: "#f5e5db", personality: "호기심 많은 똑똑이", defaultName: "초코", palette: ["#d5aa86", "#ad8568", "#f3dcc2"] },
  { id: "maltese", name: "말티즈", note: "새하얀 털과 동그란 눈", color: "#eeedf7", personality: "네 곁이 가장 좋은 애교쟁이", defaultName: "구름", palette: ["#fffaf0", "#c7bbb0", "#fffdf9"] },
  { id: "shiba", name: "시바견", note: "쫑긋한 귀와 크림빛 볼", color: "#f9ebd9", personality: "알수록 사랑스러운 친구", defaultName: "모찌", palette: ["#edb77e", "#bd9069", "#fff1dc"] },
  { id: "corgi", name: "웰시 코기", note: "커다란 귀와 짧은 다리", color: "#e7efe5", personality: "짧은 다리로 성큼 오는 행복", defaultName: "코코", palette: ["#e8b57e", "#b88c65", "#fff4df"] },
  { id: "beagle", name: "비글", note: "갈색 귀와 하얀 이마 줄", color: "#f7e6e6", personality: "매일이 신나는 장난꾸러기", defaultName: "쿠키", palette: ["#d8aa82", "#a07c60", "#fff3de"] },
  { id: "samoyed", name: "사모예드", note: "폭신한 흰 털과 웃는 입", color: "#e9e9df", personality: "언제나 웃는 솜사탕", defaultName: "눈꽃", palette: ["#fff9ed", "#c8beb0", "#fffdf7"] },
  { id: "bichon", name: "비숑 프리제", note: "둥근 솜뭉치 같은 머리", color: "#efeee8", personality: "포근하게 안기는 솜뭉치", defaultName: "솜이", palette: ["#fffdf7", "#c6bdb3", "#ffffff"] },
  { id: "golden", name: "골든 리트리버", note: "황금빛 털과 보드라운 귀", color: "#f5e4c9", personality: "다정한 눈빛의 든든한 친구", defaultName: "골디", palette: ["#eac38e", "#b78e64", "#f9e2b9"] },
  { id: "labrador", name: "래브라도 리트리버", note: "짧은 크림 털과 넓은 코", color: "#f4eddb", personality: "함께 뛰는 시간이 가장 좋아", defaultName: "라떼", palette: ["#f3dfb8", "#b9a181", "#fff0d2"] },
  { id: "husky", name: "시베리안 허스키", note: "검정·하양 얼굴과 뾰족한 귀", color: "#e6e8eb", personality: "산책길이 기다려지는 모험가", defaultName: "루나", palette: ["#555359", "#39373d", "#fffaf0"] },
  { id: "shihtzu", name: "시추", note: "묶은 앞머리와 두 가지 털색", color: "#eee0d3", personality: "느긋하게 네 곁을 지켜요", defaultName: "두부", palette: ["#aa8a72", "#725c50", "#fff7e9"] },
  { id: "frenchbulldog", name: "프렌치 불도그", note: "박쥐 귀와 한쪽 눈 얼룩", color: "#eee8df", personality: "커다란 귀로 네 이야기를 들어요", defaultName: "봉봉", palette: ["#fff1d8", "#a89b88", "#fffaf1"] },
  { id: "dachshund", name: "닥스훈트", note: "긴 몸통과 길게 내려오는 귀", color: "#e3d4ca", personality: "작은 발로 씩씩하게 출발", defaultName: "소시지", palette: ["#5c4840", "#3e302c", "#c9986c"] },
  { id: "schnauzer", name: "미니어처 슈나우저", note: "하얀 눈썹과 멋진 수염", color: "#e4e3e1", personality: "호기심으로 반짝이는 수염 친구", defaultName: "슈슈", palette: ["#898580", "#595550", "#f3eee5"] },
  { id: "chihuahua", name: "치와와", note: "작은 얼굴과 커다란 귀", color: "#f3e8d8", personality: "작아도 마음만큼은 용감해", defaultName: "콩이", palette: ["#f5dfb9", "#bba17d", "#fff6e7"] },
  { id: "dalmatian", name: "달마시안", note: "하얀 털 위 검정 점박이", color: "#ececeb", personality: "점박이 옷을 입은 활발한 친구", defaultName: "도트", palette: ["#fffdf6", "#9f9b96", "#ffffff"] },
  { id: "akita", name: "아키타", note: "도톰한 얼굴과 작은 쫑긋 귀", color: "#f1ddc2", personality: "조용히 오래 함께하는 친구", defaultName: "아키", palette: ["#e2ad72", "#a77f58", "#fff1d7"] },
  { id: "bordercollie", name: "보더콜리", note: "복슬한 검정 털과 하얀 이마", color: "#e4e4e6", personality: "눈을 맞추면 마음을 알아요", defaultName: "보리", palette: ["#48464a", "#2d2b30", "#fffdf5"] },
  { id: "doberman", name: "도베르만", note: "길게 선 귀와 갈색 눈썹", color: "#e4d6c9", personality: "당당한 모습 속 다정한 마음", defaultName: "로이", palette: ["#48423f", "#292725", "#c49164"] },
  { id: "rottweiler", name: "로트와일러", note: "넓은 얼굴과 검정·갈색 털", color: "#e6d9cd", personality: "든든한 체격의 순한 친구", defaultName: "로티", palette: ["#4c4541", "#302c29", "#cc9e71"] },
  { id: "greatdane", name: "그레이트 데인", note: "회색 털과 길쭉한 얼굴", color: "#e5e3e4", personality: "커다란 몸에 담긴 부드러움", defaultName: "데니", palette: ["#9e9995", "#68635f", "#b8b2ac"] },
  { id: "saintbernard", name: "세인트 버나드", note: "짙은 귀와 넓은 흰 줄무늬", color: "#ebdccc", personality: "꼭 안기고 싶은 포근한 친구", defaultName: "버니", palette: ["#b38a6d", "#745b4c", "#fff7e8"] },
  { id: "bassethound", name: "바셋 하운드", note: "아주 긴 귀와 낮은 몸", color: "#ecdac6", personality: "천천히 냄새를 따라 걷는 친구", defaultName: "바비", palette: ["#c79970", "#916b4b", "#fff2d9"] },
  { id: "englishbulldog", name: "잉글리시 불도그", note: "접힌 작은 귀와 통통한 볼", color: "#efdfc9", personality: "느긋하고 사랑스러운 장난꾸러기", defaultName: "만두", palette: ["#dfb382", "#a68360", "#fff9ed"] },
  { id: "westie", name: "웨스트 하이랜드 화이트 테리어", note: "뾰족한 귀와 하얀 수염 털", color: "#eeece6", personality: "하얀 털 사이로 빼꼼 웃어요", defaultName: "설기", palette: ["#fffdf4", "#b9b4a9", "#ffffff"] },
  { id: "bostonterrier", name: "보스턴 테리어", note: "커다란 귀와 검정 턱시도", color: "#e5e5e8", personality: "반듯한 턱시도 속 개구쟁이", defaultName: "토니", palette: ["#4c494c", "#302d30", "#fffdf7"] },
  { id: "yorkshireterrier", name: "요크셔 테리어", note: "금빛 얼굴과 묶은 앞머리", color: "#e8d9c8", personality: "작고 반짝이는 용감한 친구", defaultName: "요미", palette: ["#cba574", "#8b7356", "#ecd0a2"] },
  { id: "pekingese", name: "페키니즈", note: "작은 주둥이와 풍성한 늘어진 털", color: "#f2e5d1", personality: "품에 쏙 들어오는 느긋한 친구", defaultName: "페페", palette: ["#f1dbb4", "#b39b79", "#fff2dc"] },
  { id: "chowchow", name: "차우차우", note: "갈기 같은 털과 보랏빛 혀", color: "#efdabd", personality: "곰처럼 포근한 나만의 친구", defaultName: "밤이", palette: ["#dfaf77", "#a77951", "#f0c994"] },
] as const;

export type PixelBreed = (typeof dogBreeds)[number]["id"];
export const dogBreedIds: PixelBreed[] = dogBreeds.map(breed => breed.id);
export function dogBreedAt(index: number) { return dogBreeds[index] ?? dogBreeds[0]; }
export function dogBreedById(id: string) { return dogBreeds.find(breed => breed.id === id) ?? dogBreeds[0]; }
