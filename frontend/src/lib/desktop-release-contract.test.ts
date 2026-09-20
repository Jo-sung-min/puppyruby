import assert from "node:assert/strict";
import test from "node:test";
import {
  desktopReleaseCompleteTimeoutMs,
  desktopReleaseDraftProblem,
  isDesktopReleaseNotes,
  isDesktopVersion,
  nextDesktopVersion,
  readDesktopReleaseMetadata,
  readDesktopReleasePreparation,
  type DesktopReleaseFileMetadata,
} from "./desktop-release-contract.ts";

assert.equal(desktopReleaseCompleteTimeoutMs, 180_000);

const checksum = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
const metadata: DesktopReleaseFileMetadata[] = [
  { name: "PuppyRuby.exe", size: 1024, sha256: checksum },
  { name: "PuppyRuby-Setup.exe", size: 2048, sha256: checksum },
];
const headers = {
  "content-type": "application/vnd.microsoft.portable-executable",
  "content-disposition": "attachment; filename=\"PuppyRuby.exe\"",
  "cache-control": "public, max-age=31536000, immutable",
  "if-none-match": "*",
  "x-amz-checksum-sha256": checksum,
  "x-amz-meta-sha256": "0".repeat(64),
};
const release = "0123456789abcdef";
const signedHeaders = "cache-control;content-disposition;content-length;content-type;host;if-none-match;x-amz-checksum-sha256;x-amz-meta-sha256";
function signedUrl(name: string, expiresAt: number, overrides: Record<string, string | null> = {}) {
  const signedAt = new Date(expiresAt - 300_000);
  const date = signedAt.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const query: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `ASIAOFFLINETESTKEY12/${date.slice(0, 8)}/ap-northeast-2/s3/aws4_request`,
    "X-Amz-Date": date,
    "X-Amz-Expires": "300",
    "X-Amz-SignedHeaders": signedHeaders,
    "X-Amz-Signature": "a".repeat(64),
  };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null) delete query[key]; else query[key] = value;
  }
  return `https://fatell-aws-s3.s3.ap-northeast-2.amazonaws.com/puppyruby/site-downloads/${release}/downloads/${name}?${new URLSearchParams(query)}`;
}

test("Windows 버전과 릴리스 노트를 엄격하게 검증한다", () => {
  assert.equal(isDesktopVersion("0.10.2.0"), true);
  assert.equal(isDesktopVersion("0.10.2"), false);
  assert.equal(isDesktopVersion("01.10.2.0"), false);
  assert.equal(isDesktopVersion("0.10.70000.0"), false);
  assert.equal(isDesktopReleaseNotes("안전한 새 버전이에요."), true);
  assert.equal(isDesktopReleaseNotes("<script>"), false);
  assert.equal(nextDesktopVersion("0.10.2.9"), "0.10.3.0");
});

test("두 Windows 파일이 정확히 한 번씩 있어야 한다", () => {
  assert.deepEqual(readDesktopReleaseMetadata(metadata), metadata);
  assert.equal(readDesktopReleaseMetadata([metadata[0], metadata[0]]), null);
  const files = new Map<string, Pick<File, "name" | "size">>([
    ["PuppyRuby.exe", { name: "PuppyRuby.exe", size: 1024 }],
    ["PuppyRuby-Setup.exe", { name: "PuppyRuby-Setup.exe", size: 2048 }],
  ]);
  assert.equal(desktopReleaseDraftProblem("0.10.3.0", "업데이트 내용", files, true), "");
  files.delete("PuppyRuby.exe");
  assert.match(desktopReleaseDraftProblem("0.10.3.0", "업데이트 내용", files, true), /PuppyRuby\.exe/);
});

test("S3 업로드는 HTTPS PUT과 서명된 체크섬 헤더만 허용한다", () => {
  const expiresAt = Date.now() + 300_000;
  const valid = {
    release,
    uploads: metadata.map(file => ({ name: file.name, required: true, method: "PUT",
      uploadUrl: signedUrl(file.name, expiresAt), headers: { ...headers, "content-disposition": `attachment; filename="${file.name}"` }, expiresAt })),
  };
  assert.ok(readDesktopReleasePreparation(valid, metadata));
  assert.equal(readDesktopReleasePreparation({ ...valid, uploads: [
    { ...valid.uploads[0], uploadUrl: "http://bucket.example/file" }, valid.uploads[1],
  ] }, metadata), null);
  assert.equal(readDesktopReleasePreparation({ ...valid, uploads: [
    { ...valid.uploads[0], uploadUrl: signedUrl("PuppyRuby.exe", expiresAt).replace("fatell-aws-s3", "other-bucket") }, valid.uploads[1],
  ] }, metadata), null);
  assert.equal(readDesktopReleasePreparation({ ...valid, uploads: [
    { ...valid.uploads[0], uploadUrl: signedUrl("PuppyRuby.exe", expiresAt, { "X-Amz-Signature": null }) }, valid.uploads[1],
  ] }, metadata), null);
  assert.equal(readDesktopReleasePreparation({ ...valid, uploads: [
    { ...valid.uploads[0], uploadUrl: signedUrl("PuppyRuby.exe", expiresAt, { "X-Amz-SignedHeaders": "host" }) }, valid.uploads[1],
  ] }, metadata), null);
  assert.equal(readDesktopReleasePreparation({ ...valid, uploads: [
    { ...valid.uploads[0], uploadUrl: signedUrl("PuppyRuby.exe", expiresAt).replace(`/${release}/`, "/fedcba9876543210/") }, valid.uploads[1],
  ] }, metadata), null);
  assert.equal(readDesktopReleasePreparation({ ...valid, uploads: [
    { ...valid.uploads[0], headers: { ...headers, "x-amz-checksum-sha256": "B".repeat(43) + "=" } }, valid.uploads[1],
  ] }, metadata), null);
});

test("이미 존재하는 파일은 업로드 URL 없이 건너뛸 수 있다", () => {
  const prepared = readDesktopReleasePreparation({ release: "fedcba9876543210", uploads: [
    { name: "PuppyRuby.exe", required: false, uploadUrl: null, headers: null },
    { name: "PuppyRuby-Setup.exe", required: false },
  ] }, metadata);
  assert.deepEqual(prepared, { release: "fedcba9876543210", uploads: [
    { name: "PuppyRuby.exe", required: false }, { name: "PuppyRuby-Setup.exe", required: false },
  ] });
});
