# 프로젝트 이미지·다운로드의 S3·CDN 배포

로컬 미디어는 모두 저장소 루트의 `local-assets/`에 보관합니다. 이 폴더는 Git과 Docker 컨텍스트에서 제외합니다. 사이트는 CDN을 사용하므로 Git에 이미지 파일이 없어도 빌드와 화면 표시가 가능합니다.

## 로컬 보관 위치

| 내용 | 위치 |
|---|---|
| 사이트 배경과 제작 원본 | `local-assets/site/images/` |
| 파비콘 | `local-assets/site/favicon.svg` |
| 제작용 Aseprite·ZIP과 Windows 설치파일 | `local-assets/site/downloads/` |
| 공개하지 않는 서버 JAR·체크섬 | `local-assets/backend/releases/` |
| 생성 원본·시안·검증 결과 | `local-assets/work/` |
| 데스크톱 빌드 원본·실행파일 | `local-assets/desktop/` |
| 참고 캡처 | `local-assets/references/browser-captures/` |
| Git 복구 백업 | `local-assets/git-backup/` |

이동 내역과 SHA-256은 `local-assets/migration.json`에 있습니다. 이미지 생성·Aseprite 내보내기·검증 스크립트도 새 구조를 사용합니다. 작업 자료, 캡처, Git 백업, 환경파일과 회원 DB는 공개 배포하지 않습니다.

## 배포 명령

Java 21 JDK와 기존 백엔드 Gradle 의존성이 필요합니다. 프로젝트 루트에서 실행합니다.

```powershell
# 이미지 목록·해시 확인 → 업로드 및 검증
.\scripts\publish-site-assets.ps1 -Action Plan
.\scripts\publish-site-assets.ps1 -Action Publish

# 공개 다운로드는 별도 릴리스로 배포
.\scripts\publish-site-downloads.ps1 -Action Plan
.\scripts\publish-site-downloads.ps1 -Action Publish

# 기존 릴리스 재검증 (읽기 전용)
.\scripts\publish-site-assets.ps1 -Action Verify
.\scripts\publish-site-downloads.ps1 -Action Verify
```

`Plan`은 클라우드에 요청하지 않습니다. 도구는 `backend/.env` 다음 `.env.local`에서 S3·AWS·CDN 관련 설정만 읽습니다. 인증 값은 로그나 manifest에 기록하지 않습니다. 대상은 기존 버킷 `fatell-aws-s3`의 `puppyruby` 접두 경로로 제한합니다.

## 경로와 검증

경로·내용·메타데이터의 해시로 불변 릴리스를 만듭니다.

```text
S3: puppyruby/site-assets/<release>/images/...
CDN: https://cdn.puppyruby.com/site-assets/<release>/images/...

S3: puppyruby/site-downloads/<release>/downloads/...
CDN: https://cdn.puppyruby.com/site-downloads/<release>/downloads/...
```

CloudFront origin에 `/puppyruby`가 있으므로 `CDN_ORIGIN_PATH=puppyruby`로 중복 접두 경로를 제거합니다. 새 키만 만들고 기존 객체를 덮어쓰거나 삭제하지 않습니다. 같은 키의 내용·형식·다운로드 파일명·캐시 설정이 일치할 때만 재사용합니다.

공용 이미지 발행기는 파비콘, 픽셀 정원, 거실 배경의 **3개 경로만** 허용합니다. 강아지 그림은 이 릴리스에 포함하지 않고 `RubyRoundAssetPublisher`의 고정된 루비 도트 팩에서만 발행합니다. 공통 액세서리 PNG는 `shared/accessories.json`에 경로와 해시가 등록된 파일만 루비 도트 팩에 추가됩니다. 다운로드 발행기는 `PuppyRuby.exe`, `PuppyRuby-Setup.exe`와 각각의 SHA-256 파일, 총 **4개 경로만** 허용합니다. 로컬에 남은 Aseprite·ZIP·이전 도트는 발행 대상이 아니며 서버 JAR도 제외합니다. 모든 발행 파일은 S3 체크섬과 CDN 응답 본문을 대조합니다.

`local-assets/work/site-assets/<release>/` 및 `site-downloads/<release>/`의 `manifest.json`은 계획, `verification.json`은 최종 성공 기록입니다.

## 사이트 적용

검증을 마친 공개 주소만 `frontend/src/lib/generated/public-media-release.json`에 기록합니다. 이 JSON과 이미지 목록·체크섬 JSON은 Git에 남기며 AWS 인증 정보를 포함하지 않습니다.

