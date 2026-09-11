# PuppyRuby · 너와 나의 작은 행복

강아지를 분양받고, 돌보고, 꾸미며 위로받는 웹 서비스의 실행 가능한 개발 토대입니다.
같은 위치의 `hwaryeok`를 참고해 **Next.js 프론트엔드 / Spring Boot 백엔드**로 분리했습니다.
기존 화력의 코드·데이터·환경 비밀값은 복사하지 않았습니다. 호환 버전과 공개 Gradle Wrapper만 재사용했습니다.

## 프로젝트 구조

```text
PuppyRuby/
├─ frontend/                   Next.js 16.3.4 · React 19.2.8 · TypeScript · Tailwind 4
│  ├─ src/app/                 페이지, 레이아웃, 공통 스타일
│  │  └─ api/game/             Next.js → Spring Boot 프록시, HttpOnly 방문 쿠키
│  ├─ src/components/          우리 집·분양·옷장·도감, 강아지 렌더링
│  ├─ src/lib/                 API 타입, 견종·꾸미기 카탈로그
│  └─ public/images/           여섯 견종 스프라이트, 거실 배경
├─ backend/                    Spring Boot 4.1 · Java 21 · Gradle 8.14.3
│  ├─ src/main/java/com/puppyruby/
│  │  ├─ game/                 도메인, JPA 저장소, 게임 서비스, REST 컨트롤러
│  │  └─ config/               API 예외 응답
│  ├─ src/main/resources/      H2 / PostgreSQL 연결 설정
│  └─ src/test/                게임 규칙, 중복 요청·동시성 검증
├─ docs/                       서비스 기획, API 명세, 이미지 제작 기록
└─ docker-compose.yml          프론트·백엔드·PostgreSQL 로컬 구성
```

## 바로 실행

Node.js 24와 Java 21이 필요합니다. 각각 별도 터미널에서 실행하세요.

```powershell
# 터미널 1: 서버 (처음 실행 시 Gradle 의존성을 내려받습니다)
cd backend
.\gradlew.bat bootRun

# 터미널 2: 화면
cd frontend
npm install
npm run dev
```

- 화면: **http://127.0.0.1:3001**
- API: http://127.0.0.1:8081/api/v1/game
- 상태 확인: http://127.0.0.1:8081/actuator/health
- 기존 화력의 3000/8080 포트와 겹치지 않도록 3001/8081을 사용합니다.
- 기본 H2 파일 DB는 `backend/data/`에 저장됩니다. 서버를 껐다 켜도 데이터가 남습니다.
- `frontend/.env.example`을 `.env.local`로 복사하면 API 주소를 바꿀 수 있습니다.
- `backend/.env.example`은 환경 변수 안내용입니다. Spring Boot가 `.env`를 자동으로 읽지는 않습니다. PowerShell의 `$env:DB_URL=...` 또는 Docker Compose로 전달하세요.

## 구현된 흐름

- 루비(R 등급)와 하트 1,000개로 시작합니다.
- 분양 1회에 하트 100개. 여섯 견종은 같은 확률이며 등급은 N 60%, R 28%, SR 10%, SSR 2%입니다.
- 모든 견종에 모든 등급이 존재하며, 경험치 100을 써서 한 단계씩 SSR까지 성장합니다.
- 명령 성공률: N 45%, R 65%, SR 80%, SSR 95%. 서버의 난수로 판정합니다.
- 밥 주기·놀아 주기·쉬게 하기, 앉아·손·기다려 훈련, 이름 바꾸기.
- 털색 5종, 눈동자 4종, 액세서리 3종과 장착 해제. 미리보기 후 저장합니다.
- 새 가족 결과창, 가족 선택, 전체 견종 도감, 등급 필터, 반응형 화면.
- 오늘의 선물은 한국 시간 기준 하루 1회 하트 150개입니다.
- 모든 게임 상태는 서버 DB에 저장됩니다. 하트·훈련·등급·중복 보상 검증도 서버가 처리합니다.

## PostgreSQL과 컨테이너

```powershell
Copy-Item .env.example .env
# .env의 POSTGRES_PASSWORD를 원하는 로컬 비밀번호로 수정
docker compose up --build -d
```

이 구성은 프론트만 로컬 3001 포트에 노출합니다. API와 DB는 Docker 내부망에서만 연결됩니다.
로컬 개발 서버를 먼저 종료해야 포트가 겹치지 않습니다.
Docker 실행과 PostgreSQL 연결은 이 작업 환경에서 검증하지 않았습니다. 실제 검증은 H2 기반 서버와 Next.js에서 진행했습니다.

## 검증

```powershell
cd frontend
npm run typecheck
npm run build

cd ../backend
.\gradlew.bat test bootJar
```

자동화 테스트는 등급 분포 경계값, 잔액 검증, 동시 분양의 중복 차감 방지, 일일 선물·돌봄 재수령 방지, 모든 견종의 SSR 성장, 소유권, 꾸미기 저장, 훈련 제한을 확인합니다.

## 토대의 범위

현재는 **브라우저 방문자 기반 체험 버전**입니다. 난수 UUID를 HttpOnly·SameSite 쿠키로 보관해 자신의 서버 상태를 이어갑니다. 계정 로그인은 아니므로 쿠키 삭제나 다른 브라우저에서는 새로 시작하며, 복구·기기 간 동기화는 제공하지 않습니다.

공개 서비스에 앞서 실제 계정 인증/복구, 서버 API 인증, 호출 제한, 운영 DB 마이그레이션(Flyway), 백업을 연결해야 합니다. 기본 API는 로컬 루프백에만 바인딩합니다. Docker에서도 API를 외부에 직접 노출하지 않습니다. 현재 `ddl-auto: update`는 개발 토대용입니다.
결제·유료 재화·교환·다중 액세서리 장착·동작별 애니메이션 스프라이트는 아직 구현하지 않았습니다. 캐릭터는 원본 스프라이트에 외형 필터와 눈동자·액세서리 레이어를 합성하며, 명령 반응은 간단한 동작 효과입니다.

세부 규칙: [서비스 기획](docs/SERVICE_PLAN.md) · [API](docs/API.md) · [이미지 제작 기록](docs/ASSETS.md)
