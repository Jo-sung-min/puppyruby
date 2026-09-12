# 토스페이 결제와 뽑기권

결제는 로그인한 회원의 서버 주문을 기준으로 처리합니다. 웹에서 가격이나 성공 상태를 바꾸어도 뽑기권이 지급되지 않습니다. 기본 설정은 결제 비활성화이며, 운영 중인 데이터에 테스트 주문을 만들지 말고 별도 테스트 DB를 사용하세요.

## 설정

`backend/.env.example`을 참고해 운영자가 발급받은 값을 **AWS Java 서버의 환경 변수**로 지정합니다. 로컬에서는 `backend/.env.local`을 사용합니다. 키를 소스 코드나 문서, 프런트엔드 환경 변수에 넣지 마세요.

| 변수 | 설명 | 기본값 |
| --- | --- | --- |
| `TOSS_CLIENT_KEY` | 같은 토스 상점의 API 개별 연동 클라이언트 키. 공개 설정 API에서 이 값만 브라우저에 전달합니다. | 비어 있음 |
| `TOSS_SECRET_KEY` | 서버 전용 시크릿 키. 응답과 오류 메시지에 포함하지 않습니다. | 비어 있음 |
| `TOSS_LIVE_ENABLED` | 실제 결제 허용. 일치하는 라이브 키도 있어야 합니다. | `false` |
| `PUBLIC_SITE_URL` | 브라우저에서 접속하는 루트 origin. HTTPS 또는 localhost/127.0.0.1/[::1]의 HTTP만 허용합니다. 경로·쿼리·사용자 정보는 허용하지 않습니다. 운영에서는 실제 Vercel 사이트의 HTTPS 주소를 사용합니다. | `http://127.0.0.1:3000` |

`test_ck_`/`test_sk_` 조합이면 `test` 모드이고, `live_ck_`/`live_sk_` 조합에 `TOSS_LIVE_ENABLED=true`를 명시하면 `live` 모드입니다. 비어 있거나 서로 다른 모드의 키이면 `disabled`이며 클라이언트 키도 반환하지 않습니다. 키 모양 검사와 실제 가맹점 권한은 다르므로 운영 전 토스 개발자센터에서 같은 상점의 키인지 확인하세요. 운영 모드를 바꾸면 이전 모드의 주문을 새 키로 승인하지 않습니다.

결제 설정과 별개로 관리자의 상점 설정에서 **판매 시작**과 개별 상품 판매를 켜야 주문을 만들 수 있습니다. 사업자 정보, 실제 약관·환불 정책, 토스 가맹 계약 및 토스페이 사용 권한을 준비한 뒤 라이브 모드를 활성화하세요. 코드가 운영자의 상점 계약이나 약관을 대신 승인하지 않습니다.

Windows 서버 시작 스크립트는 `backend/.env.local`에서 위 세 토스 설정을 읽습니다. 이 파일은 저장소에 올리지 않습니다. AWS JAR 실행 시에는 [배포 안내](DEPLOYMENT.md)의 환경 파일 또는 서버 환경 변수로 전달합니다. 서버가 읽는 토스 API 주소는 `https://api.tosspayments.com/v1/payments/`로 고정되어 있고 환경 변수로 외부 주소를 지정할 수 없습니다.

## 브라우저 연결

V2 Standard SDK의 자체창 결제는 `CARD`와 `card: { flowMode: 'DIRECT', easyPay: 'TOSSPAY' }`를 사용합니다. 결제 시작 전 토스의 전자금융거래 이용약관, 개인(신용)정보 수집·이용, 개인(신용)정보 제3자 제공에 각각 필수 동의를 받습니다. 상품·가격·획득 확률·중복 획득 안내도 별도로 확인한 뒤 서버로 `termsAccepted: true`를 전달합니다. 서버는 동의 버전과 시간을 주문에 기록합니다. 별도의 운영 환불 정책 본문은 운영자가 마련해야 합니다. `customerKey`는 주문마다 생성한 임의 UUID이며 이메일·회원 ID를 사용하지 않습니다.

