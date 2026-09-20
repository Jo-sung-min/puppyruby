# Vercel 프런트엔드 · AWS Java 백엔드 배포

이 프로젝트는 **Vercel에 `frontend`를 배포하고 AWS에서 Java 21 JAR를 실행**합니다. 데이터는 영구 PostgreSQL에 저장합니다. 아래 명령과 도메인은 운영자가 실제 값으로 바꿔 실행하는 예시이며, 이 문서 작성 과정에서는 배포하지 않았습니다. Docker는 사용하지 않습니다.

| 구분 | 로컬 개발 | 운영 |
|---|---|---|
| 브라우저 사이트 | `http://127.0.0.1:3000` | `https://app.example.com` 또는 실제 `vercel.app` 도메인 |
| Java 프로세스 | `127.0.0.1:8080` | AWS 내부 HTTP `8080`, 외부 연결은 HTTPS API 도메인 |
| Next.js `API_URL` | `http://127.0.0.1:8080` | `https://api.example.com` |
| 양쪽 `PUBLIC_SITE_URL` | `http://127.0.0.1:3000` | `https://app.example.com` |

`example.com`은 예시입니다. 운영 사이트 주소에는 `:3000`이나 `/play`를 붙이지 않습니다. 브라우저·PC 앱은 사이트 주소를 사용하고, Vercel 서버가 `/api/*` 요청을 Java의 `/api/v1/*`로 전달합니다.

3000·8080은 새 실행의 기본값입니다. 다른 프로그램이 해당 포트를 사용 중이면 그 프로그램과 기존 미리보기를 유지하고 로컬 포트만 별도로 지정합니다. 이 변경으로 이미 실행 중인 미리보기 서버가 다른 포트로 자동 이동하지는 않습니다.

## 1. Vercel 설정

Git 저장소를 연결한 프로젝트의 **Settings → Build and Deployment**에서 다음을 지정합니다.

| 항목 | 값 |
|---|---|
| Root Directory | `frontend` |
| Framework Preset | `Next.js` |
| Build Command | `npm run build` |
| Install Command | 프레임워크 기본값; 저장된 `package-lock.json` 사용 |
| Output Directory | **Override 끔**, 프레임워크 기본값 |
| Node.js Version | `24.x` |
| Include source files outside of the Root Directory in the Build Step | **켬** |

