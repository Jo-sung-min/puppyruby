# S3 사진 업로드와 CDN 연결

## 사이트 기본 이미지의 CDN 주소

공용 CDN 릴리스에는 픽셀 정원, 거실 배경과 사이트 아이콘 3개만 둡니다. 강아지는 별도의 검증된 `ruby-round-v1` 팩만 사용합니다. 이전 관리자 픽셀아트 원화·미리보기·ZIP·Aseprite는 2026-09-19에 S3에서 정리했으며 공용 발행기가 다시 올리지 않습니다. 다른 공용 릴리스를 시험할 때만 Vercel 환경변수 또는 로컬 `frontend/.env.local`에 공개 주소를 재정의합니다.

```dotenv
NEXT_PUBLIC_ASSET_BASE_URL=https://cdn.puppyruby.com/site-assets/릴리스-이름
NEXT_PUBLIC_DOWNLOAD_BASE_URL=https://cdn.puppyruby.com/site-downloads/릴리스-이름
```

버킷에는 해당 릴리스 접두 경로 아래에 `local-assets/site`와 같은 상대 경로로 업로드합니다. 공개 다운로드는 별도 릴리스로 관리합니다.

| 프로젝트 경로 | CDN에서 읽는 상대 경로 |
|---|---|
| `local-assets/site/images/pixel-garden.svg` | `images/pixel-garden.svg` |
| `local-assets/site/images/cozy-room.png` | `images/cozy-room.png` |
| `local-assets/site/favicon.svg` | `favicon.svg` |

`NEXT_PUBLIC_ASSET_BASE_URL`에는 HTTPS 주소를 사용하고 쿼리, 서명 토큰, 아이디·비밀번호, `images/` 또는 파일 이름을 넣지 않습니다. 로컬 테스트에만 `http://localhost:포트`, `http://127.0.0.1:포트`, `http://[::1]:포트`를 사용할 수 있습니다. 잘못된 값은 개발 서버 시작이나 빌드를 중단하며 입력한 값 자체는 오류에 표시하지 않습니다.

값을 비우면 `frontend/src/lib/generated/public-media-release.json`에 기록된 CDN 릴리스를 사용합니다. 공개 환경변수는 빌드에 포함되므로 수정 후 개발 서버를 재시작하고, 운영에서는 새로 빌드·배포합니다. 원본은 Git에서 제외된 `local-assets/site`에 보관합니다. 시안 manifest에는 논리 경로를 유지하며 표시할 때 `assetUrl`이 CDN 주소로 바꿉니다. 자세한 절차는 [사이트 미디어 배포](SITE_ASSETS.md)를 참고하세요.

공용 배경·아이콘은 `inline`으로 제공합니다. Windows 다운로드 릴리스는 `PuppyRuby.exe`, `PuppyRuby-Setup.exe`와 각각의 SHA-256 파일만 포함하고 `/downloads/`의 기존 사이트 주소를 유지합니다. 제작용 ZIP·Aseprite와 서버 JAR은 공개 다운로드가 아닙니다.

회원 사진과 관리자가 입력하거나 업로드한 SEO 공유 이미지는 저장된 외부 주소를 유지합니다. 아래의 Java 서버 `CDN_BASE_URL`은 회원 업로드용이고, 위 프런트엔드의 릴리스 주소와 별도로 관리합니다. AWS 키·비밀 키를 `NEXT_PUBLIC_*`에 넣지 않습니다.

코드와 주소 변환은 저장소 루트에서 `node scripts/verify-asset-urls.cjs`로 확인할 수 있습니다. 공용 이미지 3개와 별도 루비 도트 팩의 대상이 HTTP 200으로 응답하고 `Content-Type`과 캐시 헤더가 맞는지도 배포 전에 확인하세요.

## 회원 사진 업로드

산책 프로필에서 사진을 선택하면 브라우저가 사진을 줄이고, 서버에서 받은 짧은 유효기간의 업로드 URL로 S3에 직접 전송합니다. 업로드 완료를 서버가 확인한 뒤 CDN 주소로 미리보기를 표시합니다. **프로필 저장**을 눌러야 내 프로필에 반영됩니다. 이미지 파일 자체가 Vercel 요청 본문을 통과하지 않습니다.

새 사진 등록은 로그인한 회원에게만 열립니다. 기존에 저장한 사진은 계속 표시하며 사진을 바꾸지 않고 이름·나이만 수정할 수도 있습니다. 기본 제공 강아지는 별도 루비 도트 팩을, 사이트 풍경은 3파일 공용 릴리스를 사용합니다.

## 1. 환경변수 등록 위치

**Vercel의 Next.js 프로젝트**에는 다음을 등록합니다.

