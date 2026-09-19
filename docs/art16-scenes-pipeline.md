# 픽셀아트 16 견종별 장면 제작

> **로컬 보관 전용:** 이 스타일은 운영에서 퇴역했습니다. 아래 절차는 원본 복원·비교를 위한 기록이며 S3/CDN에 발행하거나 관리자 런타임 목록에 다시 등록하지 않습니다. `-Publish`라는 기존 옵션 이름은 로컬 `local-assets/site` 복사만 뜻합니다.

등록된 견종 목록은 `frontend/src/lib/dog-breeds.ts`에서 읽습니다. 각 견종의
새 그림은 `local-assets/work/art16-scenes-v1/raw/<breed>.png`에 보관합니다. 기존 16번
시안과 이전 강아지 이미지는 덮어쓰지 않습니다.

`local-assets/`는 Git에서 제외하는 로컬 보관 폴더입니다. `-Publish`는 검증한 PNG를 `local-assets/site/images/art16-scenes-v1/`, Aseprite 원본을 `local-assets/site/downloads/art16-scenes-v1/`에 복사할 뿐입니다. 공용 이미지·다운로드 발행기는 이 경로를 명시적으로 제외합니다. 생성 JSON의 `/images/`·`/downloads/` 값은 과거 제작 기록이며 운영 URL로 활성화하지 않습니다.

원본은 가로 4칸, 세로 3칸입니다. 첫 줄은 정면 앉기, 왼쪽 옆모습, 기쁨,
잠자기 순서입니다. 나머지 두 줄은 왼쪽으로 걷는 독립적인 8개 보행 자세입니다.
걷는 그림을 복제하거나 이동시켜 가짜 보행 프레임을 만들지 않습니다.

```powershell
./scripts/import-art16-scenes.ps1 -Breed pomeranian -InputPng local-assets/work/art16-scenes-v1/raw/pomeranian.png -Background border-magenta -Publish
./scripts/import-art16-scenes-batch.ps1 -Publish
```

Aseprite는 원본 격자를 그대로 잘라 각 장면과 편집 가능한 12프레임 파일을
만듭니다. 해상도를 줄이거나 색을 양자화하지 않습니다. 원본의 칸 크기가
정확한 격자선에 걸치면 가까운 빈 배경 줄을 경계로 사용하고, 칸 크기 차이는
투명 여백으로 맞춥니다. 그림별
위치 차이는 색과 크기를 유지한 정수 이동으로 보정해 바닥 높이를 맞춥니다.

투명 원본은 `-Background transparent`를 사용합니다. 배경이 단색 마젠타로
생성된 경우 `border-magenta`는 명시한 마젠타 배경색과 같은 색의 꼬리·다리
사이 빈틈을 지웁니다. 갈색·옅은 보라색 윤곽선은 이 색상 조건에 포함하지 않습니다.
흰색 털을 지우지 않도록 흰 배경 제거는 기본으로 사용하지 않습니다.
모든 변환은 원본 사본과 해시, 칸 좌표, 이동량, 남겨진 RGBA 비교 기록을
`local-assets/work/art16-scenes-v1/processed/<breed>`에 남깁니다.

모든 견종을 완성한 다음에만 관리자용 목록을 등록하고 압축합니다.

```powershell
./scripts/prepare-art16-scenes-manifest.ps1 -Package
node scripts/verify-art16-scene-assets.cjs
```

일부 완료분만 확인할 때는 검사에 `--partial`을 붙일 수 있습니다. 전체
등록은 누락된 견종이 있으면 실패하며, 기존 완료 이미지를 다른 이미지로
자동 덮어쓰지 않습니다. 만들어지는 각 견종의 5개 PNG 중 `walk.png`만
8프레임이 가로로 나열됩니다. 재생 간격은 125ms이고 Aseprite 태그는
`idle`, `side`, `walk`, `happy`, `sleep`입니다.
