# 웹·Windows 강아지 연결

Windows 실행파일 0.4부터 `/play#home`의 **실행파일과 연결**로 웹에서 선택한 강아지와 함께 성장합니다. 회원 로그인 중에는 해당 회원의 강아지를, 가입 전에는 현재 브라우저의 체험 강아지를 연결합니다. 가입하면 기존 체험 강아지와 PC 연결을 계정으로 이어갑니다.

웹에서 로그아웃해도 이미 연결한 PC는 별도 연결을 유지합니다. 비밀번호 변경·재설정 또는 회원 정지는 PC 연결도 철회합니다. 회원 기능과 환경 설정은 [회원 안내](ACCOUNTS.md)를 참고하세요.

현재 웹과 새 Windows 앱은 루비 도트 30견종의 열여섯 동작을 함께 사용합니다.
설치 파일에 모든 동작을 포함하므로 오프라인에서도 재생합니다. 연결 응답은
기존 앱용 다섯 `scenes`를 유지하고 새 앱용 열한 `nativeActions`를 추가합니다.
각 동작의 원본 이미지·눈 위치·감은 눈 상태·액세서리 위치를 전달하며,
동작이나 눈·액세서리가 바뀌면 `renderKey`도 바뀌어 새 모습을 확인합니다.
새 앱은 모든 기기 요청에 `X-PuppyRuby-Appearance-Version: 3`을 보냅니다.
이 헤더가 없거나 이전 버전이면 기존 앱이 읽을 수 있는 다섯 완성 PNG와
기존 `key`만 전달해, 감은 눈의 빈 앵커 때문에 외형 전체가 거절되지 않도록 합니다.

## 동작

- 웹에서 5분 유효·한 번 사용 가능한 12자리 연결 코드를 발급합니다. 새 코드 발급 시 이전 코드는 무효화합니다.
- PC에서 사이트 기본 주소와 코드를 입력합니다. HTTPS 주소를 사용하며, 로컬 개발용 루프백 주소만 HTTP를 허용합니다. 리디렉션은 따라가지 않습니다.
- PC는 웹에서 선택한 강아지 하나의 이름·견종·꾸미기·등급·XP·돌봄 수치와 하트를 불러옵니다. 웹의 친구·실명·사진·대화는 포함하지 않습니다.
- PC와 웹 우리 집은 약 5초마다 최신 게임 상태를 확인합니다. 백그라운드인 웹은 돌아왔을 때 갱신합니다.
- 연결한 PC의 돌봄·훈련·승급은 기존 서버 규칙을 적용합니다. PC가 원하는 XP를 직접 올리거나 로컬 XP를 합산하는 경로는 없습니다.
- 네트워크 오류 시 마지막 외형을 표시합니다. 오프라인 상태에서 보상을 주는 동작을 쌓아 두지 않습니다. 서버에 이미 보낸 동작의 응답만 불확실한 경우 동일한 요청 ID로 결과를 확인합니다.
- 연결 전 PC 강아지의 설정과 성장은 별도로 보존합니다. 연결 해제·서버에서 기기 철회 시 단독 모드로 돌아갑니다. 웹에서 최대 5대까지 관리합니다.

## API와 인증

웹 프록시는 `/api/desktop/*`, Java 서버는 `/api/v1/desktop/*`입니다. PC에는 Vercel의 사이트 HTTPS 주소를 입력합니다. 웹 프록시가 `API_URL`로 AWS Java API에 연결하며 로컬 개발 사이트 주소는 `http://127.0.0.1:3000`입니다. [배포 안내](DEPLOYMENT.md)를 참고하세요.