현재 로컬 `frontend/public/downloads`는 `local-assets/site/downloads`를 가리키는 Git 제외 junction이므로 원본을 중복 보관하지 않습니다. 이 로컬 링크는 Git/Vercel에 포함되지 않습니다. 검증된 4파일 다운로드 릴리스 주소를 등록한 뒤 운영에 배포해야 다운로드 기능이 유지됩니다.

선택적으로 Vercel 또는 `frontend/.env.local`에서 덮어쓸 수 있습니다.

```dotenv
NEXT_PUBLIC_ASSET_BASE_URL=https://cdn.puppyruby.com/site-assets/이미지-릴리스
NEXT_PUBLIC_DOWNLOAD_BASE_URL=https://cdn.puppyruby.com/site-downloads/다운로드-릴리스
```

비어 있으면 저장소에 기록된 공개 릴리스를 사용합니다. 기존 Vercel 환경변수가 있으면 그 값이 우선하므로 새 릴리스로 바꾸거나 변수를 제거하고 재배포합니다. 공개 환경변수는 빌드 시 반영됩니다.

화면의 `assetUrl`은 `/images/...`를 CDN 주소로 바꿉니다. 기존 `/images/...`, `/favicon.svg`, `/downloads/...` 링크도 Next.js의 307 리디렉션으로 연결합니다. 설치파일 바이트는 Vercel 함수를 통과하지 않습니다. 회원 사진과 관리자 SEO 이미지의 저장된 외부 주소는 유지합니다.

## Git 용량 관리

`.gitignore`는 `local-assets/`와 기존 미디어 폴더, 이미지·Aseprite·ZIP·EXE 확장자를 제외합니다. Gradle Wrapper JAR과 생성된 카탈로그 JSON은 계속 관리합니다. 미디어를 `git add -f`로 추가하지 않습니다.

이미 커밋한 파일은 제외 설정만으로 기존 커밋에서 사라지지 않습니다. `scripts/clean-unpublished-media.cjs`는 원격에 없는 마지막 커밋 한 개만 대상으로, 보존된 원본과 원격 상태를 검증하고 로컬 복구 bundle을 만든 뒤 미디어를 제거합니다. 기본은 읽기 전용 계획입니다. 실제 적용에는 검토한 HEAD·계획 해시·명시적인 코드 파일 목록이 필요합니다. 공유 커밋 수정, push, force push, 작업 파일 삭제, GC는 실행하지 않습니다.

## 확인

```powershell
node scripts/verify-asset-urls.cjs
node scripts/verify-media-redirects.cjs
cd frontend
npm run build
```

시안 제작·Aseprite 검사는 Git에 없는 `local-assets` 원본이 필요합니다. 프런트엔드 빌드와 CDN 화면 표시에는 원본 폴더가 필요하지 않습니다.

## 현재 검증된 릴리스

- 공용 이미지: `92e25b71c705bce7` — 3개, 2,331,251바이트; S3·CDN 본문 3개 일치
- 루비 도트: `f321efcdc0532562` — 30견종·5동작·공통 눈을 포함한 511개; S3·CDN 본문 511개 일치
- 공개 다운로드: `5cec1d153421114e` — Ruby-only Windows 실행파일 2개와 SHA-256 파일 2개, 30,093,480바이트; S3 메타데이터·체크섬과 CDN 본문 4개 일치
- 항상 제외: 제작용 Aseprite·ZIP, 이전 도트, 서버 JAR와 서버 체크섬

## 2026-09-19 원격 정리

삭제 계획은 실제 S3 객체를 조회한 뒤 정확한 키 목록과 SHA-256 계획 해시로 고정했고, 삭제 후 목록을 다시 조회해 대상 부재와 현행 루비 도트 511개의 일치를 확인했습니다.

- 비루비 강아지 스타일 이미지: 2,290개, 806,592,296바이트 삭제
- 레거시 강아지 미리보기: 22개, 14,254,921바이트 삭제
- 구형 제작용 ZIP·Aseprite: 184개, 753,651,540바이트 삭제
- 합계: 2,496개, 1,574,498,757바이트 삭제
- 보존: 현행 루비 도트 511개, 이전 루비 도트 팩, 파비콘·배경, Windows 실행파일, 회원/SEO 업로드
- 중간에 생성된 `0ff0931219231fb2` 다운로드 릴리스는 구형 그림이 포함된 실행파일이어서 활성화하지 않았고, 최종 릴리스 전환 뒤 정확한 4개 객체(57,163,944바이트)를 삭제해 접두 경로가 비었음을 재검증했습니다.
