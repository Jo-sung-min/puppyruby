# 데이터베이스 마이그레이션

퍼피루비 서버는 PostgreSQL을 사용하고 Flyway로 테이블 구조의 버전을 관리합니다. Java 서버가 시작되면 PostgreSQL용 SQL을 적용한 뒤 Hibernate가 현재 엔티티와 테이블 구조를 검증합니다. SQL 적용이나 구조 검증에 실패하면 서버 시작도 중단됩니다. [Spring Boot DB 초기화 안내](https://docs.spring.io/spring-boot/how-to/data-initialization.html)

## 일반 실행과 설정

| DB 상태 | 서버 시작 시 동작 |
|---|---|
| 대상 스키마가 비어 있음 | V1 초기 SQL을 적용하고 구조 검증 후 시작 |
| Flyway 이력이 있음 | 기존 SQL 검증 → 아직 적용하지 않은 버전 실행 → 구조 검증 |
| 기존 테이블이 있으나 Flyway 이력이 없음 | 자동 등록하지 않고 중단; 아래 기존 DB 절차 필요 |
| 이미 적용한 SQL이 변경됨 | 체크섬 검증 오류로 중단 |

기본 설정은 `backend/src/main/resources/application.yml`에 있습니다.

```yaml
spring:
  jpa:
    hibernate:
      ddl-auto: validate
  flyway:
    enabled: ${FLYWAY_ENABLED:true}
    locations: classpath:db/migration/{vendor}
    baseline-on-migrate: false
    clean-disabled: true
    validate-on-migrate: true
    validate-migration-naming: true
    fail-on-missing-locations: true
```

일반 개발·운영에서는 Flyway를 켠 상태로 사용합니다. `FLYWAY_ENABLED=false`나 `ddl-auto=update`로 검증 오류를 우회하지 않습니다. `baseline-on-migrate=false`는 잘못 지정한 기존 DB를 자동으로 마이그레이션 대상으로 등록하는 일을 막습니다. `clean`은 테이블을 지우는 명령이므로 이 프로젝트에서는 비활성화되어 있습니다. [Flyway 자동 baseline 설정](https://documentation.red-gate.com/flyway/reference/configuration/flyway-namespace/flyway-baseline-on-migrate-setting)

`DB_URL`, `DB_USERNAME`, `DB_PASSWORD`는 서버 환경변수로 전달하며 `DB_URL`은 필수입니다. 퍼피루비 전용 PostgreSQL DB라면 `DB_SCHEMA`는 비우거나 생략해도 됩니다. 이때 연결의 기본 스키마(일반적으로 `public`)를 사용합니다. PostgreSQL 데이터베이스 안에는 항상 스키마가 있으므로 별도 전용 스키마를 추가할 필요가 없다는 의미입니다. 호스팅 서비스의 프로젝트 이름과 실제 DB 이름은 다를 수 있으니 서비스가 제공한 연결 주소를 그대로 사용하세요.

한 DB를 여러 서비스가 공유하거나 특정 스키마에 격리하려면 `DB_SCHEMA`를 명시합니다. 같은 스키마가 JDBC 연결, Flyway 이력, JPA와 관리 화면의 직접 SQL에 적용됩니다. 지정한 스키마는 미리 만들고 애플리케이션 계정에 `USAGE`, `CREATE` 권한을 줍니다. 스키마 이름은 영문자 또는 밑줄로 시작하는 영문·숫자·밑줄 최대 63자이며, `Tenant_One`처럼 대소문자를 구분하는 이름은 생성 시에도 `"Tenant_One"`으로 인용합니다. 환경변수 값에는 큰따옴표 자체를 포함하지 않습니다.

관리 도구도 `DB_SCHEMA` 없이 실행할 수 있습니다. 읽기 전용 JDBC 연결에서 실제 기본 스키마를 조회·검증한 뒤 이후 관리 연결, Flyway, Hibernate 검증을 그 스키마 하나에 고정합니다. 연결 URL이나 계정의 `search_path`가 지정한 기본값을 따르며 `public`을 임의로 선택하지 않습니다. 선택 가능한 기본 스키마가 없으면 `DEFAULT_SCHEMA_UNRESOLVED`로 중단합니다. 환경변수에서 `DB_SCHEMA`를 제거했더라도 이미 실행 중인 서버의 설정은 바뀌지 않으므로, 대상 확인 후 새 설정으로 서버를 다시 시작해야 합니다.

Windows의 `backend/start-server.ps1`과 `gradlew bootRun`은 `.env`를 읽은 다음 `.env.local` 값으로 덮어씁니다. 직접 `java -jar`로 실행하면 dotenv 파일을 자동으로 읽지 않으므로 서비스 환경변수로 전달해야 합니다. 운영 구성은 [배포 안내](DEPLOYMENT.md)를 참고하세요.

공유 호스팅 DB의 연결 한도를 넘지 않도록 서버 연결 풀은 기본 최대 5개·최소 대기 1개입니다. `DB_POOL_MAX_SIZE`, `DB_POOL_MIN_IDLE`로 조절할 수 있습니다. 서버 인스턴스 전체의 연결 수에 마이그레이션·관리 명령이 사용할 여유도 남겨 두세요. 관리 도구의 `CONNECTION_LIMIT`은 이 한도를 초과했다는 뜻입니다.

## Supabase 브라우저 역할의 직접 DB 접근

퍼피루비의 회원 인증과 DB 접근은 Java 서버를 통합니다. `V2__restrict_browser_database_access.sql`은 Supabase의 `anon` 또는 `authenticated` 역할이 존재할 때, 선택된 스키마의 퍼피루비 테이블 30개에 RLS를 켜고 `PUBLIC`, `anon`, `authenticated`의 테이블 권한을 회수합니다. `afterMigrate__protect_history.sql`은 Flyway가 마이그레이션 잠금을 해제한 뒤 `flyway_schema_history`에도 같은 보호를 적용합니다. 이력 테이블을 V2 안에서 `ALTER`하면 Flyway의 별도 연결이 보유한 잠금을 기다리다 시간 초과가 발생하므로 콜백을 함께 배포해야 합니다. 콜백은 대기 마이그레이션이 없는 재시작에도 안전하게 실행됩니다. 브라우저가 Supabase Data API로 회원·세션·결제 데이터를 직접 조회하는 경로를 차단하며, 테이블 소유자인 서버 JDBC 계정의 접근은 유지합니다. 같은 스키마의 다른 서비스 테이블이나 다른 스키마는 변경하지 않습니다. 두 브라우저 역할이 모두 없는 일반 PostgreSQL에서는 두 SQL 모두 권한이나 RLS를 변경하지 않습니다.

Supabase는 노출된 스키마에서 RLS와 테이블 권한을 함께 관리하도록 안내합니다. SQL로 만든 테이블에 기존 프로젝트의 브라우저 역할 기본 권한이 붙을 수 있으므로, RLS를 켜는 것과 해당 권한을 회수하는 것을 함께 적용합니다. [Supabase RLS 안내](https://supabase.com/docs/guides/database/postgres/row-level-security)

## 이미 사용 중인 DB를 처음 등록할 때

기존 회원·강아지가 있는 DB에 V1 생성 SQL을 다시 실행하지 않습니다. 먼저 해당 DB를 백업하고 복원 가능 여부를 확인한 다음 기존 구조가 V1과 일치하는지 검사해 **이력만 V1로 등록**합니다. 기존 H2를 PostgreSQL로 바꾸는 경우 데이터 복사는 별도 작업입니다.

1. 쓰기 작업을 중단하고 PostgreSQL DB 전체 백업과 현재 애플리케이션 버전을 보관합니다.
2. 접속 대상과 계정, `DB_SCHEMA` 또는 연결의 기본 스키마를 확인합니다. 기본 스키마를 사용할 때도 그 안의 기존 테이블이 이 서비스 소유인지 확인합니다.
3. 저장소의 `backend`에서 관리 도구로 등록 상태를 확인합니다.

```powershell
cd backend
.\database.ps1 -Action Info
```

4. 접속 대상이 맞고 Flyway 이력이 없는 기존 DB라면 버전을 명시해 등록합니다. 이 명령이 기존 30개 테이블과 엔티티 구조를 먼저 검사하며, 통과할 때만 이력을 기록합니다.

```powershell
.\database.ps1 -Action Baseline -BaselineVersion 1
.\database.ps1 -Action Info
```

5. 일반 실행으로 서버를 시작해 대기 중인 다음 버전 SQL을 적용한 후 검증합니다. 상태 확인, 로그인, 기존 강아지 조회도 확인합니다.

```powershell
.\database.ps1 -Action Validate
```

관리 도구는 웹 서버나 회원 초기화 과정을 실행하지 않습니다. `.env` 다음 `.env.local`에서 DB 설정을 읽으며, 이미 설정한 프로세스 환경변수만 사용하려면 `-NoEnvFile`을 붙입니다. 자격 증명과 연결 URL을 출력하지 않고 결과 요약만 보여 줍니다.

`Baseline`은 `-BaselineVersion 1`을 생략하거나 다른 버전을 지정하면 거부합니다. 이미 Flyway 이력이 있으면 거부하며, 기존 애플리케이션 테이블 30개와 Hibernate 구조 검증을 통과해야 실행됩니다. 테이블이나 데이터 구조를 수정하거나 누락된 컬럼을 자동으로 보충하지 않습니다. 불일치가 있으면 원인을 해결한 뒤 다시 검사하고, 자동 baseline 설정을 켜서 넘어가지 않습니다. 관리 도구에는 `clean`, `repair`, 임의 `migrate` 기능이 없습니다.

자동 사전 검사는 테이블 집합과 Hibernate의 컬럼 존재·자료형 검증을 수행합니다. 문자열 길이, NULL 허용, 기본키·외래키·고유 제약·CHECK·인덱스까지 완전히 비교하는 기능은 아니므로 최초 등록 전에는 기존 DDL과 V1 SQL을 별도로 대조해야 합니다.

관리 명령은 저장소와 Java 21, Gradle 의존성 캐시가 필요합니다. 새 환경에서는 먼저 `gradlew.bat classes dbToolsClasses`로 의존성을 준비합니다. 환경변수를 직접 설정한 Linux에서는 `./gradlew database -PdbAction=Info` 또는 `-PdbAction=Validate`를 사용할 수 있고, 검토한 기존 DB의 최초 등록은 `-PdbAction=Baseline -PbaselineVersion=1`입니다. `gradlew database`를 직접 실행할 때는 dotenv 파일을 읽지 않으므로 `database.ps1`을 사용하거나 환경변수를 직접 전달합니다.

최초 등록 전의 `Validate`는 `HISTORY_NOT_REGISTERED`로 중단됩니다. 이 상태는 기존 테이블이 손상되었다는 뜻이 아니라 아직 Flyway 관리 이력이 없다는 뜻입니다. 기존 구조의 사전 검사는 명시적 `Baseline` 안에서 수행하고, 등록 후 `Validate`로 이력과 구조를 함께 확인합니다.

V1로 baseline한 뒤 V2 이상이 대기 중이면 `Info`에 대기 개수가 표시되고 `Validate`는 `MIGRATION_VALIDATION_FAILED`로 중단됩니다. 올바른 대상과 백업을 확인한 뒤 일반 서버 시작으로 대기 SQL을 적용하고 다시 검증합니다. 관리 도구가 대기 SQL을 임의로 실행하거나 검증에서 제외하지 않습니다.

기존 DB의 V1 baseline은 V1 생성 SQL을 실행하지 않으므로 해당 SQL의 체크섬을 기록하지 않습니다. 이 DB는 이후 실제로 실행한 V2부터 SQL 체크섬을 검증합니다. 새로 V1부터 생성한 DB는 V1 SQL도 검증하므로 어느 경우든 V1 파일을 변경하지 않습니다.

## 다음 버전의 SQL 추가

배포 서버가 사용하는 초기 SQL은 다음 PostgreSQL 경로에 있으며 한번 적용된 파일은 수정하지 않습니다.

- `backend/src/main/resources/db/migration/postgresql/V1__initial_schema.sql`

격리된 Flyway 테스트의 초기 fixture는 `backend/src/test/resources/db/migration/h2/V1__initial_schema.sql`에만 있으며 배포 JAR에 포함되지 않습니다.

다음 운영 변경은 PostgreSQL 경로에 새 파일로 추가합니다. 예를 들어 `V3__add_profile_index.sql`처럼 `V숫자__설명.sql` 형식을 사용하고, 같은 버전을 다른 변경에 재사용하지 않습니다. 필요 없는 데이터 삭제나 테이블 재생성 대신 기존 행을 유지하는 변경을 설계합니다.

1. 새 SQL과 대응하는 Java 코드, 데이터 변환 순서를 함께 작성합니다.
2. 빈 DB에서 V1부터 새 버전까지 모두 적용되는지 확인합니다.
3. 이전 버전의 데이터가 있는 별도 테스트 DB에서 업그레이드하고 기존 행을 확인합니다.
4. 테스트와 JAR 빌드가 통과하면 백업 후 배포합니다. 서버 시작 과정에서 새 버전이 실행됩니다.

이 프로젝트에는 Flyway Gradle 플러그인을 추가하지 않았으므로 `gradlew flywayMigrate`를 사용하지 않습니다. 일반 애플리케이션 시작이 마이그레이션 실행 경로입니다. 배포 이후 수정이 필요하면 적용된 V1/V2를 고치는 대신 V3 등 다음 SQL로 수정합니다.

## 검증과 오류 대응

Flyway는 적용한 SQL의 체크섬과 이름·버전을 이력에 보관하고 다음 시작 때 비교합니다. 체크섬 오류가 발생하면 배포된 SQL이 원본과 달라졌는지 확인하고, 이미 적용한 파일을 원본대로 복구한 뒤 필요한 변경을 새 버전으로 작성합니다. 이력을 삭제하거나 임의 `repair`로 기록을 바꾸면 실제 DB와 코드의 차이를 가릴 수 있습니다. [Flyway 검증 명령 설명](https://documentation.red-gate.com/flyway/reference/commands/validate)

| 상황 | 확인할 내용 |
|---|---|
| 기존 스키마에 이력이 없다는 오류 | 올바른 DB인지 확인 → 백업 → 명시적 V1 등록 절차 |
| SQL 체크섬·파일명 오류 | 원본 SQL·파일명 복구; 새 변경은 다음 버전으로 작성 |
| 테이블·컬럼 불일치 | 현재 엔티티와 배포 SQL, 선택한 DB와 스키마 확인 |
| SQL 적용 실패 | DB 오류와 적용 이력을 확인하고 백업·검증한 복구 절차로 대응 |
| 스키마·권한 오류 | `DB_SCHEMA` 또는 연결 기본 스키마의 존재 여부와 계정 권한 확인 |
| `DEFAULT_SCHEMA_UNRESOLVED` | 연결의 `search_path`에 사용 가능한 스키마가 있는지 확인하거나 `DB_SCHEMA` 지정 |

JAR만 이전 버전으로 교체해도 이미 변경된 DB 구조가 되돌아가지는 않습니다. 이전 코드와 호환되는 SQL을 우선 설계하고, 호환되지 않는 변경에는 별도 데이터 복원 계획이 필요합니다.

마이그레이션만 빠르게 확인하려면 다음을 실행합니다. 실제 환경파일이나 사용 중인 DB를 읽지 않고 임시 H2와 임시 SQL 복사본을 사용합니다.

```powershell
cd backend
.\gradlew.bat test --tests com.puppyruby.config.FlywayMigrationIntegrationTest --tests com.puppyruby.config.DatabaseSchemaConfigurationTest
```

새 검증은 초기 30개 테이블 생성과 구조 검증, 두 번째 시작 시 강아지 데이터 보존, 대소문자 구분 스키마, 미관리 기존 DB 거부, 적용한 SQL의 변경 거부, V2 적용 및 반복 실행 방지를 확인합니다. 서비스 테스트의 격리된 메모리 DB와 테스트용 마이그레이션은 테스트 클래스패스에만 있으며 배포 JAR에는 포함되지 않습니다. 배포 전에는 전체 `test bootJar`도 실행합니다.

관리 도구의 PostgreSQL 회귀 검증은 `scripts/verify-database-tool.ps1`에 있습니다. 운영과 분리된 로컬 PostgreSQL(`127.0.0.1:15439`, DB `postgres`, 사용자 `flyway_check`)을 먼저 준비하고 `PUPPY_TEST_ISOLATED=1`로 실행합니다. 도구는 접속 대상을 확인하고 새 `dbtool_check` 스키마에서만 등록·거부 동작을 검사한 뒤 정리합니다. 기본 `public`의 읽기 전용 조회, 스키마 미지정 상태에서 JDBC 기본 스키마 사용, 잘못된 기본 스키마 거부도 확인합니다. 이미 같은 스키마가 있으면 덮어쓰지 않고 중단하며 운영 환경파일은 읽지 않습니다.

V2의 접근 권한과 잠금 회귀 검증은 같은 격리된 로컬 PostgreSQL에서 `scripts/verify-database-access.ps1`로 실행합니다. 먼저 임시 스키마와 역할을 하나의 트랜잭션에 만들고 V1·V2·콜백 원본 SQL을 적용한 뒤, 31개 테이블의 RLS·권한 회수, 두 브라우저 역할의 조회·추가·수정·삭제 248건 거부, 일반 테이블 소유자 접근, 무관한 테이블의 기존 권한 유지를 확인하고 전체 트랜잭션을 롤백합니다. 이어 Java 21과 백엔드의 실제 Flyway 라이브러리로 별도의 임시 스키마에서 신규 V1+V2 적용, 기존 V1에서 V2 업그레이드, 콜백 자동 발견, 재실행 시 버전 SQL 0건 적용 및 동일 접근 차단을 확인합니다. 실제 Flyway 단계는 별도 연결의 잠금 동작을 검사하므로 단일 연결 SQL 검사로 대체하지 않습니다. 임시 스키마와 이번 실행에서 만든 역할은 끝에 정리합니다. 기본값은 Gradle에서 런타임 의존성을 얻으며 `-Gradle`, `-Java`, `-RuntimeClasspathFile`로 설치 경로 또는 미리 출력한 클래스패스를 지정할 수 있습니다. 두 검증 스크립트는 호스팅 DB 환경파일을 읽지 않으며 접속 주소·DB·계정이 고정된 로컬 테스트 대상과 다르면 실행을 거부합니다.