인증 성공 페이지에서 받은 `orderId`, `paymentKey`, `amount`로 승인 API를 호출합니다. 실패·사용자 취소 페이지에서는 승인 API를 호출하지 않습니다. 서버에서 `VERIFYING`을 반환하면 새 결제를 만들지 말고 구매 내역의 다시 확인을 사용하세요.

## 서버 API

접두사는 `/api/v1/payments`입니다. 회원 API는 BFF가 전달하는 `X-Session-Token`으로 실제 활성 계정을 확인합니다. 게스트 ID만으로 주문을 만들거나 조회할 수 없습니다.

| 메서드 / 경로 | 요청 / 응답 |
| --- | --- |
| `GET /config` | 공개. `{ enabled, mode: 'disabled'\|'test'\|'live', clientKey, message }` |
| `POST /orders` | `{ productId, requestId: UUID, catalogRevision, termsAccepted: true }` → `{ orderId, orderName, amount, quantity, kind, customerKey, createdAt, status }` |
| `GET /orders` | 본인의 최신 50건. `{ orders: Order[] }` |
| `POST /confirm` | `{ orderId, paymentKey, amount }` → `{ order: Order, message }` |
| `POST /orders/{orderId}/reconcile` | 본인 주문 재조회. `{ order: Order, message }` |
| `POST /webhook` | 인증 헤더 없이 수신하는 토스 결제 상태 힌트. JSON 32KiB 이하. |

`Order`는 `{ orderId, orderName, amount, quantity, kind, status, createdAt, paidAt, refundedAmount, ticketsGranted, receiptUrl }`입니다. 시간은 Unix 밀리초이고, `paidAt`/`receiptUrl`은 `null`일 수 있습니다. `ticketsGranted`는 최초 지급 완료 여부인 **boolean**이며 환불 뒤에도 `true`일 수 있습니다. 잔액은 상점 지갑 API로 확인합니다. 결제 키·시크릿 키·승인 멱등키·이메일은 구매 내역에 포함하지 않습니다. 영수증은 토스 도메인의 HTTPS 링크만 노출합니다.

상태는 `CREATED`, `CONFIRMING`, `VERIFYING`, `DONE`, `PARTIAL_CANCELED`, `CANCELED`, `ABORTED`, `EXPIRED`입니다. 아직 완료되지 않은 상태에서는 뽑기권을 지급하지 않습니다. 판매 중지·결제 미설정은 503, 바뀐 상품 버전·이미 처리 중인 요청은 409입니다. 주문 생성 요청 UUID를 재사용하면 동일 주문을 반환하지만 상품이나 버전을 바꾸어 재사용할 수 없습니다. 상품명·가격·수량은 서버 카탈로그에서 주문 생성 시 고정합니다.

## 중복 승인과 장애 복구

1. 짧은 DB 트랜잭션으로 주문을 잠그고 결제 키, 승인 의도, 임의 UUID 멱등키, 처리 임대를 저장합니다. 결제 키는 주문 전체에서 유일합니다.
2. DB 트랜잭션 밖에서 토스 결제를 조회합니다. 인증된 `IN_PROGRESS`일 때만 저장된 금액으로 승인을 요청하며 `Basic base64(secret + ':')`와 저장된 `Idempotency-Key`를 사용합니다. 리다이렉트를 따라가지 않고 응답 크기와 대기 시간을 제한합니다.
3. 승인 응답의 주문 번호·결제 키·총액·KRW·토스페이 결제수단을 검증합니다. 승인 전 nullable인 결제수단 필드는 제공된 범위에서 검사하고, 승인된 결제에서는 필수로 검사합니다.
4. 별도 DB 트랜잭션에서 주문 잠금, 뽑기권 원장 지급/회수, 주문 완료 저장을 함께 수행합니다. 둘 중 하나가 실패하면 모두 롤백합니다.

