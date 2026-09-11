# PuppyRuby API

브라우저는 `/api/game`의 Next.js 프록시만 호출합니다. 프록시가 HttpOnly 방문 쿠키를 읽고 Spring Boot의 `X-Player-Id`로 전달합니다. 클라이언트 본문의 플레이어 ID는 사용하지 않습니다.
백엔드 기본 주소는 `http://127.0.0.1:8081/api/v1`입니다. 프록시 `API_URL`로 변경할 수 있습니다.

| 메서드 | 브라우저 경로 | 본문 | 동작 |
|---|---|---|---|
| GET | /api/game | 없음 | 현재 상태, 첫 방문 초기화 |
| POST | /api/game/adopt | {} | 100 하트로 가족 1마리 분양 |
| POST | /api/game/gift | {} | 오늘의 선물 수령 |
| POST | /api/game/select | puppyId | 함께할 강아지 선택 |
| POST | /api/game/feed | puppyId | 밥 주기 |
| POST | /api/game/play | puppyId | 놀아 주기 |
| POST | /api/game/rest | puppyId | 쉬게 하기 |
| POST | /api/game/train | puppyId, value | 명령 연습: 앉아 / 손 / 기다려 |
| POST | /api/game/promote | puppyId | 100 XP를 써서 한 단계 성장 |
| POST | /api/game/rename | puppyId, value | 이름 1~12자 |
| POST | /api/game/customize | puppyId, fur, eyes, accessory | 외형 저장 |

백엔드 경로는 브라우저 경로의 `/api/game`을 `/api/v1/game`으로 바꾸면 같습니다.
성공 응답은 `{ state, message, success, newPuppyId }`입니다. `success`는 명령 성공 여부이며 훈련 실패 자체는 정상 응답입니다. 조회는 `state` 객체를 직접 반환합니다.
게임 규칙을 위반하면 HTTP 400과 `{ message }`를 반환합니다. 백엔드 연결 실패는 프록시가 503으로 반환합니다.

꾸미기 허용값:
- fur: original, cream, chocolate, rose, silver
- eyes: original, blue, green, amber
- accessory: none, ribbon, scarf, crown

잔액·경험치·등급·보상은 요청으로 직접 수정할 수 없습니다. 플레이어 행을 비관적 쓰기 잠금으로 보호해 병렬 요청 시 하트 초과 사용과 중복 보상을 방지합니다. 서버 규칙은 `GameService`, 클라이언트 타입은 `frontend/src/lib/game.ts`가 담당합니다.

운영 인증은 미구현입니다. 현재 UUID는 방문자 식별 자격으로 쓰며, API 서버는 로컬 또는 Docker 내부에서만 사용해야 합니다. 외부 공개 전에 인증된 계정 ID로 대체하고 호출 제한을 적용해야 합니다.
