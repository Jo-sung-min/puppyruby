package com.puppyruby.admin;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.HashMap;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.AwsSessionCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

class S3DesktopReleaseObjectStoreTest {
    @Test
    void realOfflineSignatureBindsEveryRequiredImmutableUploadHeader() {
        var settings = new DesktopReleaseSettings(true, "ap-northeast-2", 300);
        try (var signer = S3Presigner.builder().region(Region.AP_NORTHEAST_2)
            .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create(
                "OFFLINE_TEST_ACCESS_KEY", "offline-test-secret-not-a-real-credential"))).build()) {
            var store = new S3DesktopReleaseObjectStore(settings);
            ReflectionTestUtils.setField(store, "client", mock(S3Client.class));
            ReflectionTestUtils.setField(store, "presigner", signer);
            String checksum = Base64.getEncoder().encodeToString(new byte[32]);
            var upload = new DesktopReleaseObjectStore.UploadObject(
                "puppyruby/site-downloads/0123456789abcdef/downloads/PuppyRuby-Setup.exe", "PuppyRuby-Setup.exe",
                1234, checksum, "0".repeat(64), DesktopReleaseSettings.EXECUTABLE_TYPE,
                "attachment; filename=\"PuppyRuby-Setup.exe\"", DesktopReleaseSettings.IMMUTABLE_CACHE);
            var signed = store.presign(upload, 300);
            String url = URLDecoder.decode(signed.url(), StandardCharsets.UTF_8);
            assertTrue(url.startsWith("https://fatell-aws-s3.s3.ap-northeast-2.amazonaws.com/puppyruby/site-downloads/0123456789abcdef/downloads/PuppyRuby-Setup.exe"));
            for (String header : new String[] {"content-type", "content-disposition", "cache-control", "x-amz-checksum-sha256", "x-amz-meta-sha256", "if-none-match"}) {
                assertTrue(signed.headers().containsKey(header), header);
                assertTrue(url.toLowerCase().contains(header), header);
            }
            assertEquals(Set.of("content-type", "content-disposition", "cache-control", "x-amz-checksum-sha256",
                "x-amz-meta-sha256", "if-none-match"), signed.headers().keySet());
            var query = query(signed.url());
            assertEquals(Set.of("X-Amz-Algorithm", "X-Amz-Credential", "X-Amz-Date", "X-Amz-Expires",
                "X-Amz-SignedHeaders", "X-Amz-Signature"), query.keySet());
            assertEquals("cache-control;content-disposition;content-length;content-type;host;if-none-match;"
                + "x-amz-checksum-sha256;x-amz-meta-sha256", query.get("X-Amz-SignedHeaders"));
            assertEquals("*", signed.headers().get("if-none-match"));
            assertEquals(checksum, signed.headers().get("x-amz-checksum-sha256"));
            assertFalse(signed.headers().containsKey("host"));
            assertFalse(signed.headers().containsKey("content-length"));
        }
    }

    @Test
    void temporaryCredentialsAddOnlyTheOptionalSecurityTokenQueryParameter() {
        var settings = new DesktopReleaseSettings(true, "ap-northeast-2", 300);
        try (var signer = S3Presigner.builder().region(Region.AP_NORTHEAST_2)
            .credentialsProvider(StaticCredentialsProvider.create(AwsSessionCredentials.create(
                "OFFLINE_TEST_ACCESS_KEY", "offline-test-secret-not-a-real-credential", "temporary-session-token"))).build()) {
            var store = new S3DesktopReleaseObjectStore(settings);
            ReflectionTestUtils.setField(store, "client", mock(S3Client.class)); ReflectionTestUtils.setField(store, "presigner", signer);
            String checksum = Base64.getEncoder().encodeToString(new byte[32]);
            var upload = new DesktopReleaseObjectStore.UploadObject(
                "puppyruby/site-downloads/0123456789abcdef/downloads/PuppyRuby.exe", "PuppyRuby.exe", 1234,
                checksum, "0".repeat(64), DesktopReleaseSettings.EXECUTABLE_TYPE,
                "attachment; filename=\"PuppyRuby.exe\"", DesktopReleaseSettings.IMMUTABLE_CACHE);
            var query = query(store.presign(upload, 300).url());
            assertEquals(Set.of("X-Amz-Algorithm", "X-Amz-Credential", "X-Amz-Date", "X-Amz-Expires",
                "X-Amz-SignedHeaders", "X-Amz-Signature", "X-Amz-Security-Token"), query.keySet());
            assertEquals("temporary-session-token", query.get("X-Amz-Security-Token"));
            assertEquals("cache-control;content-disposition;content-length;content-type;host;if-none-match;"
                + "x-amz-checksum-sha256;x-amz-meta-sha256", query.get("X-Amz-SignedHeaders"));
        }
    }

    @Test
    void storeRejectsEveryPresignOutsideTheExactBucketPrefixReleaseAndFileAllowlist() {
        var store = new S3DesktopReleaseObjectStore(new DesktopReleaseSettings(true, "ap-northeast-2", 300));
        String checksum = Base64.getEncoder().encodeToString(new byte[32]);
        for (String key : new String[] {
            "other/site-downloads/0123456789abcdef/downloads/PuppyRuby.exe",
            "puppyruby/site-downloads/not-a-release/downloads/PuppyRuby.exe",
            "puppyruby/site-downloads/0123456789abcdef/downloads/Other.exe",
            "puppyruby/site-downloads/0123456789abcdef/PuppyRuby.exe"
        }) {
            var upload = new DesktopReleaseObjectStore.UploadObject(key, "PuppyRuby.exe", 1, checksum, "0".repeat(64),
                DesktopReleaseSettings.EXECUTABLE_TYPE, "attachment; filename=\"PuppyRuby.exe\"", DesktopReleaseSettings.IMMUTABLE_CACHE);
            assertThrows(IllegalArgumentException.class, () -> store.presign(upload, 300));
        }
        store.close();
    }

    static HashMap<String, String> query(String url) {
        var query = new HashMap<String, String>();
        for (String pair : java.net.URI.create(url).getRawQuery().split("&", -1)) {
            String[] fields = pair.split("=", 2);
            query.put(URLDecoder.decode(fields[0], StandardCharsets.UTF_8),
                URLDecoder.decode(fields.length == 1 ? "" : fields[1], StandardCharsets.UTF_8));
        }
        return query;
    }
}
