# Windows 앱 업데이트 배포

Windows 앱은 사이트의 공개 `/api/desktop/update` 주소에서 최신 설치파일 정보를 확인합니다. 이 API는 로그인이나 백엔드 연결이 필요하지 않으며 응답을 캐시하지 않습니다. 설치파일은 검증된 S3/CDN의 버전별 고정 주소를 사용합니다.

새 버전을 배포할 때 프로젝트 루트에서 다음 순서로 진행합니다.

1. `desktop/version.json`의 `version`을 이전보다 높은 네 자리 숫자 버전으로 올리고 `notes`에 짧은 변경 내용을 적습니다. 예: `0.10.0.0` → `0.10.1.0`. 이전보다 낮은 버전이나 같은 버전으로 만든 다른 실행파일은 게시를 거부합니다.
2. `./desktop/build.ps1`을 실행합니다. 앱과 설치파일의 버전 및 자체 검증이 완료된 뒤 `local-assets/site/downloads/desktop-build.json`에 두 실행파일의 버전·크기·SHA-256을 기록합니다. 이 파일은 검증용이며 공개 업로드 대상이 아닙니다.
3. `./scripts/publish-site-downloads.ps1 -Action Plan`으로 네 개 공개 다운로드 파일을 확인합니다.
4. `./scripts/publish-site-downloads.ps1 -Action Publish`를 실행합니다. S3 메타데이터 검증과 CDN에서 실제로 내려받은 네 파일의 SHA-256 검증이 전부 성공해야 최신 업데이트 정보와 기본 다운로드 경로가 등록됩니다. 실패하면 이전 최신 버전을 계속 표시합니다.
5. 변경된 `frontend/src/lib/generated/desktop-update-release.json`, `frontend/src/lib/generated/public-media-release.json`, 버전 파일과 코드를 커밋하고 Vercel 프런트엔드를 재배포합니다. `NEXT_PUBLIC_DOWNLOAD_BASE_URL`을 Vercel에 따로 지정했다면 제거하여 검증된 기본 경로를 사용하거나 새 다운로드 기본 주소로 함께 변경합니다.
6. 운영 사이트의 `/api/desktop/update`에서 새 `version`, `release`, `installer`가 응답하는지 확인합니다. 이미 설치된 업데이트 지원 앱은 이 버전을 확인하면 강아지 위에 업데이트 버튼을 표시합니다.

검증: `node scripts/verify-desktop-update-route.cjs`, `./scripts/verify-desktop-update.ps1`, `./scripts/publish-site-downloads.ps1 -TestOnly`. Windows 검증은 실제 게시된 메타데이터도 .NET Framework에서 읽어 웹과 앱의 버전·날짜 형식이 맞는지 확인합니다.

업데이트 기능이 없는 과거 실행파일에는 버튼을 새로 표시할 수 없습니다. 이 기능이 포함된 설치파일로 한 번 업데이트한 뒤부터 앱에서 다음 업데이트를 받을 수 있습니다. 앱 설정과 연결 정보는 설치파일과 별도 위치에 유지됩니다.
