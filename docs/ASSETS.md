# 이미지 제작 기록

## 현재 픽셀 버전 (2026-09-12)

- 둥근 버전: 참고 에셋의 넓고 통통한 볼, 작은 점눈과 짧은 주둥이를 반영했습니다. 큰 머리와 작은 몸·발, 부드러운 털색을 사용하며 귀와 얼굴 무늬로 견종을 구분합니다. 실루엣은 정수 격자에서 한 픽셀씩 이어져 확대해도 도트가 선명합니다.
- 웹과 Windows 0.6 실행파일은 같은 SVG 원본을 사용합니다. `node scripts/preview-puppy-sprites.cjs --strict`로 견종·색상·동작별 갤러리와 공유 눈/장식 레이어의 픽셀 일치를 확인할 수 있습니다. 생성 결과는 `desktop/build/rounded-preview.png`에 저장됩니다.

- `frontend/src/components/pixel-dog.tsx`: 정수 좌표와 `shapeRendering="crispEdges"`를 사용하는 코드 기반 SVG 캐릭터. 시바·사모예드·푸들·코기·말티즈·비글·포메라니안, 털색·눈동자·픽셀 액세서리, 꼬리 흔들기·점프·식사·하트·낮잠을 지원합니다.
- `frontend/public/images/pixel-garden.svg`: 직접 작성한 픽셀 정원. 랜딩과 우리 집에서 공통 사용합니다.
- 사용자가 제공한 `D:\projectT\프로젝트 이미지 모음\퍼피루비`의 PNG 4장(견종 표 2장, 시바 털색 10종, 사모예드 형태 10종)을 시각적으로 참고해 새로 그렸습니다. 원본 파일을 수정하거나 외부에 업로드하지 않았습니다.
- 참고 사이트: https://comnyang.com/ko — 캐릭터 체험 중심 정보 구성을 참고했으며, 사이트 이미지나 코드를 복제하지 않았습니다.
- 글꼴: npm `galmuri`, SIL Open Font License 1.1. 라이선스는 `node_modules/galmuri/ofl.md`에 포함됩니다. 글꼴은 앱과 함께 로컬 제공됩니다.
- 아래의 3D 이미지 2장은 이전 버전 기록이며 파일은 보존했지만 현재 렌더러에서는 사용하지 않습니다. 액세서리는 현재 이모지 이미지 합성 대신 픽셀 SVG로 표시하고, 선택 버튼의 이모지만 유지합니다.

## 이전 3D 버전

두 이미지 모두 내장 이미지 생성 도구로 이 프로젝트를 위해 새로 제작했습니다. 생성된 파일을 프로젝트의 공개 에셋 폴더에 복사했습니다.

## 여섯 견종

- 파일: `frontend/public/images/puppies.png`
- 실제 크기: 1254 × 1254, RGBA 투명 배경
- 배치: 위쪽 포메라니안 / 푸들 / 말티즈, 아래쪽 시바 / 코기 / 비글
- 프롬프트: "Transparent PNG sprite atlas for a premium cozy mobile puppy game. Six full-body sitting puppies directly facing forward, three columns and two rows, consistent scale, short feet, large dark sparkling eyes and tiny sweet smiles. Cream Pomeranian, apricot Toy Poodle, white Maltese, orange-white Shiba Inu, tan-white Corgi, brown-white floppy-ear Beagle. Soft 3D clay/plush style with fine tactile fur, rounded forms, diffused studio lighting. No accessories, text, labels or scenery. Genuine transparent alpha."
- `PuppySprite`에서 생성 결과의 실제 좌표를 기준으로 잘라 표시합니다. 털색 필터와 눈동자 레이어는 미리보기와 저장 후 화면 모두 동일하게 적용합니다.

## 포근한 거실

- 파일: `frontend/public/images/cozy-room.png`
- 크기: 1536 × 1024
- 프롬프트: "Cozy 3D miniature puppy living room environment only. Peach-pink walls, sunlit arched window at left overlooking green trees and blue sky, pale warm wood floor, round rug centered toward bottom, small cream sofa at right, plants and low shelf, a couple tiny pet toys. Front-facing at puppy height looking slightly downward. Broad center floor empty to overlay a puppy. Soft rounded forms, tactile materials, warm afternoon sunlight, natural shadows, premium cozy mobile game style. No animals, people, text or UI."

액세서리는 현재 시스템 이모지 레이어로 표시됩니다. 운영 확장 시 견종·자세별 정식 이미지로 교체할 수 있도록 렌더링 컴포넌트와 게임 상태를 분리했습니다.
