package com.puppyruby.admin;

import jakarta.annotation.PreDestroy;
import java.io.IOException;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider;
import software.amazon.awssdk.auth.credentials.AwsSessionCredentials;
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.model.ChecksumMode;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Exception;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.PutObjectPresignRequest;

@Component
class S3DesktopReleaseObjectStore implements DesktopReleaseObjectStore {
    private static final int MAX_POINTER_BYTES = 8192;
    private static final String BINARY_PATTERN = "puppyruby/site-downloads/[a-f0-9]{16}/downloads/PuppyRuby(?:-Setup)?\\.exe";
    private static final String SIDECAR_PATTERN = "puppyruby/site-downloads/[a-f0-9]{16}/downloads/PuppyRuby(?:-Setup)?\\.sha256";

    private final DesktopReleaseSettings settings;
    private final AwsCredentialsProvider credentials;
    private S3Client client;
    private S3Presigner presigner;

    @Autowired
    S3DesktopReleaseObjectStore(DesktopReleaseSettings settings,
                                @Value("${AWS_ACCESS_KEY_ID:}") String accessKeyId,
                                @Value("${AWS_SECRET_ACCESS_KEY:}") String secretAccessKey,
                                @Value("${AWS_SESSION_TOKEN:}") String sessionToken) {
        this.settings = settings;
        this.credentials = credentialsProvider(accessKeyId, secretAccessKey, sessionToken);
    }

    S3DesktopReleaseObjectStore(DesktopReleaseSettings settings) { this(settings, "", "", ""); }

    static AwsCredentialsProvider credentialsProvider(String accessKeyId, String secretAccessKey, String sessionToken) {
        if (accessKeyId == null || accessKeyId.isBlank() || secretAccessKey == null || secretAccessKey.isBlank())
            return DefaultCredentialsProvider.builder().build();
        if (sessionToken != null && !sessionToken.isBlank())
            return StaticCredentialsProvider.create(AwsSessionCredentials.create(accessKeyId, secretAccessKey, sessionToken));
        return StaticCredentialsProvider.create(AwsBasicCredentials.create(accessKeyId, secretAccessKey));
    }

    private synchronized void initialize() {
        if (client != null) return;
        Region region = Region.of(settings.region);
        client = S3Client.builder().region(region).credentialsProvider(credentials)
            .overrideConfiguration(configuration -> configuration.apiCallTimeout(Duration.ofSeconds(30))
                .apiCallAttemptTimeout(Duration.ofSeconds(15))).build();
        presigner = S3Presigner.builder().region(region).credentialsProvider(credentials)
            .serviceConfiguration(S3Configuration.builder().checksumValidationEnabled(false).build()).build();
    }

    @Override
    public SignedUpload presign(UploadObject upload, int ttlSeconds) {
        requireBinary(upload);
        try {
            initialize();
            PutObjectRequest object = request(upload).ifNoneMatch("*").build();
            var signed = presigner.presignPutObject(PutObjectPresignRequest.builder()
                .signatureDuration(Duration.ofSeconds(ttlSeconds)).putObjectRequest(object).build());
            var headers = new LinkedHashMap<String, String>();
            signed.signedHeaders().forEach((name, values) -> {
                String lower = name.toLowerCase(Locale.ROOT);
                // Fetch supplies these two browser-controlled headers itself.
                if (!lower.equals("host") && !lower.equals("content-length"))
                    headers.put(lower, String.join(",", values));
            });
            return new SignedUpload(signed.url().toString(), Map.copyOf(headers));
        } catch (ResponseStatusException error) { throw error; }
        catch (RuntimeException error) { throw unavailable(); }
    }

    @Override
    public Head head(String key) {
        requireAssetKey(key);
        try {
            initialize();
            var value = client.headObject(HeadObjectRequest.builder().bucket(DesktopReleaseSettings.BUCKET)
                .key(key).checksumMode(ChecksumMode.ENABLED).build());
            return new Head(value.contentLength() == null ? -1 : value.contentLength(), value.checksumSHA256(),
                value.contentType(), value.contentDisposition(), value.cacheControl(), Map.copyOf(value.metadata()));
        } catch (S3Exception error) {
            if (error.statusCode() == 404) return null;
            throw unavailable();
        } catch (RuntimeException error) { throw unavailable(); }
    }

    @Override
    public byte[] readRange(String key, long first, long last) {
        requireBinaryKey(key);
        if (first < 0 || last < first || last - first + 1 > DesktopPeFileVersion.MAX_RANGE_BYTES
            || last >= DesktopReleaseSettings.MAX_FILE_BYTES)
            throw new IllegalArgumentException("Windows 실행 파일 검사 범위를 확인해 주세요.");
        int expected = Math.toIntExact(last - first + 1);
        try {
            initialize();
            try (var response = client.getObject(GetObjectRequest.builder().bucket(DesktopReleaseSettings.BUCKET)
                .key(key).range("bytes=" + first + "-" + last).build())) {
                try {
                    Long length = response.response().contentLength();
                    if (length == null || length != expected) throw conflict("실행 파일의 PE 헤더를 확인할 수 없어요.");
                    byte[] bytes = response.readNBytes(expected + 1);
                    if (bytes.length != expected) throw conflict("실행 파일의 PE 헤더를 확인할 수 없어요.");
                    return bytes;
                } finally { response.abort(); }
            }
        } catch (ResponseStatusException error) { throw error; }
        catch (IOException | RuntimeException error) { throw unavailable(); }
    }

