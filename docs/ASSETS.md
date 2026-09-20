# 이미지 제작 기록

아래 파일 경로는 2026-09-14 중앙 보관 폴더로 이동한 현재 위치입니다. 제작 날짜·프롬프트·당시 동작에 관한 기록은 유지했습니다. 사이트 이미지는 `local-assets/site/images/`, 생성 원본과 검사 결과는 `local-assets/work/`, 데스크톱 생성 파일은 `local-assets/desktop/`에 보관하며 `local-assets/` 전체는 Git에서 제외합니다. 운영 CDN에는 파비콘·배경 2개와 별도 루비 도트 팩만 공개하며, 이전 강아지 시안은 로컬 제작 기록으로만 보관합니다.

## 현재 픽셀 버전 (2026-09-12)

- 둥근 버전: 참고 에셋의 넓고 통통한 볼, 작은 점눈과 짧은 주둥이를 반영했습니다. 큰 머리와 작은 몸·발, 부드러운 털색을 사용하며 귀와 얼굴 무늬로 견종을 구분합니다. 실루엣은 정수 격자에서 한 픽셀씩 이어져 확대해도 도트가 선명합니다.
- 웹과 Windows 0.6 실행파일은 같은 SVG 원본을 사용합니다. `node scripts/preview-puppy-sprites.cjs --strict`로 견종·색상·동작별 갤러리와 공유 눈/장식 레이어의 픽셀 일치를 확인할 수 있습니다. 생성 결과는 `local-assets/desktop/build/rounded-preview.png`에 저장됩니다.

- `frontend/src/components/pixel-dog.tsx`: 정수 좌표와 `shapeRendering="crispEdges"`를 사용하는 코드 기반 SVG 캐릭터. 시바·사모예드·푸들·코기·말티즈·비글·포메라니안, 털색·눈동자·픽셀 액세서리, 꼬리 흔들기·점프·식사·하트·낮잠을 지원합니다.
- `local-assets/site/images/pixel-garden.svg`: 직접 작성한 픽셀 정원. 랜딩과 우리 집에서 공통 사용합니다.
- 사용자가 제공한 `D:\projectT\프로젝트 이미지 모음\퍼피루비`의 PNG 4장(견종 표 2장, 시바 털색 10종, 사모예드 형태 10종)을 시각적으로 참고해 새로 그렸습니다. 원본 파일을 수정하거나 외부에 업로드하지 않았습니다.
- 참고 사이트: https://comnyang.com/ko — 캐릭터 체험 중심 정보 구성을 참고했으며, 사이트 이미지나 코드를 복제하지 않았습니다.
- 글꼴: npm `galmuri`, SIL Open Font License 1.1. 라이선스는 `node_modules/galmuri/ofl.md`에 포함됩니다. 글꼴은 앱과 함께 로컬 제공됩니다.
- 아래의 3D 이미지 2장은 이전 버전 기록이며 파일은 로컬에 보존했지만 현재 렌더러와 S3 공개 릴리스에서는 사용하지 않습니다. 액세서리는 현재 이모지 이미지 합성 대신 픽셀 SVG로 표시하고, 선택 버튼의 이모지만 유지합니다.

## 이전 3D 버전

두 이미지 모두 내장 이미지 생성 도구로 이 프로젝트를 위해 새로 제작했습니다. 현재는 로컬 제작 기록이며 2026-09-19 S3 정리에서 공개 객체를 삭제했습니다.

## 여섯 견종

- 파일: `local-assets/site/images/puppies.png`
- 실제 크기: 1254 × 1254, RGBA 투명 배경
- 배치: 위쪽 포메라니안 / 푸들 / 말티즈, 아래쪽 시바 / 코기 / 비글
- 프롬프트: "Transparent PNG sprite atlas for a premium cozy mobile puppy game. Six full-body sitting puppies directly facing forward, three columns and two rows, consistent scale, short feet, large dark sparkling eyes and tiny sweet smiles. Cream Pomeranian, apricot Toy Poodle, white Maltese, orange-white Shiba Inu, tan-white Corgi, brown-white floppy-ear Beagle. Soft 3D clay/plush style with fine tactile fur, rounded forms, diffused studio lighting. No accessories, text, labels or scenery. Genuine transparent alpha."
- 과거 `PuppySprite`에서 잘라 표시하던 자료입니다. 현재 웹·다운로드 렌더러에서는 사용하지 않으며 발행기에서도 제외합니다.

## 포근한 거실

- 파일: `local-assets/site/images/cozy-room.png`
- 크기: 1536 × 1024
- 프롬프트: "Cozy 3D miniature puppy living room environment only. Peach-pink walls, sunlit arched window at left overlooking green trees and blue sky, pale warm wood floor, round rug centered toward bottom, small cream sofa at right, plants and low shelf, a couple tiny pet toys. Front-facing at puppy height looking slightly downward. Broad center floor empty to overlay a puppy. Soft rounded forms, tactile materials, warm afternoon sunlight, natural shadows, premium cozy mobile game style. No animals, people, text or UI."

액세서리는 공통 카탈로그의 내장 픽셀 도형 또는 투명 PNG 한 장과 견종·장면·프레임별 부착 위치를 합성합니다. 강아지가 포함된 완성 이미지를 액세서리마다 다시 만들지 않으며, 웹과 Windows 앱이 같은 위치 계약을 사용합니다.