```dotenv
API_URL=https://api.example.com
PUBLIC_SITE_URL=https://www.example.com
```

`API_URL`에는 AWS Elastic Beanstalk의 공개 HTTPS origin만 입력합니다. Next.js 프록시가 회원 사진 API를 포함한 백엔드 요청에 `/api/v1`을 자동으로 붙입니다.

**AWS의 Java 백엔드 서비스**에는 다음을 등록합니다. JAR·systemd와 Vercel 설정은 [배포 안내](DEPLOYMENT.md)를 참고하세요. 로컬에서는 `backend/.env`에 공통값을 두고 필요하면 `backend/.env.local`로 덮어쓴 뒤 `backend/start-server.ps1`로 시작합니다.

```dotenv
S3_UPLOAD_ENABLED=true
S3_BUCKET=example-puppyruby-assets
AWS_REGION=ap-northeast-2
S3_KEY_PREFIX=puppyruby
CDN_BASE_URL=https://cdn.example.com
# CDN 원본이 이미 /puppyruby 폴더를 기준으로 연결된 경우에만 지정
# CDN_ORIGIN_PATH=puppyruby
```

| 변수 | 설명 |
|---|---|
| `S3_UPLOAD_ENABLED` | 설정을 마친 뒤 `true`. 기본값 `false`에서는 새 사진 업로드만 비활성화됩니다. |
| `DESKTOP_RELEASE_UPLOAD_ENABLED` | 관리자 화면에서 Windows 실행파일을 게시할 때만 `true`. 운영 고정 버킷·CDN 값이 정확할 때 활성화됩니다. |
| `S3_BUCKET` | 버킷 이름만 입력합니다. `s3://`나 폴더 경로를 붙이지 않습니다. |
| `AWS_REGION` | 버킷이 실제로 생성된 리전입니다. 서울 리전 기본값은 `ap-northeast-2`입니다. |
| `S3_KEY_PREFIX` | 업로드 파일의 접두 경로. 기본값 `puppyruby`; 산책 사진은 `walk-profiles/`, 관리자 공유 이미지는 `seo-shares/`에 저장합니다. |
| `CDN_BASE_URL` | HTTPS CDN 기본 주소. `CDN_ORIGIN_PATH`를 제거한 객체 경로가 이 주소 뒤에 붙습니다. |
| `CDN_ORIGIN_PATH` | CDN에 설정된 원본 폴더. 예: `puppyruby` 또는 `/puppyruby`. 원본이 버킷 루트이면 비워 둡니다. S3 저장 키는 바뀌지 않습니다. |
| `S3_PRESIGN_TTL_SECONDS` | 업로드 URL 유효기간(초). 기본값 `300`입니다. |
| `S3_MAX_UPLOAD_BYTES` | 변환 후 업로드 파일의 최대 크기. 기본값 1MiB, 최대 5MiB입니다. |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | 서버의 AWS 인증 정보. IAM 역할을 쓰는 경우 비워 둡니다. |
| `AWS_SESSION_TOKEN` | 임시 자격증명을 사용하는 경우 함께 지정합니다. |