| 경로 | 메서드 | 인증 | 응답/용도 |
|---|---|---|---|
| `links` | GET | 브라우저 HttpOnly 세션 또는 체험 방문 쿠키 | 현재 소유자의 기기 목록 |
| `pair-code` | POST | 브라우저 HttpOnly 세션 또는 체험 방문 쿠키 | `{code, expiresAt}` |
| `revoke` | POST | 브라우저 HttpOnly 세션 또는 체험 방문 쿠키 | `{deviceId}`로 소유 기기 철회 |
| `pair` | POST | 일회용 코드 | `{code,deviceName}` → `{token,device,state}` |
| `state` | GET | 기기 Bearer 토큰 | 현재 선택한 강아지 상태 |
| `action` | POST | 기기 Bearer 토큰 | `{action,puppyId,value?,requestId}` |

브라우저 경로는 호출자가 보낸 인증 헤더와 신원 헤더를 사용하지 않습니다. 기기 경로는 브라우저 쿠키를 사용하지 않습니다. 256비트 난수 기기 토큰은 방문자 쿠키와 다르며 서버에는 해시만 저장합니다. PC에는 토큰·게임 캐시를 Windows DPAPI CurrentUser로 암호화합니다. 기기 목록에는 토큰이나 방문자 ID를 표시하지 않습니다.

`action`은 `feed/play/rest/train/promote/ask`만 허용합니다. 선택한 강아지가 바뀌면 HTTP 409로 갱신을 요청합니다. 기기별 요청 ID와 요청 본문 지문으로 중복 보상을 방지하며 재시도는 최신 상태와 최초 처리 결과를 반환합니다. 토큰 철회는 HTTP 401입니다. 모든 프록시 응답은 `no-store`이고 다른 출처의 쓰기 요청을 거부합니다.

연결 실패 제한은 코드 접두부 해시별 10회/분이며 다른 사용자가 같은 프록시 IP를 사용하는 데 영향을 받지 않습니다. 전체 실패에 대한 1,000회/분 상한과 메모리 상한도 적용합니다. 계정 로그인과 이메일 비밀번호 재설정은 [회원 안내](ACCOUNTS.md)를 참고하세요.

## 검증

프로젝트 루트에서 실행합니다. 이미지·다운로드와 생성 파일은 Git에서 제외되는 `local-assets/`에 보관합니다. Windows 빌드는 `local-assets/desktop/dist/`, 검증 구성과 결과는 `local-assets/desktop/build/`를 사용합니다. 새 저장소 복제본에서 네이티브 검증을 실행하려면 로컬 보관 파일을 먼저 준비해야 합니다.

기존 사용자 데이터와 분리된 임시 H2 데이터베이스 및 Next.js 프로덕션 서버에서 검증합니다. 아래 스크립트는 실제 데이터를 생성하므로 기본 `3101` 테스트 주소가 임시 서버를 가리키는지 확인합니다.

```powershell
$env:PUPPY_TEST_ISOLATED='1'
$env:PUPPY_TEST_URL='http://127.0.0.1:3101'
node scripts/verify-desktop-sync.mjs
node scripts/prepare-desktop-native-test.mjs
$config = Join-Path $PWD 'local-assets/desktop/build/native-sync-scenario.json'
Start-Process local-assets/desktop/dist/PuppyRuby.exe -ArgumentList @('--sync-test', $config) -WindowStyle Hidden -Wait
Get-Content local-assets/desktop/build/native-sync-test.txt
node scripts/verify-desktop-retry.mjs
```

2026-09-12: 서버 테스트 34개, 웹 프록시 통합 검증 520항목, 실제 C# 클라이언트 연동 18단계를 통과했습니다. C# 검증에는 양방향 XP 반영, 꾸미기·이름·선택 강아지 변경, 암호화 캐시 재시작, 오프라인 보상 차단, 연결 철회가 포함됩니다. 웹 UI에서 코드 발급·기기 표시·성장 자동 반영·연결 해제·모바일 320px 표시를 확인했습니다. 별도의 응답 유실 검증에서도 서버·프록시 검사 25개와 실제 실행파일 검사 72개를 통과했습니다. 서버가 이미 보상을 저장한 뒤 503 응답이 발생하도록 하고, 같은 요청 재시도의 중복 보상 방지와 선택 강아지 변경 후 대기 요청 해소를 확인합니다.
