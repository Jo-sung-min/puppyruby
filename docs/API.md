# PuppyRuby API

## 도트 스타일 API

공개 `GET /api/appearance`는 백엔드 `GET /api/v1/appearance`의 `{ defaultStyle, breedStyles, deletedStyles, revision, updatedAt }`를 반환합니다. 개인 정보는 포함하지 않으며 기본값은 `classic`, `{}`, `[]`, `0`, `null`입니다. 품종별 키가 없으면 `defaultStyle`을 상속합니다.

이메일을 인증한 관리자만 `GET/POST /api/admin/appearance`를 사용합니다. 백엔드 경로는 `/api/v1/admin/appearance`입니다. 저장 본문은 `{ "defaultStyle": "round", "breedStyles": { "beagle": "mochi" }, "deletedStyles": ["retro", "mini"], "expectedRevision": 0 }`이며 성공 응답은 갱신된 설정입니다. 전체 적용 시 `breedStyles`를 비웁니다. `deletedStyles`는 삭제한 스타일 ID 목록이며 복원은 해당 ID를 목록에서 제거합니다. 구버전 클라이언트가 필드를 생략하면 저장된 삭제 목록을 유지합니다. 알 수 없는 ID·중복·전체 16종 삭제·삭제된 기본/품종별 스타일 참조는 400입니다. 삭제한 스타일의 적용 전환은 클라이언트가 남은 유효 스타일로 정리해 같은 요청에서 저장합니다. 이전 버전의 저장은 409, 잘못된 스타일·품종·형식은 400, 인증/권한 오류는 401/403입니다. 쓰기는 동일 출처를 검증하고 저장·버전 증가·관리 이력을 한 트랜잭션에서 처리합니다.

스타일 ID: `classic`, `round`, `mochi`, `chibi`, `bean`, `plush`, `storybook`, `bold`, `retro`, `mini`, `sticker`, `soft`, `fluffy`, `pocket`, `cookie`, `badge`. 품종 키: `pomeranian`, `poodle`, `maltese`, `shiba`, `corgi`, `beagle`, `samoyed`. 응답은 캐시하지 않습니다.

## 산책방 API

산책 기능은 `/api/walk` 프록시를 통해 같은 방문자 쿠키를 사용합니다. 백엔드 경로는 `/api/v1/walk`입니다. `GET /api/walk`는 `me`, `rooms`, 현재 `room`, `friends`, 받은 `requests`, `serverTime`을 반환하고 접속 상태를 갱신합니다. 산책방의 `members`는 공개 프로필·선택한 강아지·위치를, `messages`는 최근 100개 대화를 포함합니다.

| POST 경로 | 본문 | 동작 |
|---|---|---|
| /api/walk/profile | nickname, age, realName, photo | 공개 별명·나이 및 친구 전용 이름·사진 저장 |
| /api/walk/create | title, description, theme, capacity | 산책방 생성 후 입장 |
| /api/walk/join | roomId | 정원 확인 후 입장 |
| /api/walk/leave | {} | 현재 방 퇴장 |
| /api/walk/message | text, clientId | 현재 방에 대화 전송; clientId는 재시도용 UUID |
| /api/walk/move | x, y | 현재 방에서 내 강아지 이동; 백분율 x 8~92, y 18~82 |
| /api/walk/friend-request | targetId | 공개 프로필 ID로 친구 요청 |
| /api/walk/friend-accept | targetId | 자신이 받은 친구 요청 수락 |
| /api/walk/friend-decline | targetId | 받은 요청 거절 |
| /api/walk/friend-remove | targetId | 친구 관계 해제 |

변경 응답은 `{ state, message }`입니다. theme은 meadow/sunset/night, capacity는 4/8/12입니다. 새 사진은 아래 이미지 업로드를 완료한 `media:<uploadId>` 참조로 등록합니다. 기존 사진을 수정하지 않으면 서버가 반환한 기존 CDN URL을 그대로 보낼 수 있으며 `null`은 사진 연결을 제거합니다. 현재 본인과 수락된 친구 외에는 `realName`, `photo`를 null로 반환합니다. 과거 채팅 작성자와 방장에도 같은 공개 범위를 적용합니다. 공개 프로필 ID는 비공개 방문자 쿠키 ID와 별개입니다. 기존 data URI 사진은 호환을 위해 유지하며 S3 업로드 활성화 시 새 data URI와 임의 외부 URL은 받지 않습니다.

