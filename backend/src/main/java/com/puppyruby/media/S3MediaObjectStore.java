package com.puppyruby.media;

import jakarta.annotation.PreDestroy;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import software.amazon.awssdk.auth.credentials.*;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.model.*;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.PutObjectPresignRequest;
import java.io.IOException;
import java.time.Duration;
import java.util.*;

@Component
class S3MediaObjectStore implements MediaObjectStore {
    private final MediaSettings settings;
    private final AwsCredentialsProvider credentials;
    private S3Client client;
    private S3Presigner presigner;

    @Autowired
    S3MediaObjectStore(MediaSettings settings,
                       @Value("${AWS_ACCESS_KEY_ID:}") String accessKeyId,
                       @Value("${AWS_SECRET_ACCESS_KEY:}") String secretAccessKey,
                       @Value("${AWS_SESSION_TOKEN:}") String sessionToken) {
        this.settings = settings;
        this.credentials = credentialsProvider(accessKeyId, secretAccessKey, sessionToken);
    }

    S3MediaObjectStore(MediaSettings settings) { this(settings, "", "", ""); }

    static AwsCredentialsProvider credentialsProvider(String accessKeyId, String secretAccessKey, String sessionToken) {
        // Spring also resolves credentials loaded from local dotenv files. Without a complete pair,
        // retain the SDK chain for process credentials, profiles and IAM roles.
        if (accessKeyId == null || accessKeyId.isBlank() || secretAccessKey == null || secretAccessKey.isBlank())
            return DefaultCredentialsProvider.builder().build();
        if (sessionToken != null && !sessionToken.isBlank())
            return StaticCredentialsProvider.create(AwsSessionCredentials.create(accessKeyId, secretAccessKey, sessionToken));
        return StaticCredentialsProvider.create(AwsBasicCredentials.create(accessKeyId, secretAccessKey));
    }

    // Lazily initialize so an installation with uploads disabled needs no AWS credentials or network.
    private synchronized void initialize() {
        if (presigner != null) return;
        var region = Region.of(settings.region);
        client = S3Client.builder().region(region).credentialsProvider(credentials).overrideConfiguration(configuration -> configuration
            .apiCallTimeout(Duration.ofSeconds(20)).apiCallAttemptTimeout(Duration.ofSeconds(10))).build();
        presigner = S3Presigner.builder().region(region).credentialsProvider(credentials)
            .serviceConfiguration(S3Configuration.builder().checksumValidationEnabled(false).build()).build();
    }

    @Override public SignedUpload presign(MediaUpload upload, int ttlSeconds) {
        try {
            initialize();
            var request = presigner.presignPutObject(PutObjectPresignRequest.builder()
                .signatureDuration(Duration.ofSeconds(ttlSeconds))
                .putObjectRequest(PutObjectRequest.builder().bucket(upload.bucket).key(upload.objectKey)
                    .contentType(upload.contentType).contentLength(upload.size).checksumSHA256(upload.sha256).build()).build());
            var headers = new LinkedHashMap<String, String>();
            request.signedHeaders().forEach((name, values) -> {
                // The browser supplies Host and the Blob's Content-Length itself.
                if (!name.equalsIgnoreCase("host") && !name.equalsIgnoreCase("content-length"))
                    headers.put(name, String.join(",", values));
            });
            return new SignedUpload(request.url().toString(), Map.copyOf(headers));
        } catch (RuntimeException error) { throw unavailable(); }
    }

    @Override public StoredImage read(MediaUpload upload, int maxBytes) {
        try {
            initialize();
            try (var response = client.getObject(GetObjectRequest.builder().bucket(upload.bucket).key(upload.objectKey).build())) {
                try {
                    var object = response.response();
                    if (object.contentLength() == null || object.contentLength() != upload.size || object.contentLength() > maxBytes)
                        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "등록한 크기와 사진 크기가 달라요. 다시 올려 주세요.");
                    byte[] bytes = response.readNBytes(maxBytes + 1);
                    return new StoredImage(object.contentType(), object.contentLength(), bytes);
                } finally {
                    // Apache's close() can drain an oversized response. Abort prevents any unbounded read.
                    response.abort();
                }
            }
        } catch (NoSuchKeyException error) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "아직 사진 업로드가 완료되지 않았어요. 다시 시도해 주세요.");
        } catch (ResponseStatusException error) { throw error; }
        catch (IOException | RuntimeException error) { throw unavailable(); }
    }

    private static ResponseStatusException unavailable() {
        return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "사진 저장소에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.");
    }

    @PreDestroy synchronized void close() {
        if (presigner != null) presigner.close();
        if (client != null) client.close();
        if (credentials instanceof DefaultCredentialsProvider provider) provider.close();
    }
}
