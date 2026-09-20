# 공통 액세서리 에셋 구조

강아지마다 안경이 포함된 완성 이미지를 새로 만들지 않습니다. 액세서리 원본은 한 번만 만들고, 루비 도트 30견종의 5장면과 각 프레임에 저장된 부착 위치를 사용해 웹과 Windows 앱에서 합성합니다.

## 구성

- `shared/accessories.json`: 웹·서버가 함께 사용하는 액세서리 카탈로그입니다. 이름, 무료/유료 구분, 부착 슬롯, 앞뒤 레이어, 상품 등급과 기본 확률을 한 곳에서 관리합니다.
- `frontend/src/lib/generated/ruby-round-accessory-anchors.json`: 30견종 × 5장면 × 4프레임의 `face`, `head`, `neck`, `back` 위치와 필요한 액세서리별 예외값입니다. 좌표는 각 강아지 원본 캔버스 기준입니다.
- `frontend/src/lib/ruby-round-accessories.ts`: 두 파일을 엄격히 검사하고 실제 배치값을 계산합니다.
- Windows 연결 응답의 `accessoryLayer`: 같은 이미지, 해시, 레이어와 현재 견종의 프레임별 위치만 전달합니다. 실행파일은 이를 몸 뒤 또는 눈 위에 합성합니다.

강아지 DB에는 지금처럼 액세서리 ID만 저장합니다. 액세서리 그림이나 좌표를 바꿔도 회원·강아지 테이블과 Flyway 마이그레이션은 필요하지 않습니다. 카탈로그와 에셋의 revision 또는 SHA-256이 바뀌면 Windows 합성 캐시도 새로 만들어집니다.

## 새 이미지 액세서리 추가

예를 들어 `round-glasses`를 추가할 때 순서는 다음과 같습니다.

1. 투명 PNG 한 개를 `local-assets/site/images/ruby-round-v1/accessories/round-glasses.png`에 둡니다.
2. `shared/accessories.json`에 ID, 표시 이름, `slot: "face"`, `layer: "front"`, `renderer: "image"`, revision과 asset 정보를 추가합니다.
3. asset에는 위 PNG 경로, SHA-256, 원본 크기, 강아지 부착점과 맞닿는 `pivotX`, `pivotY`를 기록합니다.
4. 공통 얼굴 슬롯으로 충분하지 않은 견종·장면·프레임만 해당 액세서리의 예외 위치값으로 보정합니다. PNG를 견종 수만큼 복제하지 않습니다.
5. 아래 검증 후 루비 도트 전용 발행기로 새 불변 S3/CDN 릴리스를 만듭니다.

수동 보정은 `shared/ruby-round-accessory-anchor-overrides.json`에 필요한 값만 적습니다. `breeds`는 모든 액세서리가 공유하는 슬롯 자체를 보정하고, `items`는 안경처럼 특정 액세서리만 특정 견종·장면·프레임에서 보정합니다. 빌드 때 기본 앵커를 다시 만들고 이 값을 마지막에 병합하므로 보정값이 사라지지 않습니다.

```json
{
  "schemaVersion": 1,
  "revision": "ruby-accessory-overrides-2",
  "breeds": {},
  "items": {
    "round-glasses": {
      "breeds": {
        "pomeranian": {
          "scenes": {
            "idle": [
              { "x": 148, "y": 161, "width": 104, "height": 48, "rotation": 0 }
            ]
          }
        }
      }
    }
  }
}
```

배열 위치가 애니메이션 프레임 번호입니다. `null`이나 생략한 견종·장면·프레임·값은 공통 슬롯과 기본 변환값을 유지합니다. 최종 위치는 웹과 Windows가 공통으로 허용하는 좌표·크기·회전 범위를 통과해야 하며, 각 프레임 경계에서 잘립니다.

```powershell
node scripts/prepare-ruby-accessory-anchors.cjs
node scripts/verify-ruby-accessory-layers.cjs
.\scripts\publish-ruby-round-assets.ps1 -TestOnly
.\scripts\publish-ruby-round-assets.ps1 -Action Plan
.\scripts\publish-ruby-round-assets.ps1 -Action Publish
```

발행기는 폴더를 훑어 파일을 자동 포함하지 않습니다. 카탈로그에서 검증한 `/images/ruby-round-v1/accessories/<id>.png`만 기존 루비 도트 파일 목록에 추가하며 12MB 이하 파일 크기, 원본 크기, 알파 채널과 SHA-256을 확인합니다.

운영용 프런트 빌드는 활성 `ruby-round-media-release.json`에 현재 이미지 액세서리의 카탈로그 revision·경로·해시·크기가 모두 기록되어 있는지도 검사합니다. 따라서 새 PNG를 검증·발행하기 전에는 Vercel용 production build가 통과하지 않습니다. `NEXT_PUBLIC_RUBY_ROUND_BASE_URL`을 따로 지정했다면 검증된 활성 릴리스 주소와도 일치해야 합니다. 이미지가 없는 내장 액세서리만 있을 때는 기존 릴리스와 호환됩니다.

새 유료 이미지 액세서리는 반드시 `weight: 0`으로 배포해야 하며 빌드와 서버 시작에서 이를 강제합니다. 배포가 끝난 뒤 관리자에서 가격·확률을 검토하고 저장해 활성화합니다. 운영 중인 확률을 코드 배포만으로 바꾸지 않기 위한 규칙입니다. 이미 저장된 액세서리 ID는 삭제하거나 다른 아이템에 재사용하지 않습니다.

운영 반영 순서는 **S3/CDN 발행·본문 검증 → 카탈로그가 든 백엔드 JAR → Vercel 프런트 → 새 Windows 설치파일 → 관리자에서 신규 유료 확률 활성화**입니다. 이미지보다 프런트를 먼저 배포하면 CDN 404가 날 수 있고, 백엔드보다 신규 무료 항목을 먼저 노출하면 저장 요청이 거절될 수 있습니다.

## 슬롯과 레이어

| 슬롯 | 용도 예시 |
|---|---|
| `face` | 안경, 고글 |
| `head` | 리본, 모자, 왕관, 꽃, 천사 고리 |
| `neck` | 목도리, 목걸이 |
| `back` | 날개, 망토 |

`behind`는 몸 이미지보다 먼저, `front`는 몸과 눈보다 나중에 그립니다. 배치값은 중심 `x`, `y`, 표시 `width`, `height`, 회전, 좌우 반전과 표시 여부를 가집니다. 옆모습이나 잠자기에서 어울리지 않는 장식은 해당 프레임의 `visible`을 끕니다.

현재 내장 액세서리는 기존 저장값과 구버전 실행파일을 위해 유지합니다. 신버전은 공통 슬롯을 우선 사용하고, 동적 이미지나 좌표가 잘못되어도 액세서리만 생략한 채 강아지 몸과 눈은 계속 표시합니다.
