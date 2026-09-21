# 아키타 염색·액세서리 시범 적용

## 아키타 외형 수정 시안 (2026-09-22)

관리자 도트 스타일 상단의 **아키타 수정본 · 깨끗한 얼굴과 네 발**에서 새 시안을 확인한다. 기존 적용본과 별도로 비교하며 운영 카탈로그·S3·Windows 설치파일은 아직 이 시안으로 교체하지 않았다.

- Aseprite에서 16동작 × 4프레임을 수정했다. 기존 v4 2차 시안의 네 발 걷기·인사 원화를 사용하고, 현재의 둥근 얼굴과 전체 무드를 유지했다.
- 뜬 눈 자리에 남아 있던 밝은 패치를 주변 털색으로 복원했다. 감은 눈도 `Eyes.Closed`로 추출해 `Body.Eyeless`에 눈이 남지 않도록 했다.
- 옆모습은 네 발이 구분되는 접지 프레임, 반가워요는 앞발 두 개와 뒷발 두 개를 사용한다.
- 외곽은 불투명한 검정 픽셀로 통일했다. 털 염색용 `CoatMap`도 수정된 몸통에 맞춰 다시 만들었다.
- 관리자에서 30가지 눈, 5가지 털색, 눈 숨기기, 프레임별 정지, 밝은색·어두운색·체크무늬 배경으로 검수할 수 있다. 이 시안의 액세서리 위치는 기존 좌표를 그대로 적용하지 않고 외형 확정 후 재검수한다.

산출물은 `local-assets/work/akita-coat-revision-2/`에 있다. 편집 원본은 `akita-clean-body-r2.aseprite`, 동작별 몸통은 `동작.png`, 감은 눈 레이어는 `동작-closed.png`, 기본 눈 합성본은 `동작-preview.png` 및 `동작.gif`다. `silver-review.png`, `eyeless-review.png`, `light-review.png`로 주요 수정 부위를 비교한다. PNG 바이너리는 Git에서 제외하며 해시 파일만 개발용 미디어 경로에 등록한다.

재현할 때 프로젝트 루트에서 Aseprite `-b` 실행으로 `scripts/aseprite/akita-coat-revision.lua`를 실행한다. 매개변수는 `input=local-assets/work/ruby-round-v4/akita-trial/revision-2/final/akita-v4.aseprite`, `metadata=local-assets/work/ruby-round-v4/akita-trial/revision-2/final/manifest.json`, `output=local-assets/work/akita-coat-revision-2`다. 완료 후 `node scripts/register-akita-art-revision.cjs`, `node scripts/verify-akita-art-revision.cjs`를 순서대로 실행한다. 생성 경로의 수동 편집본은 다시 실행하기 전에 보관한다.

자동 검증: 64프레임 크기·해시, 알파 0/255, 검정 외곽 30,216픽셀, 뜬 눈·감은 눈의 몸통 잔여 잉크, 염색 시 고정색 보존, 기존 원본 해시 불변. 네 발 실루엣은 별도로 밝은 배경에서 육안 검수했다.

## 적용 범위

스타일 확정 전 비용을 줄이기 위해 **아키타 한 종만** 적용한다. 현재 서비스에서 쓰는 Ruby Round v3의 16동작 × 4프레임을 그대로 사용한다. v4 시안을 선택하거나 새 강아지를 생성하지 않았다. 다른 29견종은 기존 렌더링을 유지한다.

기존 PNG 애니메이션 위에 털 역할 마스크, 팔레트, 분리된 눈, 공통 액세서리를 합성한다. 색마다 전체 강아지를 다시 그리지 않는다. Aseprite는 원본과 소재 레이어 편집에 사용하고 웹·Windows는 내보낸 PNG와 메타데이터를 사용한다.

## 사용하기

1. 로컬 관리자 → 도트 스타일 → **아키타 · 염색과 액세서리 작업실**을 펼친다.
2. 원래색·크림·초코·분홍·실버, 16동작, 눈, 부착 위치를 비교한다.
3. 재생을 멈추고 프레임을 선택한다. 위치를 끌거나 가로·세로·크기·회전을 수정한다.
4. **아키타 위치 저장**을 누른다. 로그인한 관리자만 저장할 수 있다. 새로고침하면 웹과 새 연결 응답에서 변경된 좌표를 사용한다.
5. 실제 강아지는 옷장에서 아키타의 털색을 저장하면 적용된다. 작업실 색 선택은 사용자 강아지 설정을 바꾸지 않는다.

