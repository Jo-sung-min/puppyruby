# 이미지 제작 기록

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