AWS 인증은 [AWS SDK 기본 자격증명 체인](https://docs.aws.amazon.com/sdk-for-java/latest/developer-guide/credentials-chain.html)을 사용합니다. Elastic Beanstalk/EC2 인스턴스 프로필에 S3 권한을 부여하면 액세스 키 환경변수는 필요하지 않습니다. AWS 키를 `NEXT_PUBLIC_*`, 소스 코드, 브라우저 설정에 넣지 않습니다. 환경변수 변경 후 백엔드를 다시 시작하고 Vercel 환경변수를 바꾼 경우 프런트엔드도 다시 배포합니다.

## 2. S3 CORS

S3 버킷의 CORS 설정에 실제 사이트 출처를 허용해야 브라우저가 직접 업로드할 수 있습니다. 기존 CORS 규칙이 있다면 필요한 규칙을 합쳐 적용합니다. `AllowedOrigins`에는 경로 없이 정확한 사이트 출처를 적습니다. 운영에서 필요 없는 로컬 출처는 제거합니다. [AWS CORS 항목 설명](https://docs.aws.amazon.com/AmazonS3/latest/userguide/ManageCorsUsing.html)

```json
[
  {
    "AllowedOrigins": [
      "https://www.puppyruby.com",
      "https://puppyruby.com",
      "http://127.0.0.1:3000",
      "http://127.0.0.1:3001",
      "http://localhost:3000",
      "http://localhost:3001"
    ],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": [
      "content-type",
      "content-disposition",
      "cache-control",
      "if-none-match",
      "x-amz-*"
    ],
    "ExposeHeaders": [],
    "MaxAgeSeconds": 300
  }
]
```

프리뷰 배포에서 시험하려면 그 배포의 실제 출처도 등록합니다. CDN 도메인이 아닌 **사용자가 사이트를 여는 도메인**을 적습니다.

## 3. S3 권한과 CDN 경로

서버의 IAM 사용자 또는 역할에는 해당 업로드 경로에 대한 `s3:PutObject`, `s3:GetObject` 권한이 필요합니다. 업로드 URL 발급과 업로드 검증에 사용하며 버킷 전체 관리 권한은 필요하지 않습니다. 아래 버킷 이름과 접두 경로를 실제 값으로 바꿉니다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject"],
      "Resource": [
        "arn:aws:s3:::실제-버킷-이름/puppyruby/walk-profiles/*",
        "arn:aws:s3:::실제-버킷-이름/puppyruby/seo-shares/*",
        "arn:aws:s3:::실제-버킷-이름/puppyruby/site-downloads/*"
      ]
    }
  ]
}
```

버킷은 비공개로 유지하고 CloudFront를 사용한다면 해당 배포의 OAC로 읽기를 허용합니다. 업로드에 공개 ACL을 사용하지 않습니다. 이미 연결한 CDN이 새 객체 경로를 읽을 수 있는지 확인하세요. [CloudFront의 S3 원본 접근 설정](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html)

예를 들어 객체 키가 `puppyruby/walk-profiles/…/….jpg`이고 CDN 원본이 버킷 루트이면 `CDN_ORIGIN_PATH`를 비우고 `https://CDN-주소/puppyruby/walk-profiles/…/….jpg`로 읽습니다. CDN 원본이 이미 `/puppyruby`를 가리킨다면 `CDN_ORIGIN_PATH=puppyruby`로 설정하여 `https://CDN-주소/walk-profiles/…/….jpg`로 읽습니다. `CDN_BASE_URL`에 원본 폴더를 다시 넣지 않습니다. 프런트엔드 정적 이미지 릴리스 주소도 이 경우 `https://CDN-주소/site-assets/릴리스-이름`처럼 원본 폴더를 중복하지 않습니다.

원본 폴더는 정확히 일치하는 경로 접두사와 `/`를 한 번만 제거합니다. 원본 밖의 저장 키나 경로 탈출 문법은 이미지 주소로 노출하지 않습니다. 업로드를 켰을 때 `S3_KEY_PREFIX`는 원본 폴더와 같거나 그 안의 하위 폴더여야 합니다. 업로드를 꺼도 유효한 CDN 설정과 원본 안의 기존 사진은 계속 표시합니다. 이 설정은 URL 생성만 바꾸고 DB의 기존 저장 키와 S3 객체, 프리사인드 업로드 위치를 변경하지 않습니다. 서버를 재시작하여 반영합니다.