안경은 강아지가 포함되지 않은 공통 투명 도트 PNG 한 장을 사용한다. 왕관·목도리·날개는 기존 그리기를 유지하면서 아키타의 명시적인 좌표를 사용한다. 자세 분류는 미래 방향별 이미지 선택을 위한 기록이며 현재는 이미지 자체를 바꾸지 않는다. 회전·반전·표시 여부는 즉시 반영된다. 작업실은 위치 검수 도구이며 모든 액세서리·동작의 미술 검수 완료를 뜻하지 않는다.

## 파일과 데이터

| 역할 | 위치 |
| --- | --- |
| 기존 원본, 변경하지 않음 | `local-assets/work/ruby-round-v3/processed/akita/akita-16-actions.aseprite` |
| 분리한 편집 원본 | `local-assets/work/akita-coat-pilot/akita-materials.aseprite` |
| 마스크·영역 검수 이미지 | `local-assets/work/akita-coat-pilot/*-mask*.png` |
| 5색 비교 이미지 | `local-assets/work/akita-coat-pilot/coat-review.png` |
| 해시 이름으로 등록한 자산 | `local-assets/site/akita-coat/` |
| 공통 색상 기준 | `shared/coat-palettes.json` |
| 아키타 16동작 × 4프레임 × 4슬롯 좌표 | `shared/akita-accessory-rig.json` |
| 웹에서 사용하는 메타데이터 | `frontend/src/lib/generated/akita-*.json`, `coat-palettes.json` |

바이너리는 기존 `local-assets` Git 제외 정책을 따른다. 새 PC에서 코드만 pull하면 원본과 시범 PNG까지 내려오지는 않는다. 원본은 별도로 복사하거나 검수 후 S3에 보관해야 한다. 비밀키나 이미지 데이터 자체를 메타데이터에 넣지 않는다.

## 색상과 호환성

- Aseprite 레이어: 원본 보관, 고정 요소, 주 털색, 보조 털색, 역할 마스크.
- 마스크 R: 고정 0 / 주 털 1 / 보조 털 2. G: 명암 0~255. 마스크는 불투명하게 저장해 색 채널 손상을 방지한다.
- 주·보조 털은 각각 어두운색·중간색·밝은색 3색을 정수 보간한다. 코·입·윤곽선·발바닥·손·키보드·밥그릇은 고정 영역으로 분류한다.
- 원래색은 변환을 건너뛰며 원본 픽셀과 알파를 보존한다. 분류는 기존 이미지에서 만든 시범 마스크이므로 스타일 확정 시 Aseprite에서 영역을 미술 검수한다.
- 웹과 Windows의 색 계산은 같은 기준이다. 웹은 선택된 팔레트의 합성 결과를 캐시하고 매 프레임 재염색하지 않는다.
- 원본 해시가 바뀌면 기존 마스크를 임의 적용하지 않는다. 스타일 변경 시 마스크와 좌표를 다시 검수한다.
- 기존 다섯 털색 ID와 저장 형식을 유지하므로 DB 변경이 없다. 새 팔레트를 추가하면 카탈로그를 갱신하고 웹·백엔드를 다시 빌드한다. 백엔드가 허용 ID를 검증한다.
- Windows 외형 계약 v4에서 마스크 정보를 받는다. v3 이하에는 마스크를 제거한 호환 응답을 제공한다. 구버전 앱에는 새 염색이 보이지 않을 수 있다.

## 제작과 검증 명령

프로젝트 루트 `D:\projectT\puppyruby`에서 PowerShell로 실행한다. 아래 Aseprite 작업은 시범 출력 파일을 다시 생성하므로 수동 편집본은 먼저 다른 이름으로 보관한다. 기존 30견종 원본은 덮어쓰지 않는다.