승인 통신이 끊기면 토스 조회를 한 번 더 시도합니다. 계속 확인되지 않거나 저장이 실패하면 결제 키와 동일 멱등키를 보존합니다. 서버 재시작 뒤에도 구매 내역 재확인이나 웹훅으로 조회하여 복구할 수 있습니다. 오래된 처리 임대는 60초 뒤 회수하며, 이전 처리 결과는 새 처리의 토큰과 일치할 때만 반영합니다. 멱등키 보존 기한인 15일이 지난 주문에는 새 승인 요청을 하지 않고 조회만 수행합니다. 키를 지우거나 바꾸어 승인 재시도를 강제하지 마세요. 예외적으로 토스 조회가 다른 주문의 결제임을 확인했고 승인 요청을 한 번도 보내지 않은 경우에는 잘못 점유한 키와 사용하지 않은 승인 의도를 버립니다. 승인 통신을 시도한 기록이 있으면 이 경우에도 기존 복구 정보를 유지합니다.

## 웹훅과 환불

토스 개발자센터에 서비스의 `/api/payments/webhook` BFF 주소를 등록하고 `PAYMENT_STATUS_CHANGED` 이벤트를 설정합니다. 백엔드에 직접 연결하는 배포라면 `/api/v1/payments/webhook`을 사용합니다. 웹훅 응답은 외부에서 접근 가능해야 합니다.

일반 결제 상태 웹훅에는 서명이 없으므로 본문의 상태·금액을 신뢰하지 않습니다. 서버가 이미 알고 있는 주문과 **이미 연결된 결제 키**가 일치할 때만 저장된 키로 토스에 재조회합니다. 알 수 없는 주문은 아무 변경 없이 접수 응답을 반환합니다. 웹훅만으로 신규 키를 연결하거나 승인하지 않습니다. 전역·주문별 빈도와 본문 크기를 제한하며 토스 조회/저장 장애는 503으로 반환하여 재전송할 수 있게 합니다. 해외 결제용 `CANCEL_STATUS_CHANGED` 등 이 앱에서 사용하지 않는 이벤트는 처리하지 않습니다.

환불 요청 버튼이나 임의 환불 승인 API는 구현하지 않았습니다. 운영자가 토스에서 처리한 취소를 웹훅 또는 구매 내역 재확인으로 반영합니다. **이미 `DONE`인 주문도 재확인하면 토스에 실제 조회합니다.**

환불은 성공한 `cancels[].cancelStatus = DONE` 기록을 합산하고 잔여 금액과 대조합니다. 누적 회수 수량은 `ceil(구매 수량 × 누적 환불액 / 주문 총액)`입니다. 이전 회수와의 차이만 고유 원장 번호로 반영하므로 같은 알림을 반복해도 이중 회수하지 않습니다. 전액 취소된 미지급 결제는 처음부터 지급하지 않습니다. 일부 취소 상태로 처음 복구한 결제는 잔여 수량만 남도록 지급·회수를 같은 트랜잭션에서 처리합니다. 오래된 완료 응답으로 이미 확인한 환불을 되돌리거나 재지급하지 않습니다.

이미 뽑기에 사용한 이용권도 환불 수량에서 제외하지 않으므로 잔액이 음수가 될 수 있습니다. 하나라도 음수이면 모든 종류의 새 뽑기가 보류됩니다. 구매 내역의 환불 금액과 지갑의 이용권 잔액을 함께 확인하세요.

## 검증과 공식 문서

검증은 별도의 H2 메모리 DB와 테스트 전용 provider, loopback HTTP 서버를 사용합니다. 실제 토스 승인 API에 테스트를 보내지 않습니다. 테스트는 회원 권한·가격 변조·중복 생성/승인·동시 승인·승인 응답 유실·DB 지급 롤백 후 복구·처리 임대 만료·부분/전액 환불·음수 잔액·웹훅 불신·응답 크기/리다이렉트 차단을 포함합니다.

프로토콜과 필드의 근거는 토스 공식 [빠른 참조](https://docs.tosspayments.com/guides/v2/get-started/llms-quick-reference), [결제 연동 안내](https://docs.tosspayments.com/en/integration), [코어 API](https://docs.tosspayments.com/reference), [간편결제 응답](https://docs.tosspayments.com/guides/v2/easypay-response), [기관 코드](https://docs.tosspayments.com/codes/org-codes), [웹훅 이벤트](https://docs.tosspayments.com/reference/using-api/webhook-events)에서 확인했습니다.