    @Override
    public void createText(UploadObject upload, byte[] body) {
        requireSidecar(upload);
        if (body == null || body.length != upload.size()) throw new IllegalArgumentException("체크섬 파일 크기가 맞지 않아요.");
        try {
            initialize();
            client.putObject(request(upload).ifNoneMatch("*").build(), RequestBody.fromBytes(body));
        } catch (S3Exception error) {
            if (error.statusCode() == 412) throw new PreconditionFailed();
            throw unavailable();
        } catch (RuntimeException error) { throw unavailable(); }
    }

    @Override
    public Pointer readPointer() {
        try {
            initialize();
            try (var response = client.getObject(GetObjectRequest.builder().bucket(DesktopReleaseSettings.BUCKET)
                .key(DesktopReleaseSettings.POINTER_KEY).build())) {
                try {
                    Long length = response.response().contentLength();
                    if (length == null || length < 1 || length > MAX_POINTER_BYTES)
                        throw unavailable();
                    byte[] bytes = response.readNBytes(MAX_POINTER_BYTES + 1);
                    if (bytes.length != length) throw unavailable();
                    return new Pointer(bytes, response.response().eTag());
                } finally { response.abort(); }
            }
        } catch (NoSuchKeyException error) { return null; }
        catch (S3Exception error) {
            if (error.statusCode() == 404) return null;
            throw unavailable();
        } catch (ResponseStatusException error) { throw error; }
        catch (IOException | RuntimeException error) { throw unavailable(); }
    }

    @Override
    public void replacePointer(byte[] body, String expectedETag, Map<String, String> metadata) {
        if (body == null || body.length < 1 || body.length > MAX_POINTER_BYTES || metadata == null)
            throw new IllegalArgumentException("업데이트 정보 크기를 확인해 주세요.");
        try {
            initialize();
            var request = PutObjectRequest.builder().bucket(DesktopReleaseSettings.BUCKET)
                .key(DesktopReleaseSettings.POINTER_KEY).contentType("application/json; charset=utf-8")
                .cacheControl(DesktopReleaseSettings.POINTER_CACHE).contentLength((long) body.length)
                .metadata(metadata);
            if (expectedETag == null) request.ifNoneMatch("*"); else request.ifMatch(expectedETag);
            client.putObject(request.build(), RequestBody.fromBytes(body));
        } catch (S3Exception error) {
            if (error.statusCode() == 412) throw new PreconditionFailed();
            throw unavailable();
        } catch (RuntimeException error) { throw unavailable(); }
    }

    private static PutObjectRequest.Builder request(UploadObject upload) {
        return PutObjectRequest.builder().bucket(DesktopReleaseSettings.BUCKET).key(upload.key())
            .contentType(upload.contentType()).contentDisposition(upload.contentDisposition())
            .contentLength(upload.size()).cacheControl(upload.cacheControl())
            .checksumSHA256(upload.checksumBase64()).metadata(Map.of("sha256", upload.sha256Hex()));
    }

    private static void requireBinary(UploadObject upload) {
        if (upload == null || !upload.key().matches(BINARY_PATTERN) || !upload.key().endsWith("/" + upload.name())
            || !DesktopReleaseSettings.EXECUTABLE_TYPE.equals(upload.contentType())
            || !DesktopReleaseSettings.IMMUTABLE_CACHE.equals(upload.cacheControl())
            || !("attachment; filename=\"" + upload.name() + "\"").equals(upload.contentDisposition()))
            throw new IllegalArgumentException("허용되지 않은 Windows 릴리스 업로드예요.");
    }

    private static void requireSidecar(UploadObject upload) {
        if (upload == null || !upload.key().matches(SIDECAR_PATTERN) || !upload.key().endsWith("/" + upload.name())
            || !"text/plain".equals(upload.contentType()) || !DesktopReleaseSettings.IMMUTABLE_CACHE.equals(upload.cacheControl())
            || !("attachment; filename=\"" + upload.name() + "\"").equals(upload.contentDisposition()))
            throw new IllegalArgumentException("허용되지 않은 Windows 체크섬 파일이에요.");
    }

    private static void requireAssetKey(String key) {
        if (key == null || !(key.matches(BINARY_PATTERN) || key.matches(SIDECAR_PATTERN)))
            throw new IllegalArgumentException("Windows 릴리스 S3 경로를 확인해 주세요.");
    }
    private static void requireBinaryKey(String key) {
        if (key == null || !key.matches(BINARY_PATTERN))
            throw new IllegalArgumentException("Windows 실행 파일 S3 경로를 확인해 주세요.");
    }

    private static ResponseStatusException conflict(String message) {
        return new ResponseStatusException(HttpStatus.CONFLICT, message);
    }
    private static ResponseStatusException unavailable() {
        return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Windows 릴리스 저장소에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.");
    }

    @PreDestroy
    synchronized void close() {
        if (presigner != null) presigner.close();
        if (client != null) client.close();
        if (credentials instanceof DefaultCredentialsProvider provider) provider.close();
    }
}