```powershell
$aseprite = 'C:\Program Files\Aseprite\Aseprite.exe'
$result = Start-Process -FilePath $aseprite -WindowStyle Hidden -Wait -PassThru -ArgumentList @(
  '-b',
  '--script-param', 'input=local-assets/work/ruby-round-v3/processed/akita/akita-16-actions.aseprite',
  '--script-param', 'output=local-assets/work/akita-coat-pilot',
  '--script', 'scripts/aseprite/prepare-akita-coat.lua'
)
if ($result.ExitCode -ne 0) { throw 'Aseprite 내보내기 실패' }
node scripts/prepare-akita-coat.cjs
node scripts/verify-akita-coat.cjs
.\scripts\verify-desktop-appearance-cache.ps1
```

현재 exporter는 활성 원본에서 마스크를 다시 계산한다. 생성된 Aseprite를 수동 수정한 뒤 등록하려면 수정한 마스크도 같은 규격으로 내보내야 한다. 위 exporter를 다시 실행하면 수동 마스크 수정이 초기화된다. 팔레트나 좌표만 수정했다면 `node scripts/sync-akita-coat.cjs`로 웹 복사본을 갱신한다.

검증은 마스크·본문 해시, 16동작 크기, 원래색 동일성, 염색 시 알파·고정 영역 보존, 다른 29견종 미적용, 좌표 범위, 구버전 외형 계약 및 웹·Windows 768개 색상 입력의 픽셀 일치를 확인한다. 기존 Ruby 렌더러·액세서리·동작 검사, TypeScript 검사, 웹 운영 빌드 및 백엔드 GameService 테스트도 통과했다.

## Windows 설치파일

새 염색 기능을 포함한 로컬 빌드:

- `local-assets/desktop/dist/PuppyRuby.exe`
- `local-assets/desktop/dist/PuppyRuby-Setup.exe`

생성 명령은 `.\desktop\build.ps1 -SkipExport -SkipPublish`다. 이번 작업에서는 설치된 프로그램, 웹 다운로드 릴리스, 운영 S3를 교체하지 않았다. 로컬 연동 시험 시 프로그램이 해당 개발 서버에 연결되어 있어야 한다.

## 운영에 적용할 때

개발 환경은 `/api/akita-coat/{sha256}.png`로 시범 자산을 제공한다. 등록된 해시 파일만 읽으며 내용 해시도 검사한다. 운영에서는 이 로컬 파일 API를 닫고 기존 외형을 유지한다.

검수 후 `local-assets/site/akita-coat/`의 PNG를 같은 이름으로 S3에 업로드하고 CDN을 통해 공개한다. 공개 HTTPS 주소와 브라우저 CORS를 확인한 뒤 Vercel 빌드 환경에 다음 값을 설정하고 재빌드한다.

```dotenv
NEXT_PUBLIC_AKITA_COAT_BASE_URL=https://cdn.example.com/akita-coat
```

브라우저가 CDN 이미지를 fetch해 픽셀을 읽으므로 해당 웹 origin의 CORS가 필요하다. 내용 기반 파일명은 덮어쓰지 않는다. 환경변수가 없는 배포는 기존 동작을 유지한다. 운영 관리자에서 위치 저장은 아직 지원하지 않으며, 로컬에서 저장한 메타데이터를 코드와 함께 배포한다.

## 스타일 확정 후 확장

1. 아키타의 마스크·명암·프레임별 안경 위치를 확정한다.
2. 공통 원본 규격과 동작 이름을 고정한다.
3. 새 견종마다 털 마스크와 슬롯 좌표를 준비한다. 색상·액세서리 조합별 강아지 이미지는 생성하지 않는다.
4. 안경 등은 정면·측면·뒤쪽·누운 자세에 필요한 공통 그림만 추가하고 자세에 따라 선택한다.
5. 운영용 자산 업로드·검수·릴리스, 복수 슬롯 장착, 소유권·판매 흐름을 별도 단계로 구현한다.

현재 시범은 팔레트 기반 염색과 공통 부착 구조를 검증하는 범위다. 뒤쪽 액세서리 가림 마스크, 여러 방향의 액세서리 원화, 임의 레이어 편집기, 상점 상품 추가는 완료 범위에 포함하지 않는다.