프런트 prebuild가 저장소 공용 카탈로그 `shared/accessories.json`과 루트의 생성 스크립트를 읽으므로 Root Directory 밖 소스 포함을 켭니다. Vercel이 Next.js 결과물을 처리하도록 두고 Output Directory를 `.next/standalone`, `out` 또는 `public`으로 바꾸거나 `server.js`를 직접 실행하도록 설정하지 않습니다. [Vercel 모노레포 Root Directory 안내](https://vercel.com/docs/monorepos/monorepo-faq), [Vercel 빌드 설정](https://vercel.com/docs/builds/configure-a-build), [Next.js on Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs)

Vercel의 **Environment Variables**에는 운영에 필요한 두 값만 등록합니다. 카카오 로그인을 사용할 때만 REST API 키를 추가합니다.

```dotenv
API_URL=https://api.example.com
PUBLIC_SITE_URL=https://app.example.com
# 카카오 로그인을 사용할 때만 입력
# KAKAO_REST_API_KEY=replace-with-kakao-rest-api-key
```

`API_URL`, `PUBLIC_SITE_URL`, `KAKAO_REST_API_KEY`에는 `NEXT_PUBLIC_` 접두사를 추가하지 않습니다. `API_URL`에는 Vercel에서 접속할 수 있는 AWS Elastic Beanstalk의 공개 HTTPS origin만 넣는 것을 권장합니다. Next.js 프록시가 `/api/v1`을 자동으로 붙여 브라우저의 `/api/*` 요청을 전달합니다. 기존 설정값이 `/api` 또는 `/api/v1`로 끝나도 같은 백엔드 경로로 정규화하므로 그대로 호환됩니다. 운영 값에는 `localhost`, `127.0.0.1`, AWS 사설 IP를 넣지 않습니다. Preview 배포를 사용할 경우 별도 테스트 API와 해당 미리보기 사이트 주소를 설정합니다. 인증 콜백 주소가 고정되어 있으므로 운영 `PUBLIC_SITE_URL`과 임의 미리보기 도메인을 섞지 않습니다.

사이트 이미지, 다운로드와 루비 도트팩은 Git에 포함된 검증 완료 릴리스 주소를 기본으로 사용합니다. 따라서 현재 Vercel에는 `NEXT_PUBLIC_ASSET_BASE_URL`, `NEXT_PUBLIC_DOWNLOAD_BASE_URL`, `NEXT_PUBLIC_RUBY_ROUND_BASE_URL`을 등록하지 않습니다. 새 CDN 릴리스를 임시로 시험할 때만 해당 값을 재정의합니다.

이미지 base를 `https://cdn.example.com/puppyruby/site-assets/r1`로 지정하면 `/images/pixel-garden.svg`는 그 뒤에 같은 경로를 붙인 주소에서 불러옵니다. 다운로드 base에도 `/downloads/PuppyRuby-Setup.exe`처럼 공개 경로를 붙입니다. base 자체에 `/images`나 `/downloads`를 덧붙이지 않습니다. 예전 `/images/*`, `/downloads/*`, `/favicon.svg` 요청도 설정된 CDN으로 연결됩니다. 릴리스의 필요한 파일을 먼저 업로드하고 원본 해시·CDN 응답을 검증한 다음 기본 릴리스나 환경변수를 갱신하세요.

이미지·Aseprite·ZIP·EXE의 로컬 보관 폴더는 `local-assets/`이며 Git이나 Vercel 빌드에 포함하지 않습니다. 대신 공개 경로·크기·해시를 담은 `frontend/src/lib/generated/` JSON은 Git에 유지합니다. CDN 기본값과 환경변수는 빌드에 포함되므로 변경 후 **새 빌드·재배포**가 필요합니다. 자세한 경로·다운로드 설정은 [사이트 이미지 CDN 안내](IMAGE_UPLOADS.md#사이트-기본-이미지의-cdn-주소)를 참고하세요.

새 공통 액세서리 PNG는 먼저 루비 도트 발행기로 S3와 CDN 본문을 검증해야 합니다. 성공한 발행기가 활성 릴리스 JSON에 카탈로그 revision과 이미지 목록을 기록하며, Vercel production build는 이 기록이 현재 `shared/accessories.json`과 다르면 중단합니다. 전체 순서는 [공통 액세서리 에셋 구조](ACCESSORY_ASSETS.md)의 배포 순서를 따릅니다.

## 2. AWS JAR와 데이터베이스

배포할 커밋의 저장소 루트에서 빌드합니다. Java 21이 필요하며 명령은 Windows 기준입니다. Linux에서는 `./gradlew`를 사용합니다.

```powershell
cd backend
.\gradlew.bat test bootJar
```

생성물은 `backend/build/libs/puppyruby-api-0.2.0.jar`입니다. `shared/commands.json`은 빌드 시 JAR에 포함됩니다. AWS 서버에 Java 21, 실행 전용 사용자 `puppyruby`, 작업 폴더 `/opt/puppyruby`, 환경 파일 폴더 `/etc/puppyruby`를 준비하고 검증한 JAR를 `/opt/puppyruby/puppyruby-api.jar`로 복사합니다.

RDS PostgreSQL 또는 유지되는 PostgreSQL 서버에 데이터베이스와 애플리케이션 계정을 준비합니다. Elastic Beanstalk에서는 **Configuration → Environment properties**에 아래 값을 등록합니다. EC2에서 직접 실행한다면 같은 값을 `/etc/puppyruby/backend.env`에 두고 파일 권한을 `600`으로 제한합니다.

```dotenv
PORT=8080
SERVER_ADDRESS=0.0.0.0
PUBLIC_SITE_URL=https://app.example.com
DB_URL=jdbc:postgresql://database.example.ap-northeast-2.rds.amazonaws.com:5432/puppyruby?sslmode=require
DB_USERNAME=puppyruby
DB_PASSWORD=replace-with-database-password
```

관리자, 카카오, 메일, 토스와 S3 업로드를 사용할 때만 [백엔드 환경변수 예제](../backend/.env.example)의 해당 묶음을 추가합니다. RDS 연결은 운영 보안 정책에 맞게 AWS가 제공하는 CA 인증서와 `verify-full`을 구성할 수 있습니다. [AWS PostgreSQL TLS 연결](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/PostgreSQL.Concepts.General.SSL.html)

`DB_SCHEMA`를 지정하면 Flyway 마이그레이션, JPA 쿼리와 관리 화면의 집계 쿼리가 같은 PostgreSQL 스키마를 사용합니다. 해당 스키마를 먼저 만들고 애플리케이션 계정에 `USAGE`, `CREATE` 권한을 줍니다. 퍼피루비 전용 DB라면 `DB_SCHEMA`를 비우거나 생략해 기본 스키마(일반적으로 `public`)를 사용할 수 있으며 관리 도구도 실제 기본 스키마를 확인해 같은 곳을 검사합니다.

애플리케이션 시작 시 Flyway가 DB 종류에 맞는 SQL을 적용하고, Hibernate가 엔티티와 테이블 구조를 검증합니다(`ddl-auto: validate`). 빈 스키마는 V1으로 초기화되며, 관리 중인 스키마에는 아직 적용하지 않은 버전만 실행됩니다. 이미 테이블이 있지만 Flyway 이력이 없는 DB는 자동으로 기준 버전을 등록하지 않고 시작을 중단합니다. 기존 서비스 DB를 처음 연결할 때는 백업 후 [DB 마이그레이션 안내](DATABASE_MIGRATIONS.md)의 명시적 V1 등록 절차를 먼저 따르세요.

PostgreSQL은 JAR 교체와 분리해 유지하고 백업·복원 경로를 준비합니다. 서버는 `DB_URL`이 없을 때 로컬 H2로 대체 연결하지 않습니다. Flyway가 적용한 SQL을 고치지 말고 다음 V2, V3 파일로 변경하며, 실제 DB 변경 전에는 백업을 보관합니다.

Elastic Beanstalk의 프록시는 `PORT` 환경변수에 지정한 애플리케이션 포트로 요청을 전달하므로 `PORT=8080`과 `SERVER_ADDRESS=0.0.0.0`을 함께 둡니다. 공개 HTTPS 443이 Java HTTP 8080으로 전달되게 구성하고 상태 확인 경로는 `/actuator/health`로 설정합니다. [AWS Elastic Beanstalk 프록시 안내](https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/platforms-linux-extend.proxy.html)

## 3. systemd 실행 예시

`/etc/systemd/system/puppyruby.service` 예시입니다. 파일 경로와 사용자는 앞에서 준비한 값에 맞춥니다. Spring Boot JAR는 `java -jar`로 systemd에서 실행할 수 있습니다. [Spring Boot 서비스 설치](https://docs.spring.io/spring-boot/how-to/deployment/installing.html)

```ini
[Unit]
Description=PuppyRuby Java API
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
User=puppyruby
Group=puppyruby
WorkingDirectory=/opt/puppyruby
EnvironmentFile=/etc/puppyruby/backend.env
ExecStart=/usr/bin/java -jar /opt/puppyruby/puppyruby-api.jar
Restart=on-failure
RestartSec=5
SuccessExitStatus=143
UMask=0077

[Install]
WantedBy=multi-user.target
```

준비한 AWS 서버에서 운영자가 적용하는 명령입니다.

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now puppyruby
sudo systemctl status puppyruby --no-pager
curl --fail http://127.0.0.1:8080/actuator/health
```

다음 JAR를 배포할 때는 새 SQL과 기존 코드의 호환성을 확인하고 DB 백업과 기존 JAR를 보관합니다. 서비스를 중지한 상태에서 JAR를 교체한 뒤 시작하면 필요한 마이그레이션이 실행됩니다. 스키마 변경이 이전 코드와 호환되지 않으면 JAR만 되돌려서는 복구되지 않으므로 복원 절차도 함께 준비합니다. 환경 파일만 수정한 경우에도 `sudo systemctl restart puppyruby`로 다시 읽게 합니다. Java main은 실행 작업 폴더의 `.env`와 `.env.local`을 읽으며, 위 `EnvironmentFile`로 전달한 서비스 환경변수가 로컬 파일보다 우선합니다.

SMTP 비밀번호·카카오 시크릿·토스 시크릿·AWS 자격 증명은 **Java 서버에만** 둡니다. Vercel이나 `NEXT_PUBLIC_*`에 넣지 않습니다. 외부 서비스별 설정은 [회원](ACCOUNTS.md), [결제](PAYMENTS.md), [사진 업로드](IMAGE_UPLOADS.md) 안내를 참고하세요. 환경변수와 토큰을 로그에 출력하지 않습니다.

## 4. 새 커밋과 Vercel 재배포

1. 수정한 `frontend/next.config.ts`와 관련 변경사항이 Vercel이 추적하는 브랜치의 **새 커밋**에 포함되었는지 확인하고 push합니다. 이전 실패 배포만 재실행하면 그 배포의 옛 소스가 다시 빌드될 수 있습니다.
2. 새 커밋으로 생성된 배포의 Source/Commit과 위 Root Directory·Framework·Output Directory 설정을 확인합니다.
3. 환경 변수를 등록한 환경으로 배포합니다. 설정 변경은 기존 배포에 자동 적용되지 않으므로 새 배포가 필요합니다.
4. 캐시가 의심되면 해당 최신 커밋의 **Redeploy**에서 **Use existing Build Cache**를 해제합니다. [Vercel 빌드 캐시 재설정](https://vercel.com/docs/deployments/troubleshoot-a-build#managing-build-cache)

`Running onBuildComplete` 이후 `.next/next-server.js.nft.json`의 `ENOENT`가 나오면 Next 16.3의 `output: 'standalone'`과 Vercel 처리 경로가 충돌한 [Next.js 공식 저장소 이슈 #96646](https://github.com/vercel/next.js/issues/96646)와 증상이 일치합니다. 이 이슈는 닫힌 상태이지만 해당 빌드 조합에서의 재현과 standalone 제거 우회가 기록되어 있습니다. 이 프로젝트는 Vercel에서 항상 기본 Next.js 출력을 사용합니다. 별도 자체 호스팅 용도의 `BUILD_STANDALONE=true`는 Vercel 밖에서만 적용됩니다. 무조건 적용되는 `output: 'standalone'` 설정을 넣거나 누락된 추적 파일을 빈 파일로 만들어 우회하지 않습니다.

## 5. 연결 확인

- AWS 내부와 공개 HTTPS의 `/actuator/health`가 정상인지 확인합니다.
- 실제 Vercel 사이트의 `/api/auth/me`, `/api/media/config`를 열어 서버 연결을 확인합니다. 사진 설정을 끈 경우 업로드가 비활성화되어도 정상입니다.
- 로그인·프로필 저장·산책방 입장을 확인하고, 카카오 콜백과 S3 CORS에는 실제 사이트 HTTPS origin을 등록합니다.
- 격리 검증의 3101 등 테스트 포트는 운영 기본 포트와 별개입니다. 테스트 계정·DB·메일함은 운영에 연결하지 않습니다.
