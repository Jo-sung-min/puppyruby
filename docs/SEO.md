# 검색 노출 관리

이메일 인증을 마친 관리자가 `/admin`의 **SEO 관리**에서 설정합니다. 입력 중에는 미리보기만 바뀌며 **SEO 변경사항 저장**을 눌러야 반영됩니다. 다른 관리자가 먼저 저장한 경우 덮어쓰지 않고 최신 설정을 불러오도록 안내합니다.

## 설정할 수 있는 내용

- 사이트 이름, 대표 HTTPS 주소, 기본 제목과 설명
- 소개(`/`), 우리 집(`/play`), 상점(`/shop`)의 개별 제목·설명·검색 노출 여부
- 공개 공유 이미지와 이미지 설명
- 구글·네이버 HTML 태그 방식의 소유 확인 코드

페이지별 제목·설명을 비우면 기본값을 사용합니다. 로그인·마이페이지·관리자·결제 화면은 항상 `noindex`이며 사이트맵에 포함되지 않습니다. 전체 검색 노출을 끄면 모든 공개 페이지도 `noindex`로 표시합니다. 기존 계정·강아지·스타일 데이터는 변경하지 않습니다.

대표 주소를 비우면 프런트 서버의 `PUBLIC_SITE_URL`을 사용합니다. 공개 HTTPS 주소가 없거나 로컬 주소이면 canonical과 사이트맵 URL을 생성하지 않습니다. 프런트의 `API_URL`은 AWS 서버의 `/api/v1`까지 포함한 주소로 설정합니다. 관리자는 이 화면에서 실제 도메인 연결이나 로그인 리다이렉트 설정을 변경하는 것이 아닙니다.

## 공유 이미지

기존 S3/CDN 환경변수를 그대로 사용합니다. `S3_UPLOAD_ENABLED`, `S3_BUCKET`, `AWS_REGION`, `CDN_BASE_URL`과 서버 전용 AWS 자격 증명을 설정합니다. [배포 가이드](DEPLOYMENT.md)를 참고하세요. 업로드 연결이 꺼져 있어도 공개 HTTPS 이미지 주소를 직접 입력할 수 있습니다.

업로드는 10MB 이하의 JPG·PNG·WebP·GIF를 받아 비율을 유지한 1200×630 JPEG로 준비합니다. 관리자에게 발급한 presigned PUT 주소에 전송하고, 서버가 체크섬·크기·이미지 형식을 확인한 뒤 CDN 주소를 돌려줍니다. 이 기능의 이미지는 사이트 외부에 공유되는 공개 이미지입니다. 저장 경로는 `S3_KEY_PREFIX/seo-shares/`이며 산책 프로필 사진과 용도를 분리합니다. 프로필 사진의 기존 1024px 제한은 유지하고 SEO 이미지는 2048px까지 검증합니다.

기존 IAM 정책이 `walk-profiles/*`에만 쓰기·읽기를 허용했다면 `seo-shares/*` 권한도 추가합니다. CDN에서도 이 경로를 읽을 수 있어야 합니다. [업로드 권한 예시](IMAGE_UPLOADS.md)를 참고하세요.

## 검색 서비스 연결

1. 구글 서치 콘솔 또는 네이버 서치어드바이저에서 HTML 태그 방식의 소유 확인을 선택합니다.
2. 제공된 태그의 `content="..."` 안에 있는 코드만 SEO 관리 화면에 입력하고 저장합니다.
3. 해당 검색 서비스에서 소유 확인을 완료합니다.
4. 운영 사이트의 `/sitemap.xml` 주소를 제출합니다.

설정은 서버에 보관되며 새 HTML 요청에 반영됩니다. 제목·설명·canonical·Open Graph·Twitter Card·소유 확인 태그는 자바스크립트 실행 없이 초기 HTML head에서 확인할 수 있습니다. `/robots.txt`와 `/sitemap.xml`도 저장값을 사용합니다. robots.txt에서 HTML 수집 자체를 막지 않아 검색 로봇이 `noindex`를 읽을 수 있습니다. [구글 robots 안내](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag), [네이버 소유 확인 안내](https://searchadvisor.naver.com/guide/faq-start-register)

검색 결과의 문구·순위·반영 시점은 검색 서비스가 정합니다. 화면의 검색 미리보기는 예시이며 실제 결과를 조회하는 기능은 아닙니다. 공유 서비스가 기존 이미지를 보관 중이면 해당 서비스의 캐시 갱신이 필요할 수 있습니다.

## API와 검증

- 공개 읽기: `GET /api/seo` → `GET /api/v1/seo`
- 관리자 읽기·저장: `GET/POST /api/admin/seo` → `GET/POST /api/v1/admin/seo`
- 관리자 공유 이미지: `/api/admin/seo-media/config`, `/presign`, `/complete`

SEO 저장은 기존 응답의 `revision`, `updatedAt`을 제외하고 `expectedRevision`을 포함한 전체 설정을 전송합니다. 지원하는 페이지 키는 `home`, `play`, `shop`뿐입니다. 요청 최대 크기는 16 KiB이고, 오래된 버전은 409, 잘못된 필드나 주소는 400입니다. 쓰기는 세션·관리자 권한·동일 출처를 검증하고 변경 이력을 기록합니다. HTML이나 스크립트 삽입 기능은 제공하지 않습니다.

프런트와 AWS 서버 JAR를 함께 업데이트해야 새 설정을 저장할 수 있습니다. 운영은 Vercel과 AWS 서버 구성을 그대로 사용합니다. 서버 연결이 일시적으로 실패하면 기본 메타정보를 사용해 페이지 표시를 유지합니다.

검증 스크립트: `scripts/verify-seo-metadata.mjs`(실제 HTML), `scripts/verify-seo-api.mjs`(분리된 서버), `scripts/verify-seo-image-upload.cjs`(이미지 처리), `scripts/verify-media-proxy.mjs`(프록시). 실제 AWS 업로드는 환경변수를 등록한 배포 환경에서 확인해야 합니다.