## 이미지 업로드 API

브라우저는 Next.js `/api/media` 프록시로 접근하며 백엔드 경로는 `/api/v1/media`입니다. POST는 로그인 세션과 동일 출처 요청이 필요합니다. 응답은 캐시하지 않습니다.

| 메서드 | 브라우저 경로 | 본문 | 응답 |
|---|---|---|---|
| GET | `/api/media/config` | 없음 | `{ enabled, maxBytes, acceptedTypes }` |
| POST | `/api/media/presign` | `{ contentType, size, sha256 }` | `{ uploadId, uploadUrl, method: "PUT", headers, expiresAt }` |
| POST | `/api/media/complete` | `{ uploadId }` | `{ photo: "media:<uploadId>", url }` |

`sha256`는 실제 전송할 이미지 바이트의 SHA-256을 Base64로 인코딩한 값입니다. `size`는 그 바이트 수이며 `expiresAt`은 밀리초 Unix 시각입니다. `headers`를 그대로 사용해 `uploadUrl`로 이미지 Blob을 PUT합니다. 브라우저는 S3 요청에 앱 쿠키를 보내지 않습니다. S3 업로드가 성공한 다음 `complete`를 호출하고, 반환된 `url`은 미리보기로, `photo`는 `/api/walk/profile`의 `photo` 값으로 사용합니다. 업로드 완료 자체는 프로필을 바꾸지 않습니다.

서버는 업로드 소유자, 유효기간, 실제 이미지 내용·크기·체크섬을 확인한 후 완료 처리합니다. 본인의 완료된 요청을 재전송해도 같은 참조를 반환합니다. 비로그인 요청은 401, 잘못된 입력은 400, 요청 제한은 429, 저장소 비활성화·연결 문제는 503으로 안내합니다. 환경변수와 CORS 예시는 [이미지 연결 안내](IMAGE_UPLOADS.md)에 있습니다.

## 우리 집 API

브라우저는 `/api/game`의 Next.js 프록시만 호출합니다. 프록시가 HttpOnly 방문 쿠키를 읽고 Spring Boot의 `X-Player-Id`로 전달합니다. 클라이언트 본문의 플레이어 ID는 사용하지 않습니다.
백엔드 로컬 기본 주소는 `http://127.0.0.1:8080/api/v1`입니다. Vercel의 프록시 `API_URL`에는 `https://실제-백엔드-도메인/api/v1`을 지정합니다. [배포 안내](DEPLOYMENT.md)를 참고하세요.

| 메서드 | 브라우저 경로 | 본문 | 동작 |
|---|---|---|---|
| GET | /api/game | 없음 | 현재 상태, 첫 방문 초기화 |
| POST | /api/game/adopt | {} | 400: 뽑기권 상점 이용 안내 (기존 하트 분양 종료) |
| POST | /api/game/gift | {} | 오늘의 선물 수령 |
| POST | /api/game/select | puppyId | 함께할 강아지 선택 |
| POST | /api/game/feed | puppyId | 밥 주기 |
| POST | /api/game/play | puppyId | 놀아 주기 |
| POST | /api/game/rest | puppyId | 쉬게 하기 |
| POST | /api/game/train | puppyId, value | 등급별 명령 연습: 앉아 / 손 / 기다려 / 돌아 / 빵 |
| POST | /api/game/ask | puppyId, value | 엑셀·한글 단축키 질문, 등급 제한 적용 |
| POST | /api/game/promote | puppyId | 100 XP를 써서 한 단계 성장 |
| POST | /api/game/rename | puppyId, value | 이름 1~12자 |
| POST | /api/game/customize | puppyId, fur, eyes, accessory | 외형 저장 |

백엔드 경로는 브라우저 경로의 `/api/game`을 `/api/v1/game`으로 바꾸면 같습니다.
성공 응답은 `{ state, message, success, newPuppyId }`입니다. `success`는 명령 성공 여부이며 훈련 실패 자체는 정상 응답입니다. 조회는 `state` 객체를 직접 반환합니다.
게임 규칙을 위반하면 HTTP 400과 `{ message }`를 반환합니다. 백엔드 연결 실패는 프록시가 503으로 반환합니다.