매 업로드에 새로운 객체 키를 사용하므로 사진을 바꿀 때 기존 파일을 덮어쓰지 않습니다. 프리사인드 URL은 업로드에만 쓰며 프로필에는 만료되는 URL 대신 완료된 이미지 참조를 보관합니다. [S3 프리사인드 업로드](https://docs.aws.amazon.com/AmazonS3/latest/userguide/PresignedUrlUploadObject.html)

## 관리자 Windows 배포

관리자 화면의 **Windows 배포**에서는 빌드가 만든 `PuppyRuby.exe`와 `PuppyRuby-Setup.exe`를 함께 선택합니다. 브라우저가 두 파일의 SHA-256을 계산하고 서버가 발급한 짧은 유효기간의 주소로 S3에 직접 올립니다. Vercel과 Java API에는 파일 본문을 보내지 않습니다.

서버는 다음 조건을 모두 확인한 뒤에만 최신 버전을 공개합니다.

1. 두 파일의 이름, 크기, SHA-256과 S3 메타데이터가 일치합니다.
2. 두 파일 모두 Windows PE `VERSIONINFO`를 가지며 실제 `FileVersion`이 입력한 네 자리 버전과 각각 일치합니다.
3. 기존 공개 버전보다 낮지 않고, 같은 버전이면 같은 파일 묶음입니다.
4. 서버가 두 SHA-256 파일을 생성하고 `site-downloads/<릴리스>/downloads/`의 네 파일을 완성합니다.
5. 고정 CDN 주소 네 개에 1바이트 범위 요청을 보내 전체 크기·S3 SHA-256 메타데이터·다운로드 헤더를 확인합니다.
6. `site-downloads/latest-desktop-update.json` 포인터를 조건부로 교체하고 관리자 감사 기록을 남깁니다.

업로드 객체는 변경되지 않는 릴리스 경로에 저장됩니다. 앱의 `/api/desktop/update`와 사이트의 `/api/desktop/download`는 최신 포인터를 매번 검증하고, 포인터에 문제가 있거나 CDN이 잠시 응답하지 않으면 배포에 포함된 마지막 검증 버전을 사용합니다. 따라서 관리자 배포 이후 Vercel을 다시 빌드하지 않아도 새로 확인하는 앱과 사이트 다운로드 링크가 최신 설치파일을 찾습니다.

이 기능은 현재 운영 경계를 벗어난 버킷이나 CDN으로 실행파일이 나가는 것을 막기 위해 다음 값을 정확히 사용합니다.

```dotenv
DESKTOP_RELEASE_UPLOAD_ENABLED=true
S3_BUCKET=fatell-aws-s3
AWS_REGION=ap-northeast-2
S3_KEY_PREFIX=puppyruby
CDN_BASE_URL=https://cdn.puppyruby.com
CDN_ORIGIN_PATH=puppyruby
```

`S3_UPLOAD_ENABLED=true`는 회원 사진과 관리자 SEO 이미지 업로드도 사용할 때만 별도로 켭니다. Windows 배포 기능에는 필요하지 않습니다.

S3 CORS에는 위의 `content-disposition`, `cache-control`, `if-none-match` 헤더가 모두 필요합니다. 관리자 화면에서 S3 전송 단계가 거부되면 버킷 CORS부터 확인하세요. 실행파일은 최대 200MiB까지 받으며, 체크섬 파일은 선택하지 않아도 서버가 생성합니다.

사이트 API는 본인과 수락된 친구에게만 사진 주소를 전달합니다. 현재 CDN 주소는 공개 읽기 주소이므로 주소를 이미 전달받은 사람이 복사한 링크까지 회수하지는 않습니다. 링크 접근 자체에도 친구 인증이 필요한 운영 정책이라면 별도의 CDN 서명 URL·쿠키 또는 인증 이미지 프록시가 필요합니다.

## 4. 동작 확인

1. 로그인 후 **산책시키기 → 산책 프로필**에서 사진을 선택합니다.
2. 업로드 완료 후 사진 미리보기를 확인하고 **프로필 저장**을 누릅니다.
3. 새로고침한 뒤 사진이 유지되는지, S3의 지정 경로에 객체가 있는지 확인합니다.
4. 업로드 중 실패하면 이전 사진은 유지됩니다. URL이 만료되었다면 사진을 다시 선택해 새 URL을 받습니다.

새 업로드는 JPEG·PNG를 받으며 브라우저는 선택한 이미지를 JPEG로 줄여 전송합니다. 서버는 실제 파일 크기·내용·체크섬·가로세로(각 1,024px 이하)와 소유자를 검사합니다. 다른 회원의 참조나 임의 외부 URL은 새 프로필 사진으로 등록할 수 없습니다.

| 증상 | 확인할 설정 |
|---|---|
| 사진 등록 준비 중 안내 | 백엔드의 활성화 변수, 버킷·리전·CDN 값과 재시작 여부 |
| 사진 업로드 전 서버 연결 실패 | Vercel `API_URL`의 외부 백엔드 주소와 서버 상태 |
| S3 전송 실패 | 버킷 CORS 출처·헤더, 리전, 서버 IAM 권한, 임시 키 만료 |
| 업로드 후 검증 실패 | 서버 `GetObject` 권한, 이미지 형식·크기, 업로드 유효기간 |
| CDN 사진만 표시되지 않음 | CDN 원본 경로, OAC 읽기 권한, HTTPS 주소 |

프로필의 **사진 지우기**는 프로필 연결을 제거합니다. 교체하거나 저장하지 않은 업로드를 포함한 S3 객체의 자동 삭제는 수행하지 않습니다. 현재 프로필 참조를 고려한 보관·정리 정책은 별도로 운영해야 합니다.

## 개발 검증

프런트엔드 `npm run build`가 통과했습니다. 백엔드 전체 157개 테스트와 미디어 관련 22개 검증이 통과했습니다. 실제 AWS SDK로 만든 서명의 파일 종류·크기·체크섬 결합을 오프라인에서 검증했습니다. 브라우저 업로드 처리와 Next.js 프록시도 AWS에 연결하지 않고 검증합니다.

```powershell
node scripts/verify-image-upload.cjs
# frontend에서 npm run build를 실행한 뒤 프로젝트 루트에서 실행합니다.
$env:PUPPY_TEST_ISOLATED = '1'
node scripts/verify-media-proxy.mjs
```

프록시 검증은 자체 임시 서버와 3101 포트의 별도 Next.js 서버를 사용하고 종료합니다. 실제 사이트의 회원·프로필·S3를 사용하지 않습니다. 실제 버킷 CORS·IAM·CDN 연결 확인은 환경변수 등록 후 별도로 진행해야 합니다.