`state.commands`는 `shared/commands.json`의 28개 명령을 반환합니다. 항목은 `id`, `kind`(training/shortcut), `app`(puppy/excel/hwp), `label`, `requiredGrade`, `keys`, `aliases`, `context`, `sourceUrl`입니다. 훈련과 질문 모두 서버가 소유권 및 등급을 검증합니다. 승급 응답은 새로 배운 명령을 안내합니다.

질문 예: `{ "puppyId": "강아지 ID", "value": "엑셀 붙여넣기 단축키 알려줘" }`. R 이상이면 `success: true`와 `Ctrl + V다 멍!`이 포함된 설명을 반환합니다. 미달 등급·앱이 모호한 질문·사전에 없는 질문은 HTTP 200, `success: false`와 안내 문구를 반환합니다. 질문으로 경험치·하트·에너지·훈련 대기 시간이 변하지 않습니다. Windows 기본 단축키를 안내하며 실제 앱의 키를 실행하지 않습니다.

꾸미기 허용값:
- fur: original, cream, chocolate, rose, silver
- eyes: original, blue, green, amber
- accessory: none, ribbon, scarf, crown

잔액·경험치·등급·보상은 요청으로 직접 수정할 수 없습니다. 플레이어 행을 비관적 쓰기 잠금으로 보호해 병렬 요청 시 하트 초과 사용과 중복 보상을 방지합니다. 서버 규칙은 `GameService`, 클라이언트 타입은 `frontend/src/lib/game.ts`가 담당합니다.

로그인한 사용자는 HttpOnly 세션 쿠키를 통해 계정에 연결되고, 비회원은 별도의 방문자 쿠키를 사용합니다. Next.js 프록시는 로컬 Java 서버 또는 설정된 AWS HTTPS API로 연결하며 브라우저가 제공한 내부 식별 헤더는 전달하지 않습니다. 회원·카카오·관리자 설정은 [회원 안내](ACCOUNTS.md)를 참고하세요.


## 뽑기 · 결제

Next 프록시 `/api/commerce`, `/api/payments`는 백엔드 `/api/v1/commerce`, `/api/v1/payments`에 연결합니다. 공개 카탈로그·결제 설정을 제외한 회원 작업은 HttpOnly 세션이 필요하며 POST는 동일 출처만 허용합니다. 웹훅만 별도 서버 알림 경로입니다.

| 메서드 | 프록시 경로 | 기능 |
|---|---|---|
| GET | /api/commerce/catalog | 상품·확률·설정 revision 공개 |
| GET | /api/commerce/me | 종류별 뽑기권·보유 장식·최근 뽑기 |
| POST | /api/commerce/draw | kind, requestId(UUID), catalogRevision: 1매 사용·서버 추첨 |
| POST | /api/commerce/equip | puppyId, kind(aura/accessory), itemId(none으로 해제) |
| GET/POST | /api/admin/commerce/catalog | 관리자 카탈로그 조회/수정; expectedRevision 충돌은409 |
| GET | /api/payments/config | 결제 활성·test/live·공개 클라이언트 키 |
| POST | /api/payments/orders | productId, requestId, catalogRevision, termsAccepted: 서버 가격 주문 |
| GET | /api/payments/orders | 내 최근50개 주문·지급·환불 상태 |
| POST | /api/payments/confirm | orderId, paymentKey, amount: 소유권·금액 검증 후 승인 |
| POST | /api/payments/orders/{id}/reconcile | 동일 주문 결제 상태 재조회 |
| POST | /api/payments/webhook | PAYMENT_STATUS_CHANGED 알림; 서버가 토스 API 재검증 |

상점 결제 설정은 [PAYMENTS.md](PAYMENTS.md)를 참고하세요. 판매를 꺼도 이미 보유한 뽑기권은 사용할 수 있습니다. 변경된 확률 revision으로는 뽑기권을 차감하지 않고409를 반환하며, 같은 요청 번호의 성공한 뽑기는 기존 보상과 현재 잔액을 돌려줍니다.
